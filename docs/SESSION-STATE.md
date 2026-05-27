# Session State — Auto-Provisioner GTM Feature F

**Última sessão:** 2026-05-26 (madrugada virando 2026-05-27)
**Estado:** Feature F MVP **100% LIVE em prod** (15/15 stories ✅)
**Branch ativo:** `main` (sync com origin)
**Working tree:** clean
**HEAD:** `dfda3de` — feat: Sprint 3 F-S13 plugin build + F-S15 runbook completo

---

## TL;DR pra próxima sessão

**Feature F está em produção e funcional sem JWT real ainda.** O backend `tracking-api` em `https://tracking.colegiomentoria.com.br` responde com shape AC-10 em todas as 8 rotas novas. Frontend Vite com 4 rotas `/sites/*` mergeada em main mas **ainda não testada via browser autenticado** — esse é o próximo passo real.

**Próxima sessão começa com:** F-S14 smoke E2E real autenticado (Diego abre `/sites` no browser, conecta Hostinger, faz install end-to-end). Tudo que falha vira issue em sprint manutenção.

---

## Estado de cada componente

### Backend (`tracking-api` em Easypanel KV8 project `evolution`)

| Item | Estado |
|---|---|
| URL | `https://tracking.colegiomentoria.com.br` |
| Branch deploy | `main` (autoDeploy=false — deploy manual via API) |
| Image | dockerfile.api builds from main |
| Service Easypanel | tracking-api (project `evolution`) |
| Last deploy | 2026-05-27 ~02:53 UTC (manual via API) |
| Health | `/api/health` → 200 |
| Shape AC-10 | ✅ todos endpoints retornam `{ error: { code, message, request_id }}` + header `X-Request-ID` |
| 8 endpoints feature F | montados, retornam 401 sem JWT |

**Env vars no Easypanel (14 total, todas confirmadas via inspectService):**
- `NODE_ENV`, `PORT`
- `DATABASE_URL`, `JWT_SECRET`, `VAULT_KEY` (pré-feature F)
- `INTERNAL_API_KEY`, `RESEND_API_KEY` (pré-feature F)
- `REDIS_URL=redis://default:<password>@redis:6379` (com password do service Redis dedicado)
- `STORAGE_BACKEND=redis`
- `STORAGE_ENCRYPTION_PUBLIC_KEY` + `STORAGE_ENCRYPTION_SECRET_KEY` (libsodium, rotacionado 26/05, prefixo `yyTG29O/...`)
- `SUPABASE_URL=https://cjtwrzlwfqvzukjinmjr.supabase.co`
- `SUPABASE_ANON_KEY` (legacy JWT format, public)
- `SUPABASE_SERVICE_ROLE_KEY` (Diego colou manual, valor nunca tocou disco/chat)

### Frontend (`tracking-app` em Easypanel)

| Item | Estado |
|---|---|
| URL | `https://app.colegiomentoria.com.br` (provável — Diego confirma) |
| Build | merged em main, 4 routes `/sites/*` montadas |
| Components F-S09 | 8 components em `src/components/sites/` |
| Hooks F-S11 | 4 hooks em `src/hooks/` + `src/lib/sitesApi.ts` + `src/lib/translateApiError.ts` |
| Smoke autenticado | ❌ **ainda não testado via browser real** |

### Supabase (project `cjtwrzlwfqvzukjinmjr` = branch tracking-rebase do ERP Mentoria)

| Item | Estado |
|---|---|
| Project ID | `cjtwrzlwfqvzukjinmjr` |
| Parent | `apzakxgmmucutejhsjsa` (ERP Mentoria main) |
| Status DB | ACTIVE_HEALTHY |
| Status migrations branch | `MIGRATIONS_FAILED` (não bloqueia runtime) |
| Edge function `custom-access-token` | ✅ deployed via MCP (version 14, ACTIVE, verify_jwt=false) |
| Custom Access Token Hook ativo | ✅ confirmado por Diego |
| `AUTH_HOOK_WEBHOOK_SECRET` env | ✅ Diego colou na edge function settings |
| Tenant Mentoria UUID real | `93031821-455e-490b-92c9-1ccbebf1b30f` (`slug='mentoria'`, `name='Colégio Mentoria'`) — swapped em `workers/lib/constants.ts` |

### Redis (Easypanel project `evolution` service `redis`)

| Item | Estado |
|---|---|
| Service criado | ✅ `redis:7-alpine` |
| Password gerado | (no Easypanel env) |
| Hostname interno | `redis` (resolve via Easypanel network) |
| Connect string | `redis://default:<password>@redis:6379` (em tracking-api env) |

