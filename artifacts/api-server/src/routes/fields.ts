import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  AddSoilMetricBody,
  AddSoilMetricParams,
  CreateFieldBody,
  DeleteFieldParams,
  GetFieldParams,
  GetFieldResponse,
  ListFieldsResponse,
  ListSoilMetricsParams,
  ListSoilMetricsResponse,
  UpdateFieldBody,
  UpdateFieldParams,
  UpdateFieldResponse,
  CreateFieldResponse,
  AddSoilMetricResponse,
} from "@workspace/api-zod";
import {
  advisoriesTable,
  fieldsTable,
  soilMetricsTable,
  withUserTransaction,
} from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

function serializeField(
  field: typeof fieldsTable.$inferSelect,
): typeof fieldsTable.$inferSelect {
  return field;
}

function serializeSoilMetric(
  metric: typeof soilMetricsTable.$inferSelect,
): typeof soilMetricsTable.$inferSelect {
  return metric;
}

router.get("/fields", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;

  const fields = await withUserTransaction(userId, (tx) =>
    tx
      .select()
      .from(fieldsTable)
      .where(eq(fieldsTable.userId, userId))
      .orderBy(desc(fieldsTable.updatedAt)),
  );
  res.json(ListFieldsResponse.parse(fields.map(serializeField)));
});

router.post("/fields", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;

  const parsed = CreateFieldBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [field] = await withUserTransaction(userId, (tx) =>
    tx
      .insert(fieldsTable)
      .values({
        ...parsed.data,
        fieldName: parsed.data.fieldName.trim(),
        location: parsed.data.location.trim(),
        soilType: parsed.data.soilType.trim(),
        userId,
      })
      .returning(),
  );
  res.status(201).json(CreateFieldResponse.parse(serializeField(field)));
});

router.get("/fields/:id", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = GetFieldParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await withUserTransaction(userId, async (tx) => {
    const [field] = await tx
      .select()
      .from(fieldsTable)
      .where(
        and(
          eq(fieldsTable.id, params.data.id),
          eq(fieldsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!field) return null;

    const [latestSoilMetric] = await tx
      .select()
      .from(soilMetricsTable)
      .where(eq(soilMetricsTable.fieldId, field.id))
      .orderBy(desc(soilMetricsTable.testDate), desc(soilMetricsTable.createdAt))
      .limit(1);

    const recentRows = await tx
      .select({
        advisory: advisoriesTable,
        fieldName: fieldsTable.fieldName,
        currentCrop: fieldsTable.currentCrop,
      })
      .from(advisoriesTable)
      .innerJoin(fieldsTable, eq(advisoriesTable.fieldId, fieldsTable.id))
      .where(and(eq(advisoriesTable.fieldId, field.id), eq(fieldsTable.userId, userId)))
      .orderBy(desc(advisoriesTable.createdAt))
      .limit(5);

    return {
      field,
      latestSoilMetric: latestSoilMetric ?? null,
      recentRows,
    };
  });

  if (!result) {
    res.status(404).json({ error: "Field not found" });
    return;
  }

  const recentAdvisories = result.recentRows.map(({ advisory, fieldName, currentCrop }) => ({
    id: advisory.id,
    fieldId: advisory.fieldId,
    fieldName,
    currentCrop,
    cropStage: advisory.cropStage,
    healthScore: advisory.healthScore,
    summary: advisory.summary,
    createdAt: advisory.createdAt.toISOString(),
  }));
  res.json(
    GetFieldResponse.parse({
      field: serializeField(result.field),
      latestSoilMetric: result.latestSoilMetric
        ? serializeSoilMetric(result.latestSoilMetric)
        : null,
      recentAdvisories,
    }),
  );
});

router.patch("/fields/:id", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = UpdateFieldParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateFieldBody.safeParse(req.body);
  if (!body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({
      error: body.success ? "At least one field value is required" : body.error.message,
    });
    return;
  }

  const [field] = await withUserTransaction(userId, (tx) =>
    tx
      .update(fieldsTable)
      .set({
        ...body.data,
        ...(body.data.fieldName !== undefined
          ? { fieldName: body.data.fieldName.trim() }
          : {}),
        ...(body.data.location !== undefined
          ? { location: body.data.location.trim() }
          : {}),
        ...(body.data.soilType !== undefined
          ? { soilType: body.data.soilType.trim() }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(fieldsTable.id, params.data.id),
          eq(fieldsTable.userId, userId),
        ),
      )
      .returning(),
  );

  if (!field) {
    res.status(404).json({ error: "Field not found" });
    return;
  }
  res.json(UpdateFieldResponse.parse(serializeField(field)));
});

router.delete("/fields/:id", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = DeleteFieldParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await withUserTransaction(userId, (tx) =>
    tx
      .delete(fieldsTable)
      .where(
        and(
          eq(fieldsTable.id, params.data.id),
          eq(fieldsTable.userId, userId),
        ),
      )
      .returning({ id: fieldsTable.id }),
  );
  if (deleted.length === 0) {
    res.status(404).json({ error: "Field not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/fields/:id/soil-metrics", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = ListSoilMetricsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await withUserTransaction(userId, async (tx) => {
    const [field] = await tx
      .select({ id: fieldsTable.id })
      .from(fieldsTable)
      .where(
        and(
          eq(fieldsTable.id, params.data.id),
          eq(fieldsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!field) return null;
    return tx
      .select()
      .from(soilMetricsTable)
      .where(eq(soilMetricsTable.fieldId, field.id))
      .orderBy(desc(soilMetricsTable.testDate), desc(soilMetricsTable.createdAt));
  });
  if (result === null) {
    res.status(404).json({ error: "Field not found" });
    return;
  }
  res.json(ListSoilMetricsResponse.parse(result.map(serializeSoilMetric)));
});

router.post("/fields/:id/soil-metrics", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const params = AddSoilMetricParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddSoilMetricBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const created = await withUserTransaction(userId, async (tx) => {
    const [field] = await tx
      .select({ id: fieldsTable.id })
      .from(fieldsTable)
      .where(
        and(
          eq(fieldsTable.id, params.data.id),
          eq(fieldsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!field) return null;
    const [metric] = await tx
      .insert(soilMetricsTable)
      .values({
        fieldId: field.id,
        ...body.data,
        testDate: body.data.testDate.toISOString().slice(0, 10),
      })
      .returning();
    return metric;
  });
  if (!created) {
    res.status(404).json({ error: "Field not found" });
    return;
  }
  res.status(201).json(AddSoilMetricResponse.parse(serializeSoilMetric(created)));
});

export default router;
