import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),        // "advbox" | "notion" | "chatguru"
  direction: text("direction").notNull(),   // "in" | "out"
  eventType: text("event_type").notNull(),  // "caso.update" | "caso.create" | etc.
  externalId: text("external_id"),          // ID do objeto no sistema externo
  localId: text("local_id"),                // ID do processo local
  status: text("status").notNull(),         // "ok" | "error" | "skipped"
  payload: jsonb("payload"),                // payload completo recebido
  result: text("result"),                   // mensagem de resultado
  errorDetail: text("error_detail"),        // detalhe do erro se houver
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SyncLog = typeof syncLogsTable.$inferSelect;
