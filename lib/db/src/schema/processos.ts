import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { conversationsTable } from "./conversations";

// tipoFluxo: judicial | adm | salario_maternidade | negociacao
// Mapeamento de campanha → tipoFluxo:
//   LAUDO_SUS_PE, LAUDO_SUS_GERAL, FIBROMIALGIA, PINO_PLACA_PARAFUSO → judicial
//   AUX_DOENCA, AUX_ACIDENTE, BPC, PERICIA_NEGADA → adm
//   SALARIO_MATERNIDADE → salario_maternidade
export const TIPO_FLUXO_MAP: Record<string, string> = {
  LAUDO_SUS_PE: "judicial",
  LAUDO_SUS_GERAL: "judicial",
  FIBROMIALGIA: "judicial",
  PINO_PLACA_PARAFUSO: "judicial",
  AUX_DOENCA: "adm",
  AUX_ACIDENTE: "adm",
  BPC: "adm",
  PERICIA_NEGADA: "judicial",
  SALARIO_MATERNIDADE: "salario_maternidade",
};

export const processosTable = pgTable("processos", {
  id: serial("id").primaryKey(),
  numeroProcesso: text("numero_processo"),
  clienteNome: text("cliente_nome").notNull(),
  status: text("status").notNull().default("em_andamento"),
  // status: em_andamento | aguardando_pericia | pericia_marcada | elaborar_peticao |
  //         protocolado | aguardando_julgamento | sentenca_procedente |
  //         sentenca_improcedente | recurso | encerrado | beneficio_concedido
  tipo: text("tipo"),           // LAUDO_SUS_PE, AUX_DOENCA, BPC, etc. (campanha de origem)
  tipoFluxo: text("tipo_fluxo"), // judicial | adm | salario_maternidade | negociacao
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  honorarioValor: numeric("honorario_valor", { precision: 10, scale: 2 }),
  honorarioStatus: text("honorario_status").notNull().default("pendente"), // pendente | recebido
  responsavelId: integer("responsavel_id").references(() => agentsTable.id),
  observacoes: text("observacoes"),
  // AdvBox sync
  advboxId: text("advbox_id").unique(),          // ID do caso no AdvBox
  advboxSyncedAt: timestamp("advbox_synced_at"), // última sincronização
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
