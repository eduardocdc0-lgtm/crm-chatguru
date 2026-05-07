# 🚀 Instruções de Deploy — Reengagement Tracking + Letícia (Força-Tarefa)

Este documento diz **exatamente o que rodar** pra colocar o que foi codado em produção. Siga na ordem. Cada passo tem o comando completo pra copiar-colar no shell do Replit.

> **Antes de começar:** confirme que você está no projeto certo no Replit (`guru-api-hub`) e que o shell aberto é desse projeto. O `DATABASE_URL` precisa estar apontando pra produção.

---

## 📋 Ordem de execução

1. **Push do código** (do seu PC pra o Replit, via git)
2. **Migration do banco** (cria tabelas e colunas novas)
3. **Variáveis de ambiente** (1 nova: `CHATGURU_TRANSFER_ACTION`)
4. **Seed de agentes** (cria/atualiza Letícia, Marília, Alice, Cau, Claudiana se faltarem)
5. **Seed da Letícia** (cria login dela)
6. **Reiniciar o servidor** (Replit faz automaticamente após push, mas confirme)
7. **Teste manual** (login Letícia, dispara reengajamento de teste)
8. **Configurar transferência ChatGuru** (descobrir nome da action — opcional)
9. **Rodar backfill** (popular tentativas históricas — opcional, depois que tudo estiver OK)
10. **Trocar Delegação Inicial no painel ChatGuru** (fora do código)

---

## 1. Push do código

No seu computador:

```bash
cd "C:/Users/Eduardo Henrique/Desktop/PROJETO PROSPECÇÃO/crm"
git add -A
git status            # confere o que vai ser commitado
git commit -m "feat: reengagement tracking + ChatGuru sync + role agent_taskforce"
git push
```

O Replit vai puxar automaticamente quando você fizer pull lá.

No shell do Replit:

```bash
git pull
pnpm install          # instala dependências caso package.json tenha mudado
```

---

## 2. Migration do banco (SQL puro — não usa drizzle push)

⚠️ **Roda 1 vez. Crítico — afeta produção.** O arquivo é idempotente (pode rodar de novo sem quebrar), mas preferível rodar só uma vez.

No shell do Replit:

```bash
psql "$DATABASE_URL" -f scripts/migration-reengagement.sql
```

Pra verificar se aplicou certo:

```bash
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name IN ('reengagement_count','last_reengagement_at','last_lead_message_at');"
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='agents' AND column_name='chatguru_user_id';"
psql "$DATABASE_URL" -c "SELECT to_regclass('reengagement_attempts'), to_regclass('chatguru_transfer_log');"
```

Esperado: as 3 colunas em `conversations`, 1 em `agents`, e 2 nomes de tabela existentes.

Se algo der errado, há um bloco de **ROLLBACK** comentado no fim do arquivo `scripts/migration-reengagement.sql` que reverte tudo.

---

## 3. Variáveis de ambiente

No painel do Replit → Secrets, **adicione** a seguinte (deixe vazia ou não defina pra desligar):

| Nome | Valor | Quando preencher |
|---|---|---|
| `CHATGURU_TRANSFER_ACTION` | (deixar vazia por agora) | Só depois de descobrir o nome real da action no ChatGuru — ver passo 8 |

Enquanto essa env não estiver setada, **a transferência ChatGuru fica desligada** (proposital — todo o resto funciona, só não sincroniza atribuição com o painel ChatGuru).

A senha da Letícia também precisa entrar como Secret pra rodar o seed:

| Nome | Valor sugerido |
|---|---|
| `SEED_PASSWORD_LETICIA` | `L3t1c1@_25` |

---

## 4. Seed de agentes

Garante que Letícia, Marília, Alice, Cau e Claudiana existam na tabela `agents` (se já existirem, não toca; se faltarem, cria; em todos, popula `chatguru_user_id` com email-tentativa).

```bash
pnpm --filter @workspace/api-server run seed:agents
```

Saída esperada:
```
✓ "Letícia" criado (team=ATENDIMENTO, chatguru_user_id=leticiassoliveira29@gmail.com)
→ "Thiago Tavares" já existe — pulando.
...
```

⚠️ **O `chatguru_user_id` está com EMAIL como tentativa.** Se descobrir que o ChatGuru s22 usa UUID em vez de email, atualize manualmente:

```sql
UPDATE agents SET chatguru_user_id='<UUID-DO-THIAGO>' WHERE name='Thiago Tavares';
```

---

## 5. Seed da Letícia (login)

```bash
SEED_PASSWORD_LETICIA="L3t1c1@_25" pnpm --filter @workspace/api-server run seed:taskforce
```

(Se você já cadastrou o secret `SEED_PASSWORD_LETICIA` no Replit, pode omitir o `SEED_PASSWORD_LETICIA="..."` da frente.)

Saída esperada:
```
✓ user "leticia" criado (role=agent_taskforce, agentId=3)
```

A partir daí, Letícia loga em `https://guru-api-hub.replit.app` com:
- usuário: `leticia`
- senha: `L3t1c1@_25`

---

