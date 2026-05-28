# CLAUDE.md — Mentoria-Tracking-App

> Instruções pra IA assistente (Claude Code) trabalhando neste repo.
> Carregado automaticamente quando cwd é `Mentoria-Tracking-App/`.
> Complementa `~/CLAUDE.md` global + skill local `tracking-access`
> (`.claude/skills/tracking-access/SKILL.md`).

---

## 1. O que é este repo

**Mentoria Tracking App** — produto SaaS multi-tenant de tracking server-side
+ auto-provisioner GTM pra clientes (escolas/cursinhos).

| Camada | Tech | Path | Deploy |
|---|---|---|---|
| Frontend SPA | Vite + React 18 + TS 5.5 + Tailwind | `src/` | Easypanel `evolution/tracking-app` (nginx) |
| Backend API | Hono + Node.js (tsx runtime) | `workers/api/` | Easypanel `evolution/tracking-api` (Node.js) |
| Libs backend | `workers/lib/` (providers, gtm, storage, validator) | | |
| Edge functions | Deno (`supabase/functions/`) | | Supabase deploy |
| Plugin WP | `plugins/gtm4wp-mentoria/` (fork mínimo Opção C) | | Empacotado per-tenant via TUS upload |
| Migrations | `supabase/migrations/0250-0259...` | | Supabase apply_migration |
| Build do plugin | `scripts/build-plugin.ts` (chamado pelo backend) | | |

**Backend de dados**: Postgres KV2 (Hostinger, self-hosted) + Supabase
project `cjtwrzlwfqvzukjinmjr` (auth + multi-tenant schemas `core.*`/`tracking.*`).

**Era 1** = single-tenant Diego/Mentoria via `BRAND_GTM_MAP` constants
fallback. **Era 2** = multi-tenant via `core.tenant_containers` clone do
master V2. ADR-0009 documenta. Smoke F-S14 (2026-05-28) fechou Era 1+2
end-to-end via tracking-api em produção (ifrn.com.br).

---

## 2. Comandos padrão

```bash
# Setup
npm install                       # NÃO pnpm/yarn — npm é o canônico

# Dev local
npm run dev                       # frontend Vite (localhost:5173)
PORT=3000 npx tsx workers/api/index.ts   # backend (localhost:3000)

# Build + verificação
npm run build                     # tsc -b && vite build (frontend)
npx tsc --noEmit -p tsconfig.json # type check workers/
npm run lint                      # eslint .

# Tests
npx vitest run --no-coverage      # tudo
npx vitest run --no-coverage workers/lib/gtm/__tests__/   # alvo
npx vitest --coverage             # com coverage

# Smoke local plugin builder (CLI)
npx tsx scripts/build-plugin.ts --container_id=GTM-XXX --brand_slug=ifrn --plugin_version=gtm4wp-1.18+bootstrap-v1
```

**Deploy** via Easypanel tRPC (não `wrangler` — ignorar `wrangler.toml.deprecated`):

```bash
source /Volumes/SSD\ 2T/Dev/Mentoria-Tracking/.env.local
curl -s -X POST -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"evolution","serviceName":"tracking-api"}}' \
  "$EASYPANEL_URL/api/trpc/services.app.deployService"
# Mesmo pra tracking-app (frontend)
```

**autoDeploy=false** em ambos services — sempre dispara deploy via API após push.

