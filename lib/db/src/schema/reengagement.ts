import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

// Cada disparo de reengajamento gera 1 linha nesta tabela.
// `attemptNumber` é o N-ésimo disparo da conversa (1, 2, 3...).
// `leadResponded` vira true quando o lead manda mensagem depois deste disparo.
export const reengagementAttemptsTable = pgTable(
  "reengagement_attempts",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    sentByUserId: integer("sent_by_user_id").references(() => usersTable.id),
    sentByName: text("sent_by_name"),
    messageText: text("message_text").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    leadResponded: boolean("lead_responded").notNull().default(false),
    respondedAt: timestamp("responded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    idxConv: index("idx_reengagement_conv").on(table.conversationId),
    idxSentAt: index("idx_reengagement_sent_at").on(table.sentAt),
  }),
);

// Log de toda tentativa de transferência ChatGuru, sucesso ou falha.
// Usado pra debug e pra telas de operação verem o que aconteceu.
export const chatguruTransferLogTable = pgTable("chatguru_transfer_log", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  fromAgentId: integer("from_agent_id"),
  toAgentId: integer("to_agent_id").notNull(),
  triggeredBy: text("triggered_by"), // 'reengagement_send' | 'manual_reassign' | 'pass_to_closer'
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ReengagementAttempt = typeof reengagementAttemptsTable.$inferSelect;
export type ChatguruTransferLog = typeof chatguruTransferLogTable.$inferSelect;
