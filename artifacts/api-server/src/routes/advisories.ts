import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  GenerateAdvisoryBody,
  GenerateAdvisoryResponse,
  GetAdvisoryParams,
  GetAdvisoryResponse,
  ListAdvisoriesResponse,
} from "@workspace/api-zod";
import {
  advisoriesTable,
  fieldsTable,
  soilMetricsTable,
  withUserTransaction,
} from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import { aiRateLimit } from "../lib/ai-rate-limit";
import { generateAdvisory } from "../lib/agri-ai";

const router: IRouter = Router();

router.get("/advisories", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;

  const rows = await withUserTransaction(userId, (tx) =>
    tx
      .select({
        advisory: advisoriesTable,
        fieldName: fieldsTable.fieldName,
        currentCrop: fieldsTable.currentCrop,
      })
      .from(advisoriesTable)
      .innerJoin(fieldsTable, eq(advisoriesTable.fieldId, fieldsTable.id))
      .where(eq(advisoriesTable.userId, userId))
      .orderBy(desc(advisoriesTable.createdAt))
      .limit(40),
  );
  res.json(
    ListAdvisoriesResponse.parse(
      rows.map(({ advisory, fieldName, currentCrop }) => ({
        id: advisory.id,
        fieldId: advisory.fieldId,
        fieldName,
        currentCrop,
        cropStage: advisory.cropStage,
        healthScore: advisory.healthScore,
        summary: advisory.summary,
        createdAt: advisory.createdAt.toISOString(),
      })),
    ),
  );
});

router.post(
  "/advisories/generate",
  aiRateLimit,
  async (req, res): Promise<void> => {
    const userId = getRequestUserId(req, res);
    if (!userId) return;
    const body = GenerateAdvisoryBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const field = await withUserTransaction(userId, async (tx) => {
      const [ownedField] = await tx
        .select()
        .from(fieldsTable)
        .where(
          and(
            eq(fieldsTable.id, body.data.fieldId),
            eq(fieldsTable.userId, userId),
          ),
        )
        .limit(1);
      return ownedField ?? null;
    });
    if (!field) {
      res.status(404).json({ error: "Field not found" });
      return;
    }

    try {
      const aiOutput = await generateAdvisory({
        fieldName: field.fieldName,
        location: field.location,
        areaAcres: field.areaAcres,
        soilType: field.soilType,
        currentCrop: field.currentCrop,
        cropStage: body.data.cropStage,
        nitrogen: body.data.nitrogen,
        phosphorus: body.data.phosphorus,
        potassium: body.data.potassium,
        phLevel: body.data.phLevel,
        organicCarbon: body.data.organicCarbon,
        unit: body.data.unit,
        notes: body.data.notes,
        weather: body.data.weather,
      });

      const created = await withUserTransaction(userId, async (tx) => {
        const [soilMetric] = await tx
          .insert(soilMetricsTable)
          .values({
            fieldId: field.id,
            nitrogen: body.data.nitrogen,
            phosphorus: body.data.phosphorus,
            potassium: body.data.potassium,
            phLevel: body.data.phLevel,
            organicCarbon: body.data.organicCarbon ?? null,
            unit: body.data.unit,
            testDate: new Date().toISOString().slice(0, 10),
          })
          .returning();

        const [advisory] = await tx
          .insert(advisoriesTable)
          .values({
            fieldId: field.id,
            userId,
            cropStage: body.data.cropStage,
            healthScore: aiOutput.healthScore,
            summary: aiOutput.summary,
            rawAiResponse: aiOutput,
          })
          .returning();

        return { advisory, soilMetric };
      });

      const report = {
        id: created.advisory.id,
        fieldId: created.advisory.fieldId,
        fieldName: field.fieldName,
        currentCrop: field.currentCrop,
        cropStage: created.advisory.cropStage,
        ...created.advisory.rawAiResponse,
        createdAt: created.advisory.createdAt.toISOString(),
      };
      res.status(201).json(GenerateAdvisoryResponse.parse(report));
    } catch (error) {
      req.log.error({ err: error }, "Failed to generate crop advisory");
      res.status(502).json({
        error:
          "AgriSmart could not generate a valid advisory right now. Please try again shortly.",
      });
    }
  },
);

router.get("/advisories/:id", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = GetAdvisoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await withUserTransaction(userId, async (tx) => {
    const [result] = await tx
      .select({
        advisory: advisoriesTable,
        fieldName: fieldsTable.fieldName,
        currentCrop: fieldsTable.currentCrop,
      })
      .from(advisoriesTable)
      .innerJoin(fieldsTable, eq(advisoriesTable.fieldId, fieldsTable.id))
      .where(
        and(
          eq(advisoriesTable.id, params.data.id),
          eq(advisoriesTable.userId, userId),
        ),
      )
      .limit(1);
    return result ?? null;
  });

  if (!row) {
    res.status(404).json({ error: "Advisory not found" });
    return;
  }
  res.json(
    GetAdvisoryResponse.parse({
      id: row.advisory.id,
      fieldId: row.advisory.fieldId,
      fieldName: row.fieldName,
      currentCrop: row.currentCrop,
      cropStage: row.advisory.cropStage,
      ...row.advisory.rawAiResponse,
      createdAt: row.advisory.createdAt.toISOString(),
    }),
  );
});

export default router;