Após deploy, espera SHA propagar (~10–30s) + health 200:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tracking.colegiomentoria.com.br/api/health
```

---

## 3. Arquitetura — entender antes de mexer

### Frontend (`src/`)
- React Router custom (não react-router-dom) — `src/App.tsx` orquestra
- Hooks customizados em `src/hooks/` (useTenant, useGtmContainer, useSitesApi, useInstallation)
- Components em `src/components/` (AppShell, ui/, sites/, gtm/, layout/)
- Routes em `src/routes/`
- API client em `src/lib/api.ts` e `src/lib/sitesApi.ts`
  - `API_BASE` resolve por hostname: `localhost` → `:3000`, prod → empty (same-origin via nginx proxy)

### Backend Hono (`workers/api/`)
- `index.ts` = bootstrap + route mounting (`/api/auth`, `/api/sites`, `/api/installations`, `/api/gtm`, etc.)
- `middleware.ts` = `authMiddleware` (valida JWT Supabase Auth), `getAuthCtx(c)` pra acessar `userId`, `tenantId`
- `tenantGuard.ts` = `resolveTenantId(ctx)`, `assertTenantOwnership(row, ctx, kind, id)` — RLS at app-layer
- `errors.ts` + `errorHandler.ts` = `HttpError` class + middleware que serializa pra response
- Routes split por domínio: `auth.ts`, `sites.ts`, `hosting-accounts.ts`, `installations.ts`, `gtm.ts`, `analytics.ts`, `onboarding.ts`, `deployJob.ts`

### Backend libs (`workers/lib/`)
- `providers/HostingerAdapter.ts` — TUS upload pro Hostinger File Manager
  (POST `/files/upload-urls` → POST/PATCH TUS por arquivo). NÃO usa o endpoint
  hipotético `/deploy/wordpress-plugin` (esse 404 — descoberta F-S14)
- `providers/IHostingProvider.ts` — interface comum
- `gtm/client.ts` + `gtm/auth.ts` + `gtm/provision.ts` + `gtm/republish.ts` — GTM API SA
- `gtmContainerResolver.ts` — F-S23 unified Era 1+2 lookup
- `storage/RedisGtmStorage.ts` + `storage/types.ts` — installations, hosting_accounts em Redis
- `storage/crypto.ts` — libsodium sealed_box pra cifrar PAT Hostinger
- `audit/` — F-S07 sanitização payloads pra LGPD
- `validator.ts` — F-S06 valida tag GTM no HTML do site
- `constants.ts` — BRAND_GTM_MAP (Era 1 fallback) + tipos

### Edge functions (`supabase/functions/`)
- `custom-access-token/` — Deno hook que injeta `tenant_id`, `tracking_role`,
  `products`, `current_product` no JWT após signInWithPassword.
  ⚠️ Usa `.schema('core').from('tenant_users')` — service_role precisa GRANT
  USAGE no schema `core` (migration 0257)

### Plugin WP (`plugins/gtm4wp-mentoria/`)
- 3 arquivos: README.md, `mentoria-config.json.template`, `mentoria-gtm-bootstrap.php`
- Bootstrap roda em `register_activation_hook`: lê `mentoria-config.json`,
  popula `gtm4wp-options` com `gtm-code = <container_id>`, ativa GTM4WP upstream
- `scripts/build-plugin.ts` empacota per-tenant substituindo template vars
  (container_id, brand_slug, plugin_version) no JSON

---

## 4. Convenções

### TypeScript
- `strict: true` em todos tsconfigs
- Tipos importados de `workers/lib/storage/types.ts` (canônico)
- Branded types pra IDs: `InstallationId`, `TenantId`, `AccountId` (string com brand)
- Async/await em vez de Promise chains
- `unknown` em vez de `any` em error handlers

### Naming
- snake_case nas migrations e DB (`tenant_containers`, `site_domain`)
- camelCase em TS (`siteDomain`, `gtmContainerId`)
- PascalCase classes (`HostingerAdapter`, `RedisGtmStorage`)
- File names match exports: `HostingerAdapter.ts` exporta `class HostingerAdapter`
- Migrations: `NNNN_descrição_snake.sql` (ex `0259_grant_service_role_core_sequences.sql`)

### Stories e ADRs
- Stories em `docs/stories/F-SNN.md` (Sprint N, story N) — F-S01 a F-S25
- ADRs em `docs/adr-NNNN-titulo.md` — 0008 auto-provisioner, 0009 GTM clone Era 2
- Sempre referenciar ADR/story no doc comment do arquivo (`@see docs/...`)

### Commits
- Mensagens em pt-br informal: `fix(hostinger): reescreve deployPlugin pra TUS`
- Co-Authored-By Claude no final
- Prefix por domínio: `fix(docker)`, `feat(gtm)`, `test(hostinger)`, `chore(deps)`
- Descrever PORQUÊ no body, não só o quê

---

## 5. NEVER do (zerar essas armadilhas)

1. **NUNCA usar `supabase.from('X')` sem `.schema('core')`** quando X está em
   `core.*`. Default schema é `public` — INSERT/SELECT silencioso falha.
   Já queimou 2× em smoke F-S14 (audit gtm_clone_audit + tenant_users).

2. **NUNCA assumir que GTM_SA_KEY_JSON pode ter newlines literal `\n`** em
   panels (Easypanel). Usar `GTM_SA_KEY_JSON_B64` (base64 do JSON) — preferido
   em prod por evitar quebra do private_key. Auth.ts aceita ambos.

3. **NUNCA passar `pluginPath` como JSON body pro Hostinger** — endpoint
   hipotético `/deploy/wordpress-plugin` não existe (404). Usar TUS upload
   arquivo-por-arquivo via `HostingerAdapter.deployPlugin` (já implementado
   commits 8263543 + 56e19de).

4. **NUNCA esquecer `COPY plugins ./plugins` no Dockerfile.api** — buildPlugin
   lê de `/app/plugins/gtm4wp-mentoria/`. Também `scripts/`. Sem isso,
   ERR_MODULE_NOT_FOUND ou ENOENT em runtime. Já queimou em smoke #1 e #2.

5. **NUNCA criar nova installation via `createInstallation` esperando refresh
   automatic do container** — função é idempotente por SHA1(site_domain).
   Container persistido pode estar stale (Era 1) mesmo após Era 2 provision.
   Fix em commit 672bd27 faz re-resolve quando status in (draft, failed,
   uninstalled). Pra status='installed' usar `/api/gtm/republish/:tenant_slug`.

6. **NUNCA commitar `.env.local`** — gitignored, mas double-check antes de
   `git add -A`. Credenciais Postgres, Hostinger PAT, OAuth tokens vivem lá.

7. **NUNCA usar `npm run deploy:pages` ou `wrangler deploy`** — deprecated
   (era Cloudflare Workers + Pages). Deploy hoje é Easypanel tRPC.
   `wrangler.toml.deprecated` é histórico, ignorar.

---

## 6. Fluxos comuns

### Mudar código backend → ver em prod
```bash
# 1. Edit workers/...
# 2. npx tsc --noEmit -p tsconfig.json  (catch type errors)
# 3. npx vitest run --no-coverage workers/lib/.../__tests__/  (tests do módulo)
# 4. git add + commit
# 5. git push origin main
# 6. Trigger deploy (autoDeploy=false):
#    curl -X POST .../services.app.deployService
# 7. Poll SHA + health 200 (~20-40s)
# 8. Smoke real: curl https://tracking.colegiomentoria.com.br/api/<rota>
```

### Adicionar migration Supabase
```bash
# 1. Criar arquivo supabase/migrations/NNNN_descricao.sql
# 2. Aplicar via MCP:
#    mcp__a222754d-...__apply_migration({
#      project_id: "cjtwrzlwfqvzukjinmjr",
#      name: "NNNN_descricao",
#      query: "CREATE TABLE ..."
#    })
# 3. Se PostgREST cache stale, force reload:
#    NOTIFY pgrst, 'reload schema';
```

### Mudar Edge function `custom-access-token`
```bash
# 1. Edit supabase/functions/custom-access-token/index.ts
# 2. mcp__a222754d-...__deploy_edge_function({
#      project_id: "cjtwrzlwfqvzukjinmjr",
#      name: "custom-access-token",
#      entrypoint_path: "index.ts",
#      verify_jwt: false,  // hook, não endpoint público
#      files: [{ name: "index.ts", content: "..." }]
#    })
# 3. Pre-warm 3× pingar com fake event antes de login real (cold start ~5s):
#    curl -X POST https://cjtwrzlwfqvzukjinmjr.supabase.co/functions/v1/custom-access-token \
#      -H "Content-Type: application/json" \
#      -d '{"event":"warmup","user_id":"00000000-0000-0000-0000-000000000000","claims":{}}'
```

### Smoke F-S14 E2E install via tracking-api
```bash
# Pre-reqs: login → tem JWT, hosting_account já conectado, tenant tem Era 2 provisioned
JWT=$(curl ... | jq -r .access_token)
API="https://tracking.colegiomentoria.com.br"

