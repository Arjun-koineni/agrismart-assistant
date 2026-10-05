import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const settingsTable = pgTable(
  "agri_user_settings",
  {
    userId: text("user_id").primaryKey(),
    units: text("units").notNull().default("metric"),
    region: text("region"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pgPolicy("agri_user_settings_user_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  updatedAt: true,
});
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type UserSettingsRow = typeof settingsTable.$inferSelect;
