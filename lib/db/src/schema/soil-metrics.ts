import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { fieldsTable } from "./fields";

export const soilUnitEnum = pgEnum("agri_soil_unit", ["kg/ha", "ppm"]);

export const soilMetricsTable = pgTable(
  "agri_soil_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    nitrogen: doublePrecision("nitrogen").notNull(),
    phosphorus: doublePrecision("phosphorus").notNull(),
    potassium: doublePrecision("potassium").notNull(),
    phLevel: doublePrecision("ph_level").notNull(),
    organicCarbon: doublePrecision("organic_carbon"),
    unit: soilUnitEnum("unit").notNull(),
    testDate: date("test_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agri_soil_metrics_field_id_idx").on(table.fieldId),
    pgPolicy("agri_soil_metrics_user_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`exists (select 1 from agri_fields f where f.id = ${table.fieldId} and f.user_id = current_setting('app.current_user_id', true))`,
      withCheck: sql`exists (select 1 from agri_fields f where f.id = ${table.fieldId} and f.user_id = current_setting('app.current_user_id', true))`,
    }),
  ],
).enableRLS();

export const insertSoilMetricSchema = createInsertSchema(soilMetricsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSoilMetric = z.infer<typeof insertSoilMetricSchema>;
export type SoilMetricRow = typeof soilMetricsTable.$inferSelect;
