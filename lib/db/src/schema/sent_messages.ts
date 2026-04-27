import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const sentMessagesTable = pgTable("sent_messages", {
  id: serial("id").primaryKey(),
  chatNumber: text("chat_number").notNull(),
  templateId: text("template_id").notNull(),
  messageText: text("message_text").notNull(),
  sentBy: text("sent_by").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  chatguruResponse: jsonb("chatguru_response"),
  status: text("status").notNull(),
});

export type SentMessage = typeof sentMessagesTable.$inferSelect;
