import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  GetChatHistoryQueryParams,
  GetChatHistoryResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import {
  advisoriesTable,
  chatMessagesTable,
  fieldsTable,
  soilMetricsTable,
  withUserTransaction,
} from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import { aiRateLimit } from "../lib/ai-rate-limit";
import { askAgronomist } from "../lib/agri-ai";

const router: IRouter = Router();

router.get("/chat/history", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const query = {
    ...req.query,
    ...(req.query.fieldId === "null" ? { fieldId: null } : {}),
  };
  const params = GetChatHistoryQueryParams.safeParse(query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await withUserTransaction(userId, async (tx) => {
    if (params.data.fieldId) {
      const [field] = await tx
        .select({ id: fieldsTable.id })
        .from(fieldsTable)
        .where(
          and(
            eq(fieldsTable.id, params.data.fieldId),
            eq(fieldsTable.userId, userId),
          ),
        )
        .limit(1);
      if (!field) return null;
    }
    const fieldFilter =
      params.data.fieldId === undefined
        ? undefined
        : params.data.fieldId === null
          ? isNull(chatMessagesTable.fieldId)
          : eq(chatMessagesTable.fieldId, params.data.fieldId);
    const whereClause = fieldFilter
      ? and(eq(chatMessagesTable.userId, userId), fieldFilter)
      : eq(chatMessagesTable.userId, userId);
    return tx
      .select()
      .from(chatMessagesTable)
      .where(whereClause)
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(100);
  });

  if (rows === null) {
    res.status(404).json({ error: "Field not found" });
    return;
  }
  res.json(GetChatHistoryResponse.parse(rows.reverse()));
});

router.post("/chat/message", aiRateLimit, async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const content = body.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Message cannot be blank" });
    return;
  }

  const fieldId = body.data.fieldId ?? null;
  const context = await withUserTransaction(userId, async (tx) => {
    let fieldContext: Record<string, unknown> | null = null;
    if (fieldId) {
      const [field] = await tx
        .select()
        .from(fieldsTable)
        .where(
          and(eq(fieldsTable.id, fieldId), eq(fieldsTable.userId, userId)),
        )
        .limit(1);
      if (!field) return null;

      const [latestSoilMetric] = await tx
        .select()
        .from(soilMetricsTable)
        .where(eq(soilMetricsTable.fieldId, field.id))
        .orderBy(desc(soilMetricsTable.testDate), desc(soilMetricsTable.createdAt))
        .limit(1);
      const [latestAdvisory] = await tx
        .select()
        .from(advisoriesTable)
        .where(eq(advisoriesTable.fieldId, field.id))
        .orderBy(desc(advisoriesTable.createdAt))
        .limit(1);
      fieldContext = {
        field: {
          name: field.fieldName,
          location: field.location,
          areaAcres: field.areaAcres,
          soilType: field.soilType,
          currentCrop: field.currentCrop,
        },
        latestSoilMetric: latestSoilMetric ?? null,
        latestAdvisory: latestAdvisory
          ? {
              cropStage: latestAdvisory.cropStage,
              healthScore: latestAdvisory.healthScore,
              summary: latestAdvisory.summary,
              report: latestAdvisory.rawAiResponse,
            }
          : null,
      };
    }

    const fieldFilter = fieldId
      ? eq(chatMessagesTable.fieldId, fieldId)
      : isNull(chatMessagesTable.fieldId);
    const history = await tx
      .select({
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
      })
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.userId, userId), fieldFilter))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(12);
    return { fieldContext, history: history.reverse() };
  });
  if (!context) {
    res.status(404).json({ error: "Field not found" });
    return;
  }

  let answer: string;
  try {
    answer = await askAgronomist({
      message: content,
      fieldContext: context.fieldContext,
      history: context.history,
    });
  } catch (error) {
    req.log.error({ err: error }, "Agronomist chat request failed");
    res.status(502).json({
      error: "AgriSmart could not answer right now. Please try again shortly.",
    });
    return;
  }

  const messages = await withUserTransaction(userId, async (tx) => {
    const [userMessage] = await tx
      .insert(chatMessagesTable)
      .values({ userId, fieldId, role: "user", content })
      .returning();
    const [assistantMessage] = await tx
      .insert(chatMessagesTable)
      .values({ userId, fieldId, role: "assistant", content: answer })
      .returning();
    return { userMessage, assistantMessage };
  });

  res.json(SendChatMessageResponse.parse(messages));
});

export default router;
