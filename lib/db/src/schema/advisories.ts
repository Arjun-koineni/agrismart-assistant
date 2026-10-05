import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { fieldsTable } from "./fields";

export interface AdvisoryAiOutput {
  healthScore: number;
  summary: string;
  nutrientDeficiencies: {
    nutrient: string;
    severity: "Low" | "Moderate" | "Critical";
    recommendation: string;
  }[];
  fertilizerPlan: {
    fertilizerName: string;
    applicationRateKgPerAcre: number;
    applicationMethod:
      | "Broadcast"
      | "Fertigation"
      | "Foliar Spray"
      | "Band Placement";
    timing: string;
  }[];
  pestDiseaseRisks: {
    threatName: string;
    riskLevel: "Low" | "Medium" | "High";
    preventativeAction: string;
  }[];
  irrigationAdvice: string;
  estimatedYieldImpact: string;
}

export const advisoriesTable = pgTable(
  "agri_advisories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    cropStage: text("crop_stage").notNull(),
    healthScore: integer("health_score").notNull(),
    summary: text("summary").notNull(),
    rawAiResponse: jsonb("raw_ai_response")
      .$type<AdvisoryAiOutput>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agri_advisories_field_id_idx").on(table.fieldId),
    index("agri_advisories_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    pgPolicy("agri_advisories_user_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertAdvisorySchema = createInsertSchema(advisoriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdvisory = z.infer<typeof insertAdvisorySchema>;
export type AdvisoryRow = typeof advisoriesTable.$inferSelect;
