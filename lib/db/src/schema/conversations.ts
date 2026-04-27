import { pgTable, serial, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { whatsappNumbersTable } from "./whatsapp_numbers";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  chatNumber: text("chat_number").notNull().unique(),
  contactName: text("contact_name"),
  status: text("status").notNull().default("open"),
  assignedAgent: text("assigned_agent"), // mantido para compatibilidade
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  contextData: jsonb("context_data"),
  // Novos campos CRM
  whatsappNumberId: integer("whatsapp_number_id").references(() => whatsappNumbersTable.id),
  agentId: integer("agent_id").references(() => agentsTable.id),
  campaign: text("campaign"), // LAUDO_SUS_PE / AUX_DOENCA / etc / INDEFINIDA
  firstMessage: text("first_message"),
  discardReason: text("discard_reason"),
  notes: text("notes"), // anotações livres
  disease: text("disease"), // CID / condição: FIBROMIALGIA, TDAH, etc.
  diseaseNote: text("disease_note"), // texto livre quando disease = "OUTRA"
  coolingAlert: text("cooling_alert"), // null | "esfriando" | "urgente"
  coolingAlertAt: timestamp("cooling_alert_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const webhookEventsTable = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  chatNumber: text("chat_number"),
  rawPayload: text("raw_payload").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertWebhookEventSchema = createInsertSchema(webhookEventsTable).omit({
  id: true,
  receivedAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