## 6. Reiniciar o servidor

O Replit já faz isso automaticamente quando detecta mudança no código, mas se quiser forçar:

```bash
# Mata o processo atual
pkill -f "node.*dist/index.mjs"
# Replit reinicia sozinho via "Always On" / Repl run command
```

Ou simplesmente clique em **Stop** e **Run** no painel.

---

## 7. Teste manual (faça nessa ordem)

1. Abrir `https://guru-api-hub.replit.app` em janela anônima
2. Logar com `leticia` / `L3t1c1@_25`
3. Verificar:
   - ✅ Aparece sidebar com: Dashboard, Conversas, Alertas, Resumos, Qualificados, Reengajamento, Limpeza
   - ❌ NÃO aparece: Equipe, Números, Tags, Meta Ads, Auditoria
   - ❌ Dashboard NÃO mostra "Métricas Comerciais" / faturamento
4. Ir em **Reengajamento**:
   - Selecionar 1 lead que seja seu próprio número (pra testar sem sujar leads reais)
   - Escrever uma mensagem de teste
   - Clicar Enviar
   - Esperar receber no WhatsApp
5. Confirmar no banco:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, conversation_id, sent_by_name, attempt_number, lead_responded FROM reengagement_attempts ORDER BY id DESC LIMIT 5;"
   ```
   Deve aparecer 1 linha nova com `sent_by_name='leticia'`, `attempt_number=1`, `lead_responded=false`.
6. Responder pelo WhatsApp (do seu próprio número que recebeu o teste).
7. Aguardar uns 30s, conferir de novo:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, lead_responded, responded_at FROM reengagement_attempts ORDER BY id DESC LIMIT 1;"
   ```
   `lead_responded` deve ter virado `true` e `responded_at` deve estar preenchido.
8. Abrir o lead no CRM (modal). Deve aparecer:
   - Seção "Tentativas de Reengajamento" com a entrada
   - Badge "✅ Respondeu"
   - Botão "Passar pra Fechamento" com Thiago/Tammy no dropdown
9. Clicar "Passar pra Thiago" → o lead deve sumir da lista da Letícia e aparecer atribuído ao Thiago.

Se TODOS esses passos funcionarem, **o sistema interno está OK**. Falta só sincronizar com ChatGuru.

---

## 8. Sincronizar transferência com ChatGuru (opcional, mas recomendado)

Enquanto não fizer isso, a atribuição CRM funciona sozinha — o lead pra Letícia disparar reengajamento, mas a resposta ainda volta pro Thiago no painel ChatGuru. Quando você sincronizar, a resposta volta pra Letícia.

### 8.1 Descobrir o nome da action

Dois caminhos:

**Caminho A — documentação do ChatGuru s22.** Acesse `https://chatguru.com.br/docs` ou o painel admin → API. Procure ações relacionadas a transferência/atribuição de chat.

**Caminho B — testar via curl no shell do Replit.** Substitua os valores pelos seus:

```bash
# Substitua $CHATGURU_API_KEY, $ACCOUNT_ID, $PHONE_ID e $CHAT_NUMBER pelos valores reais.
# user_id = email do agente (ou UUID, depende).

# Tentativa 1: chat_transfer
curl -X POST "https://s22.chatguru.app/api/v1?key=$CHATGURU_API_KEY&account_id=$CHATGURU_ACCOUNT_ID&phone_id=$CHATGURU_PHONE_ID&action=chat_transfer&chat_number=5581999999999&user_id=tavaresthiago109@gmail.com"

# Tentativa 2: chat_assign
curl -X POST "https://s22.chatguru.app/api/v1?key=$CHATGURU_API_KEY&account_id=$CHATGURU_ACCOUNT_ID&phone_id=$CHATGURU_PHONE_ID&action=chat_assign&chat_number=5581999999999&user_id=tavaresthiago109@gmail.com"

# Tentativa 3: transfer_chat
# Tentativa 4: assign_user
```

Quando uma retornar `{"result":"success"}` (ou `code: 200`/`201`), abra o painel ChatGuru e confirme que o chat ficou atribuído ao Thiago. Se sim, esse é o nome certo.

### 8.2 Configurar a env

No Replit → Secrets:

```
CHATGURU_TRANSFER_ACTION=<nome_que_funcionou>
```

Reinicie o servidor.

### 8.3 Confirmar formato do user_id

Se o teste com email funcionou, mantém. Se o ChatGuru exigiu UUID, descubra os UUIDs no painel ChatGuru (Configurações → Usuários → cada usuário tem um ID) e atualize:

```sql
UPDATE agents SET chatguru_user_id='<UUID>' WHERE name='Thiago Tavares';
UPDATE agents SET chatguru_user_id='<UUID>' WHERE name='Tammyres';
UPDATE agents SET chatguru_user_id='<UUID>' WHERE name='Letícia';
UPDATE agents SET chatguru_user_id='<UUID>' WHERE name='Marília';
UPDATE agents SET chatguru_user_id='<UUID>' WHERE name='Alice';
```

### 8.4 Testar de novo

