-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ MIGRATION: Reengagement Tracking + ChatGuru Transfer + Letícia Login   ║
-- ║                                                                        ║
-- ║ Roda 1 vez no banco PRODUCTION. Idempotente — pode rodar de novo sem  ║
-- ║ quebrar (usa IF NOT EXISTS).                                           ║
-- ║                                                                        ║
-- ║ Como aplicar no Replit:                                                ║
-- ║   psql $DATABASE_URL -f scripts/migration-reengagement.sql             ║
-- ║                                                                        ║
-- ║ Como reverter (em caso de problema, dentro de 24h):                    ║
-- ║   ver bloco ROLLBACK no fim deste arquivo (comentado).                 ║
-- ╚════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. Novas colunas em `conversations` ───────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS reengagement_count integer NOT NULL DEFAULT 0;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_reengagement_at timestamp;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_lead_message_at timestamp;

-- ── 2. Nova coluna em `agents` ────────────────────────────────────────────
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS chatguru_user_id text;

-- ── 3. Tabela `reengagement_attempts` ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS reengagement_attempts (
  id              serial PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sent_at         timestamp NOT NULL DEFAULT now(),
  sent_by_user_id integer REFERENCES users(id),
  sent_by_name    text,
  message_text    text NOT NULL,
  attempt_number  integer NOT NULL,
  lead_responded  boolean NOT NULL DEFAULT false,
  responded_at    timestamp,
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reengagement_conv
  ON reengagement_attempts(conversation_id);

CREATE INDEX IF NOT EXISTS idx_reengagement_sent_at
  ON reengagement_attempts(sent_at);

-- ── 4. Tabela `chatguru_transfer_log` ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatguru_transfer_log (
  id              serial PRIMARY KEY,
  conversation_id integer NOT NULL,
  from_agent_id   integer,
  to_agent_id     integer NOT NULL,
  triggered_by    text,
  success         boolean NOT NULL,
  error_message   text,
  created_at      timestamp NOT NULL DEFAULT now()
);

-- ── 5. Garantir que role `agent_taskforce` é válido em users.role ─────────
-- O CRM usa text simples (não enum), então não precisa ALTER TYPE.
-- Comentário documenta a mudança esperada.
COMMENT ON COLUMN users.role IS
  'admin | agent | agent_taskforce | team (legado). agent_taskforce = força-tarefa de atendimento.';

COMMIT;

-- ── Verificações pós-migration ────────────────────────────────────────────
-- Rode estes SELECTs depois da migration pra confirmar que tudo aplicou:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='conversations' AND column_name IN ('reengagement_count','last_reengagement_at','last_lead_message_at');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='agents' AND column_name='chatguru_user_id';
-- SELECT to_regclass('reengagement_attempts'), to_regclass('chatguru_transfer_log');

-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK (descomentar e rodar SE precisar reverter):                   ║
-- ║                                                                        ║
-- ║ BEGIN;                                                                 ║
-- ║ DROP TABLE IF EXISTS chatguru_transfer_log;                            ║
-- ║ DROP TABLE IF EXISTS reengagement_attempts;                            ║
-- ║ ALTER TABLE conversations DROP COLUMN IF EXISTS reengagement_count;    ║
-- ║ ALTER TABLE conversations DROP COLUMN IF EXISTS last_reengagement_at;  ║
-- ║ ALTER TABLE conversations DROP COLUMN IF EXISTS last_lead_message_at;  ║
-- ║ ALTER TABLE agents DROP COLUMN IF EXISTS chatguru_user_id;             ║
-- ║ COMMIT;                                                                ║
-- ╚════════════════════════════════════════════════════════════════════════╝
