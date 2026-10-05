import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  advisoriesTable,
  fieldsTable,
  withUserTransaction,
} from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;

  const result = await withUserTransaction(userId, async (tx) => {
    const fields = await tx
      .select()
      .from(fieldsTable)
      .where(eq(fieldsTable.userId, userId));
    const advisoryRows = await tx
      .select({
        advisory: advisoriesTable,
        fieldName: fieldsTable.fieldName,
        currentCrop: fieldsTable.currentCrop,
      })
      .from(advisoriesTable)
      .innerJoin(fieldsTable, eq(advisoriesTable.fieldId, fieldsTable.id))
      .where(eq(advisoriesTable.userId, userId))
      .orderBy(desc(advisoriesTable.createdAt))
      .limit(500);

    return { fields, advisoryRows };
  });

  const latestByField = new Map<
    string,
    (typeof result.advisoryRows)[number]
  >();
  for (const row of result.advisoryRows) {
    if (!latestByField.has(row.advisory.fieldId)) {
      latestByField.set(row.advisory.fieldId, row);
    }
  }
  const latestAdvisories = [...latestByField.values()];
  const recentAdvisories = result.advisoryRows.slice(0, 5).map((row) => ({
    id: row.advisory.id,
    fieldId: row.advisory.fieldId,
    fieldName: row.fieldName,
    currentCrop: row.currentCrop,
    cropStage: row.advisory.cropStage,
    healthScore: row.advisory.healthScore,
    summary: row.advisory.summary,
    createdAt: row.advisory.createdAt,
  }));
  const averageHealthScore =
    latestAdvisories.length === 0
      ? null
      : latestAdvisories.reduce(
          (total, row) => total + row.advisory.healthScore,
          0,
        ) / latestAdvisories.length;

  res.json(
    GetDashboardResponse.parse({
      activeFields: result.fields.length,
      totalAreaAcres: result.fields.reduce(
        (total, field) => total + field.areaAcres,
        0,
      ),
      averageHealthScore,
      healthAlerts: latestAdvisories.filter(
        (row) => row.advisory.healthScore < 60,
      ).length,
      recentAdvisories,
    }),
  );
});

export default router;
