import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const fieldsTable = pgTable(
  "agri_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    fieldName: text("field_name").notNull(),
    location: text("location").notNull(),
    areaAcres: doublePrecision("area_acres").notNull(),
    soilType: text("soil_type").notNull(),
    currentCrop: text("current_crop").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agri_fields_user_id_idx").on(table.userId),
    pgPolicy("agri_fields_user_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertFieldSchema = createInsertSchema(fieldsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertField = z.infer<typeof insertFieldSchema>;
export type FarmFieldRow = typeof fieldsTable.$inferSelect;