### Backup (F-S08 cross-repo)

| Item | Estado |
|---|---|
| Compose file | `infra/easypanel/redis-snapshot-compose.yml` no repo irmão **Mentoria-Tracking** (commit `85d64dd`) |
| Script | `scripts/backup_redis_gtm.sh` no Mentoria-Tracking-App main |
| Deployment | ❌ Felix ainda precisa colar YAML no Easypanel Compose service |

---

## Sprints completos

```
Sprint 0 (foundation, paralelo)         ████████████████ 3/3 ✅
  F-S01 Redis storage IGtmStorage
  F-S02 libsodium sealEncrypt/Decrypt
  F-S03 IHostingProvider interface

Sprint 1 (backend core, sequencial)     ████████████████ 5/5 ✅
  F-S04 HostingerAdapter real (fetch REST)
  F-S05 8 endpoints Hono + DI factory
  F-S06 validator 2-stage HEAD+GET
  F-S07 audit safeAuditPayload wrapper
  F-S08 backup Redis MinIO (cross-repo)

Sprint 2 (frontend Vite SPA)            ████████████████ 4/4 ✅
  F-S09 8 components React + demo
  F-S10 4 routes /sites/* + sidebar
  F-S11 4 hooks frontend + translateApiError
  F-S12 SSE fullstack + audit-log endpoint

Sprint 3 (plugin + smoke + docs)        ████████████████ 3/3 ✅
  F-S13 plugin build pipeline GTM4WP+bootstrap
  F-S14 smoke prod (validado shape AC-10, sem JWT real)
  F-S15 runbook auto-provisioner-gtm

Codex adversarial fixes                 ████████████████ 3/3 ✅
  #1 tenant guards (assertTenantOwnership)
  #2 middleware.getClaims (não user_metadata)
  #3 lock 180s + doc débito BullMQ Onda 1.5

Post-Sprint cleanup (esta sessão)       ████████████████ ✅
  UUID tenant real swap constants.ts
  authMiddleware throw HttpError (shape AC-10)
  404 fallback shape AC-10
  F-S08 cross-repo redis-snapshot-compose.yml
```

---

## Commits da sessão

```
dfda3de  feat: Sprint 3 F-S13 plugin build + F-S15 runbook completo
0316ba1  Merge feat/supabase-rebase: UUID tenant real + middleware AC-10 + 404 AC-10
838838d  fix(api): MENTORIA_TENANT_ID real + middleware AC-10 shape + 404 AC-10 shape
4f787b5  chore(scripts): generate-libsodium-keypair --write-env-local flag
f7f81e8  fix(security): Codex adversarial review #1 + #2 + #3
a47d70b  feat(frontend): F-S10 4 routes /sites/* + sidebar entry + router state machine
9b24ea3  feat(api+frontend): F-S12 SSE fullstack + audit-log endpoint + middleware ?token
3d20131  feat(frontend): F-S11 4 custom hooks + translateApiError PT-BR + sitesApi helper
8ea3829  feat(frontend): F-S09 8 components React + demo + vitest workspace (dual env)
79970a4  feat(ops): F-S08 backup Redis gtm:* MinIO daily + restore runbook
6fe850f  feat(api): F-S07 safeAuditPayload + appendAuditWithSanitization + refactor callers
7acf1b2  feat(api): F-S06 validator 2-stage HEAD+GET + integra em deployJob + revalidate
7da76a5  feat(api): F-S05 endpoints Hono 8 rotas + DI test factory + middleware
a2b9d4c  feat(api): F-S04 HostingerAdapter real (REST fetch + withRetry + audit)
ace281d  feat(api): Sprint 0 feature-F — storage/crypto/providers foundation
3503d43  docs(feature-F): migra PRD/ADR/UX/stories/specs auto-provisioner GTM

[Cross-repo Mentoria-Tracking]:
85d64dd  feat(infra): redis-snapshot-compose pra feature F (cross-repo F-S08)
```

---

## Tests

- **Total:** 178/178 passing
- **Workers (node env):** 119 tests em 12 files
  - storage (19), crypto (4), providers (28 = factory 5 + mock 6 + adapter 17), retry (18), sse (10), audit (9), validator (5), build-plugin (3), installations (12 = AC + 3 cross-tenant Codex), sites (5), hosting-accounts (10)
- **Frontend (jsdom env):** 59 tests em 16 files
  - sites components (~27), hooks (~25), routes (~7)
- **Typecheck:** `tsc -b` zero erros
- **Build prod:** OK (frontend 760KB bundle, warning chunk size pré-existente)

