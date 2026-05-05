import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  team: text("team").notNull(), // "COMERCIAL_TRAFEGO" ou "ATENDIMENTO"
  active: boolean("active").default(true).notNull(),
  // Identificador do agente no painel ChatGuru (email ou UUID — confirmar
  // formato com 1 chamada de teste à API antes de popular).
  chatguruUserId: text("chatguru_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