Repita o passo 7 e confirme que agora o lead também é transferido no ChatGuru. Pra ver os logs de transferência:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM chatguru_transfer_log ORDER BY id DESC LIMIT 10;"
```

`success=t` → ChatGuru aceitou. `success=f` → ver `error_message` pra debug.

---

## 9. Backfill histórico (opcional)

Popula `reengagement_attempts` com base em mensagens já enviadas que parecem reengajamento (heurística por palavras-chave: "desculpe a demora", "voltando ao trabalho", etc.).

**Sempre rode primeiro em DRY-RUN** (não escreve nada, só conta):

```bash
pnpm --filter @workspace/api-server run backfill:reengagement
```

Saída de exemplo:
```
Total de webhook_events: 14823
Mensagens identificadas como reengajamento: 187
Conversas afetadas: 142

Resumo:
  attempts a inserir: 187
  skipped (sem conv ou duplicado): 5
  conversations a atualizar: 142

⚠️  DRY-RUN: nada foi escrito. Pra aplicar de verdade:
    APPLY=1 pnpm --filter @workspace/api-server run backfill:reengagement
```

Se os números fizerem sentido (e você concordou com o que vai mexer), aplique:

```bash
APPLY=1 pnpm --filter @workspace/api-server run backfill:reengagement
```

---

## 10. Tarefas no painel ChatGuru (fora do código)

Estas tarefas você faz direto no ChatGuru, não tem nada a ver com código:

### 10.1 Trocar a "Delegação Inicial"

1. ChatGuru → Diálogos → "Delegação Inicial -> Thiago"
2. Procurar "Delegar para usuário"
3. Trocar pra "Distribuir entre" (round-robin) ou "Departamento COMERCIAL"
4. Marcar Thiago + Tammy
5. Renomear pra "Delegação Inicial -> Comercial"
6. Salvar
7. Testar com 2 leads consecutivos pra confirmar 50/50

A Letícia **NÃO** entra na rota de leads novos — ela só cuida de backlog.

### 10.2 Comunicar credenciais à equipe

Via WhatsApp pessoal (não no grupo):
- Thiago: usuário `thiago` / senha já configurada
- Tammyres: usuário `tammyres` / senha já configurada
- Letícia: usuário `leticia` / senha `L3t1c1@_25`

URL: `https://guru-api-hub.replit.app`

---

## 🆘 Se algo der errado

| Sintoma | Causa provável | Solução |
|---|---|---|
| `psql: command not found` | Replit sem cliente psql | Use `npx pg` ou abra o DB pelo painel Replit |
| `npm error ERESOLVE` no `pnpm install` | Cache do pnpm | `pnpm install --force` |
| Letícia loga mas vê faturamento | Cache do browser | Logout, hard refresh (Ctrl+Shift+R), login |
| `Reengajamento` mostra erro 500 | Migration não rodou | Volte ao passo 2 |
| Disparo de mensagem sem `attempt_number` no banco | Webhook não está chegando | Confira webhook URL no ChatGuru — passo 6 do replit.md |
| `chatguru_transfer_log` registra sempre `skipped=true` | `CHATGURU_TRANSFER_ACTION` vazia | Faça o passo 8 |

---

## 📂 Arquivos novos / modificados (referência)

**Backend:**
- `lib/db/src/schema/reengagement.ts` (novo)
- `lib/db/src/schema/conversations.ts` (+3 colunas)
- `lib/db/src/schema/agents.ts` (+1 coluna)
- `lib/db/src/schema/index.ts` (export)
- `artifacts/api-server/src/lib/auth.ts` (role nova + helpers)
- `artifacts/api-server/src/lib/chatguru-transfer.ts` (novo)
- `artifacts/api-server/src/routes/reengagement.ts` (novo — todos os endpoints)
- `artifacts/api-server/src/routes/index.ts` (registra rota)
- `artifacts/api-server/src/routes/auth.ts` (aceita role nova)
- `artifacts/api-server/src/routes/chatguru.ts` (webhook detecta resposta)

**Frontend:**
- `artifacts/chatguru-monitor/src/hooks/use-auth.tsx` (role nova)
- `artifacts/chatguru-monitor/src/components/layout.tsx` (perms por role + Limpeza)
- `artifacts/chatguru-monitor/src/components/lead-modal.tsx` (timeline + pass-to-closer)
- `artifacts/chatguru-monitor/src/pages/reengagement.tsx` (reescrito)
- `artifacts/chatguru-monitor/src/pages/limpeza.tsx` (novo)
- `artifacts/chatguru-monitor/src/pages/dashboard.tsx` (esconde finanças pra força-tarefa)
- `artifacts/chatguru-monitor/src/App.tsx` (route /limpeza, refactor permissões)

**Scripts:**
- `scripts/migration-reengagement.sql` (novo)
- `artifacts/api-server/scripts/seed-agents.ts` (novo)
- `artifacts/api-server/scripts/seed-taskforce.ts` (novo)
- `artifacts/api-server/scripts/backfill-reengagement.ts` (novo)
- `artifacts/api-server/package.json` (3 scripts novos)