# 1. Cria draft
curl -X POST "$API/api/installations" -H "Authorization: Bearer $JWT" \
  -d '{"hosting_account_id":"...","site_domain":"X.com","brand_slug":"..."}'

# 2. Dispara deploy (TUS upload)
curl -X POST "$API/api/installations/<id>/deploy" -H "Authorization: Bearer $JWT"

# 3. Polling até uploaded_pending_activation (Codex #3 fix)
# 4. Ativar plugin via WP REST OU UI WP-admin (gap #58)
# 5. POST /:id/revalidate pra rodar validator F-S06 → installed
```

---

## 7. Quando precisar de acesso administrativo

Skill local `tracking-access` no `.claude/skills/` cobre:
- Supabase project ID + MCP tools comuns
- Easypanel tRPC commands
- Postgres KV2 conexão
- Hostinger MCP + SSH key
- libsodium keys
- GTM SA path

Skill master `diego-access` em `~/.claude/skills/` cobre acessos cross-repo
(ERP, Marketing, SING, todas as plataformas ad/IA/etc).

**Fallback chain**: local → master → pedir Diego.

---

## 8. Gotchas isolados em produção

Documentados em `docs/stories/F-S14.md` (smoke real). Highlights:

- **PostgREST PGRST002**: schema cache stale OR schema listado em dashboard
  "Exposed schemas" não existe no DB. Fix: criar schema vazio + GRANT +
  `NOTIFY pgrst, 'reload schema'`.
- **Service role sem GRANT em sequences**: GRANT INSERT na table não basta —
  precisa `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO service_role`
  pra autoincrement funcionar (migration 0259).
- **GTM master container com `compilerError: true`**: createVersion retorna
  HTTP 200 com ID fake, publishVersion 404. Usar GTM UI pra inspecionar
  entities com refs broken. Fix client check `r.compilerError` (commit fbb75b6).
- **Built-in variables não clonados**: copyContainerContents agora diff
  source vs target builtins + ativa missing antes de copiar tags (mesmo commit).
- **Hostinger API URL**: `developers.hostinger.com/api/hosting/v1` (NÃO
  `api.hostinger.com` — esse retorna 530 Cloudflare 1016).
- **Hook cold-start ~5s**: pre-warm antes de testar login (vide §6).

---

## 9. Branches e estado

- `main` é o único branch ativo (não tem develop/staging).
- Trabalho direto em main com commits atomic.
- CI ainda não está ativo — testes rodam manual via `npx vitest`.

---

## 10. Pendências conhecidas (status 2026-05-28)

Tasks #58 (auto-activate plugin pós-TUS) e #51 (UX login restante) abertas.
Era 1 + Era 2 fechadas. Smoke F-S14 #7 confirmou ifrn.com.br instrumentado
com GTM-W6D9PTJF via pipeline tracking-api end-to-end (idempotência Era 2
fix em commit 672bd27).
