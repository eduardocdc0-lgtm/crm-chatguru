# CRM ChatGuru — Eduardo Rodrigues Advocacia

Dashboard interno para monitoramento de atendimentos via WhatsApp/ChatGuru, com
integração Meta Ads, qualificação automática de leads, gestão de processos
jurídicos e fluxo de reengajamento.

## Stack

- **Backend**: Node.js 24 + TypeScript + Express 5
- **Banco**: PostgreSQL + Drizzle ORM (migrations SQL puras)
- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui
- **Codegen API**: OpenAPI → Orval (Zod + React Query)
- **Monorepo**: pnpm workspaces
- **Hospedagem**: Replit

## Estrutura

```
artifacts/
  api-server/          Express API (porta via PORT env)
  chatguru-monitor/    Frontend React
lib/
  db/                  Schema + cliente Drizzle
  api-spec/            OpenAPI source-of-truth + config Orval
  api-zod/             Schemas Zod gerados
  api-client-react/    Hooks React Query gerados
scripts/               Utilitários CLI (TypeScript)
docs/                  Guias de deploy e operação
```

## Comandos principais

| O que | Comando |
|---|---|
| Type-check completo | `pnpm run typecheck` |
| Build de tudo | `pnpm run build` |
| Rodar API local | `pnpm --filter @workspace/api-server run dev` |
| Regerar tipos da API | `pnpm --filter @workspace/api-spec run codegen` |
| Push schema DB (dev) | `pnpm --filter @workspace/db run push` |
| Seed inicial | `pnpm --filter @workspace/api-server run seed:users` |

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. Em produção, use **Replit Secrets**.

Variáveis principais:
- `DATABASE_URL` — Postgres (Neon/Replit)
- `CHATGURU_API_KEY`, `CHATGURU_ACCOUNT_ID`, `CHATGURU_PHONE_ID`
- `META_AD_ACCOUNT_ID`, `META_TOKEN_OVERRIDE`
- `ADMIN_USER`, `ADMIN_PASSWORD`, `TEAM_USER`, `TEAM_PASSWORD`
- `SEED_PASSWORD_*` — só pra rodar seeds

## Deploy

Push pro `main` → Replit puxa automaticamente. Para deploys que envolvem
migrations ou seeds novos, ver [`docs/deploy-reengagement.md`](docs/deploy-reengagement.md)
como exemplo do procedimento padrão.

## Roles e permissões

| Role | Acesso |
|---|---|
| `admin` (Eduardo) | Tudo: financeiro, auditoria, Meta Ads, equipe |
| `agent` (Thiago, Tammyres) | Apenas conversas próprias |
| `agent_taskforce` (Letícia, Marília, Alice…) | Reengajamento + limpeza, sem ver finanças |
| `team` | Legacy |

Sessão = cookie `crm_session` HMAC-signed (base64url JSON).

## Mais detalhes

- [`replit.md`](replit.md) — visão técnica completa (rotas, schema, integrações)
- [`docs/deploy-reengagement.md`](docs/deploy-reengagement.md) — guia passo-a-passo de
  deploy com migrations