---

## Próximo passo (prioridade decrescente)

### 🎯 #1 — F-S14 smoke E2E REAL autenticado (alta prioridade)

**O que falta:** ninguém logou no browser ainda e fez o fluxo completo. Tudo até agora foi smoke "no-JWT" que valida shape de erro 401, não funcionalidade real.

**Como:**
1. Abrir `https://app.colegiomentoria.com.br/sites` (ou wherever tracking-app está deployed) no browser
2. Login Supabase (qualquer conta com tenant Mentoria)
3. Sidebar deve mostrar "Sites Conectados" com badge "NEW"
4. Clicar → empty state "Conectar via Hostinger"
5. Conectar Hostinger token (pegar em hPanel)
6. Listar sites
7. Escolher 1 site (ex: zerohum.com.br) → escolher brand → clicar "Instalar"
8. Watch InstallProgressModal via SSE
9. Verify pós-install: `redis-cli HGETALL gtm:install:<id>`, audit log, dataLayer no site

**Bugs esperados (gaps reais identificados):**
- Frontend pode chamar endpoint que não foi totalmente testado
- SSE EventSource pode falhar em proxy buffer Caddy (já documentado)
- Hostinger MCP endpoints podem ter shape diferente do que `HostingerAdapter` espera (TODO F-S04 SP-1)
- WP Admin password fallback C ainda não implementado (ADR-0008 §3.4)
- Plugin build/fetch precisa rodar antes do primeiro deploy (`bash scripts/fetch-gtm4wp.sh`)

### #2 — Aplicar redis-snapshot no Easypanel (5 min ops)

- Easypanel KV8 → project `evolution` → Adicionar Serviço → Compose
- Cola `infra/easypanel/redis-snapshot-compose.yml` do repo `Mentoria-Tracking`
- Configura env: `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` (mesmo do pg backup)
- Deploy
- Smoke: `docker exec <ctn> /backup_redis_gtm.sh`
- Aguardar 24h pra ver cron rodar

### #3 — Ligar autoDeploy no Easypanel (1 min UI)

Easypanel → tracking-api → Source → checkbox "Auto Deploy". Sem isso, todo merge em main requer deploy manual via API.

### #4 — F-S14 SP-1 followups (depois do smoke real)

Após smoke E2E, vão aparecer issues reais. Candidatos a antecipar:
- Confirmar endpoint Hostinger REST real (story F-S04 deixou TODO sobre `/api/hosting/v1/websites/...`)
- Activation fallback C (ADR-0008 §3.4) — usar WP admin password pra ativar plugin via wp-admin HTTP
- Validator detecção drift via cache CDN (LiteSpeed false positive — F-S06 §Edge Cases)
- Frontend ConnectHostingerPage: SiteCard.onAction wiring com useInstallTracking

### #5 — Sprint 4 candidatos (Onda 1.5)

