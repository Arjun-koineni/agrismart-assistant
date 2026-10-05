import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { fieldsTable } from "./fields";

export const chatRoleEnum = pgEnum("agri_chat_role", ["user", "assistant"]);

export const chatMessagesTable = pgTable(
  "agri_chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    fieldId: uuid("field_id").references(() => fieldsTable.id, {
      onDelete: "set null",
    }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agri_chat_messages_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("agri_chat_messages_field_id_idx").on(table.fieldId),
    pgPolicy("agri_chat_messages_user_isolation", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
