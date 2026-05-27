# Easypanel Env Vars — Cutover KV2 → Supabase Staging

> **Status:** PRE-CUTOVER — NÃO aplicar no Easypanel prod ainda.
> Aplicar manualmente via Dashboard Easypanel OU via Pax tRPC MCP no momento do cutover Fase 6.
>
> Ref: ADR-0007 v1.2 Fase 3 (Tracking rebase) | staging project: `cjtwrzlwfqvzukjinmjr`

---

## Onde pegar os valores

Todos os valores estão em `/Users/gorito/Dev/Mentoria-Tracking/.env.staging.local` (chmod 600, nunca commitar).

```
SUPABASE_URL                    → copiar var SUPABASE_URL
SUPABASE_ANON_KEY               → copiar var SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY       → copiar var SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL (pooler)           → copiar var SUPABASE_DATABASE_URL_POOLER
```

---

## tracking-api (backend Hono — Easypanel KV8)

### Variáveis a REMOVER (pós-cutover, não antes)

| Variável | Motivo |
|---|---|
| `DATABASE_URL` (apontando KV2 `69.62.102.49:6543`) | Substituída por pooler Supabase |
| `TRACKING_JWT_SECRET` | Substituída por Supabase Auth (tokens validados via JWKS) |
| `TRACKING_INTERNAL_API_KEY` | Auth migrada pra Supabase service_role |
| `TRACKING_VAULT_KEY` | Secrets migrados pra Supabase Vault |
| `TRACKING_RESEND_API_KEY` | Mover pra Supabase Vault secret `resend_api_key` |

### Variáveis a ADICIONAR

| Variável | Valor | Fonte |
|---|---|---|
| `SUPABASE_URL` | `https://cjtwrzlwfqvzukjinmjr.supabase.co` | `.env.staging.local` var `SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | `<copiar de .env.staging.local>` | `.env.staging.local` var `SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<copiar de .env.staging.local>` | `.env.staging.local` var `SUPABASE_SERVICE_ROLE_KEY` |
| `DATABASE_URL` | `<copiar de .env.staging.local>` | `.env.staging.local` var `SUPABASE_DATABASE_URL_POOLER` |

> **Nota pooler:** `DATABASE_URL_POOLER` usa porta `6543` (PgBouncer transaction mode).
> Para operações que precisam de `LISTEN/NOTIFY` ou `SET LOCAL`, usar `SUPABASE_DATABASE_URL_SESSION` (porta `5432`, session mode).

---

## tracking-app (frontend Vite — Easypanel KV8)

### Variáveis a ADICIONAR

| Variável | Valor | Fonte |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://cjtwrzlwfqvzukjinmjr.supabase.co` | `.env.staging.local` var `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `<copiar de .env.staging.local>` | `.env.staging.local` var `SUPABASE_ANON_KEY` |

> **Nota:** `VITE_*` vars são inlined no bundle em build time. NÃO colocar `SERVICE_ROLE_KEY` aqui — só anon key.

---

## Procedimento de aplicação (Fase 6 cutover)

1. Diego entra no Easypanel KV8: `http://easypanel.colegiomentoria.com.br` (ou IP `92.112.177.42`)
2. Projeto `tracking-api` → **App Settings** → **Environment Variables**
3. Adicionar variáveis acima (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL novo)
4. Projeto `tracking-app` → **App Settings** → **Environment Variables**
5. Adicionar VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
6. Trigger rebuild de `tracking-app` (Vite precisa re-build para inlinear VITE_* vars)
7. Trigger restart de `tracking-api` (Node lê vars em runtime — sem rebuild necessário)
8. Smoke test: `curl https://track.escola.click/health` → esperado `{"status":"ok"}`

> **ALTERNATIVA VIA PAX:** se Easypanel tRPC MCP estiver configurado, Pax pode aplicar vars via API
> sem acesso manual ao dashboard. Verificar antes do cutover se MCP está ativo.

---

## Notas de segurança

- `SERVICE_ROLE_KEY` bypass RLS — só em `tracking-api` (backend). NUNCA em `tracking-app` (frontend).
- Pós-cutover, revogar `TRACKING_INTERNAL_API_KEY` antigo via Dashboard KV2.
- `SUPABASE_DATABASE_URL_POOLER` contém senha URL-encoded (`*` → `%2A`) — copiar literal do `.env.staging.local`.

---

_Criado por Felix (Optimizer/DevOps) — 24/05/2026. Ref: missão deploy Auth Hook staging._
