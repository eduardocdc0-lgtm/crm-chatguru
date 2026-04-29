import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappNumbersTable = pgTable("whatsapp_numbers", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // ex: "5581918506470"
  label: text("label").notNull(), // "Comercial" ou "Base"
  team: text("team").notNull(), // "COMERCIAL_TRAFEGO" ou "ATENDIMENTO"
  active: boolean("active").default(true).notNull(),
  chatguruPhoneId: text("chatguru_phone_id"), // ID do telefone no ChatGuru (encontrado em Configurações → Números)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsappNumberSchema = createInsertSchema(whatsappNumbersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappNumber = z.infer<typeof insertWhatsappNumberSchema>;
export type WhatsappNumber = typeof whatsappNumbersTable.$inferSelect;
