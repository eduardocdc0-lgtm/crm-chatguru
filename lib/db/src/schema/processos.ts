import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { conversationsTable } from "./conversations";

export const processosTable = pgTable("processos", {
  id: serial("id").primaryKey(),
  numeroProcesso: text("numero_processo"),
  clienteNome: text("cliente_nome").notNull(),
  status: text("status").notNull().default("em_andamento"),
  tipo: text("tipo"), // LAUDO_SUS_PE, AUX_DOENCA, BPC, etc.
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  honorarioValor: numeric("honorario_valor", { precision: 10, scale: 2 }),
  honorarioStatus: text("honorario_status").notNull().default("pendente"), // pendente | recebido
  responsavelId: integer("responsavel_id").references(() => agentsTable.id),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tarefasTable = pgTable("tarefas", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id").references(() => processosTable.id),
  descricao: text("descricao").notNull(),
  responsavelId: integer("responsavel_id").references(() => agentsTable.id),
  status: text("status").notNull().default("pendente"), // pendente | concluida | cancelada
  prazo: timestamp("prazo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Processo = typeof processosTable.$inferSelect;
export type Tarefa = typeof tarefasTable.$inferSelect;