- **BullMQ migration** pra deploy job durável (Codex #3 débito declarado)
- **Supabase storage backend** (`STORAGE_BACKEND=supabase`) — substituir Redis mock por tabelas reais (ADR-0008a §4)
- **uninstallPlugin** real (cleanup WP filesystem) — atualmente soft delete só
- **Vault** pra secrets em vez de libsodium sealed box (ADR-0008a §3.3)
- **CLAUDE.md no repo** — sumário pra Claude futuro (F-S15 agent skipou por escopo)

---

## Decisões arquiteturais ativas (não revisitar sem boa razão)

| Decisão | Por quê | Quando revisitar |
|---|---|---|
| `setImmediate` worker (não BullMQ) | MVP single-replica, lock 180s mitiga | Onda 1.5 quando multi-replica OU job >120s |
| Redis mock storage (não Supabase) | Sem migration DB no MVP F | Onda 1.5 — `STORAGE_BACKEND=supabase` swap |
| libsodium sealed box (não Vault) | Vault complexity overkill MVP | Onda 1.5 ADR-0008a §3.3 backfill script |
| Router manual no frontend (não react-router) | Padrão herdado ERP-Mentoria | Era 2 se precisar nested routes |
| `autoDeploy=false` Easypanel | Deploy controlado manualmente via API | Quando equipe crescer + CI testes confiáveis |
| Custom Access Token Hook compartilhado tracking+ERP | ADR-0085 cross-product | Era 2 separar products via `user_products` table |
| `MENTORIA_TENANT_ID` const + `ctx.tenantId` real | const = fallback documental, ctx = source-of-truth runtime | Multi-tenant Era 2 — remove const, force ctx |

---

## Setup rápido pra Claude futuro

**Repos (locais):**
- `/Volumes/SSD 2T/Dev/Mentoria-Tracking-App` — app (frontend Vite + workers Hono Node)
- `/Volumes/SSD 2T/Dev/Mentoria-Tracking` — infra (compose YAMLs Easypanel, docs migrados pré-25/05)
- `/Volumes/SSD 2T/Dev/ERP-Mentoria` — ERP separado (referência)

**MCPs disponíveis confirmados:**
- Supabase (`mcp__a222754d-...`) — list_projects, deploy_edge_function, execute_sql, get_publishable_keys, list_branches
- Hostinger (`mcp__hostinger__*`) — só VPS/DNS/domains, NÃO Easypanel
- Easypanel: SEM MCP — usar tRPC API direto via `curl $EASYPANEL_URL/api/trpc/...` com Bearer token
  - URL + token em `/Volumes/SSD 2T/Dev/Mentoria-Tracking/.env.local` (`EASYPANEL_URL`, `EASYPANEL_TOKEN`)

**Endpoints Easypanel tRPC úteis (descobertos por probe):**
- `GET projects.listProjects` — lista projects
- `GET projects.inspectProject?input=...` — detalhe + lista services
- `GET services.app.inspectService?input=...` — env vars + source config do app
- `POST services.app.updateEnv` — atualiza env (CUIDADO: substitui inteira, sempre faça backup antes)
- `POST services.app.deployService` — rebuild + restart (53s típico)
- `POST services.app.restartService` — restart sem rebuild
- `POST services.app.stopService` / `services.app.startService` — start/stop
- `POST services.app.updateSourceGithub` — update source (mas autoDeploy field ignorado)
- `POST services.redis.createService` — cria Redis (auto-deploya)
- `GET services.redis.inspectService?input=...` — info do Redis (inclui password)
- ⚠️ **NÃO existe** logs API via tRPC — checar logs só via Easypanel UI

**Comandos comuns ops:**
```bash
# Health prod
curl https://tracking.colegiomentoria.com.br/api/health

# Smoke shape AC-10
curl https://tracking.colegiomentoria.com.br/api/hosting-accounts

# Gerar keypair libsodium (use Terminal.app fora do chat pra prod)
cd "/Volumes/SSD 2T/Dev/Mentoria-Tracking-App" && npx tsx scripts/generate-libsodium-keypair.ts
# Com --write-env-local pra dev
cd "/Volumes/SSD 2T/Dev/Mentoria-Tracking-App" && npx tsx scripts/generate-libsodium-keypair.ts --write-env-local

# Build plugin local
bash scripts/fetch-gtm4wp.sh
npx tsx scripts/build-plugin.ts --container_id=GTM-WVWQVMP --brand_slug=zerohum --plugin_version=test

# Tests
npx vitest run                                    # tudo (178)
npx vitest run workers/                           # workers (119)
npx vitest run src/                               # frontend (59)
npx tsc -b                                        # typecheck

# Deploy main em Easypanel (manual, autoDeploy=false)
export EASYPANEL_URL=$(grep ^EASYPANEL_URL /Volumes/SSD\ 2T/Dev/Mentoria-Tracking/.env.local | cut -d= -f2-)
export EASYPANEL_TOKEN=$(grep ^EASYPANEL_TOKEN /Volumes/SSD\ 2T/Dev/Mentoria-Tracking/.env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $EASYPANEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"evolution","serviceName":"tracking-api"}}' \
  "$EASYPANEL_URL/api/trpc/services.app.deployService"
```

**Docs centrais:**
- `docs/runbook-auto-provisioner-gtm.md` — runbook ops principal (F-S15, 532 linhas)
- `docs/runbook-ops.md` — backup/restore F-S08
- `docs/adr-0008-auto-provisioner-gtm-architecture.md` — arquitetura
- `docs/adr-0008a-mock-storage-mvp-addendum.md` — Redis storage + libsodium decisions
- `docs/ux-auto-provisioner-gtm-flow.md` — UX completo
- `docs/prd-auto-provisioner-gtm-mvp.md` — PRD
- `docs/stories/F-S01.md` ... `F-S15.md` — stories detalhadas

**Riscos conhecidos ativos:**
- Codex #3 deploy não-durável — mitigado lock 180s, full fix Onda 1.5
- libsodium-wrappers@0.7.16 ESM bug — `createRequire` workaround em 3 arquivos
- Migration MIGRATIONS_FAILED no branch tracking-rebase Supabase — não bloqueia runtime
- Frontend bundle 760KB — code-split candidato Era 2
