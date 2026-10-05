import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { settingsTable, withUserTransaction } from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/settings", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;

  const settings = await withUserTransaction(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.userId, userId))
      .limit(1);
    return { units: row?.units ?? "metric", region: row?.region ?? null };
  });
  res.json(GetSettingsResponse.parse(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req, res);
  if (!userId) return;
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "At least one setting is required" });
    return;
  }

  const settings = await withUserTransaction(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.userId, userId))
      .limit(1);
    const updated = {
      userId,
      units: body.data.units ?? existing?.units ?? "metric",
      region:
        body.data.region !== undefined
          ? body.data.region
          : (existing?.region ?? null),
      updatedAt: new Date(),
    };
    const [row] = await tx
      .insert(settingsTable)
      .values(updated)
      .onConflictDoUpdate({
        target: settingsTable.userId,
        set: {
          units: updated.units,
          region: updated.region,
          updatedAt: updated.updatedAt,
        },
      })
      .returning();
    return { units: row.units, region: row.region };
  });

  res.json(UpdateSettingsResponse.parse(settings));
});

export default router;
