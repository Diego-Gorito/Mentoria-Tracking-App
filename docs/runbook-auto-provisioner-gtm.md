# Runbook — Auto-Provisioner GTM (Feature F)

**Status:** LIVE em `https://tracking.colegiomentoria.com.br` (pós Sprint 0+1+2 merged em `main`).
**Última revisão:** 2026-05-26 (pós Codex adversarial review #1+#2+#3 + keypair rotation prod).
**Owner ops:** Diego Gorito (PO + dev solo).
**Stack:** `tracking-api` Hono Node Easypanel KV8 + `tracking-app` Vite Easypanel KV8 + Redis Easypanel KV8 (mock storage) + Supabase staging `cjtwrzlwfqvzukjinmjr` (Auth + Custom Access Token Hook).

> **Disclaimer:** comandos validados em 2026-05-26. Endpoints/keys podem mudar — confira o código em `workers/api/installations.ts` antes de operar em prod. Story origem: [`stories/F-S15.md`](./stories/F-S15.md).

---

## Sumário

1. [Quick reference (comandos comuns)](#1-quick-reference-comandos-comuns)
2. [Troubleshooting matrix](#2-troubleshooting-matrix-sintoma--causa--fix)
3. [Redis state inspection](#3-redis-state-inspection)
4. [Backup/restore mock storage](#4-backuprestore-mock-storage)
5. [Migração futura pra DB](#5-migração-futura-pra-db-onda-15)
6. [Cenários comuns](#6-cenários-comuns)
7. [Manutenção periódica](#7-manutenção-periódica)
8. [Riscos conhecidos / débitos técnicos](#8-riscos-conhecidos--débitos-técnicos)
9. [Cross-links](#9-cross-links)

---

## 1. Quick reference (comandos comuns)

Todos os comandos `redis-cli` assumem execução **dentro da network Easypanel KV8** (hostname `redis` resolvível). Pra rodar do host KV8 use Easypanel → tracking-api → Terminal (ou `docker exec`).

### 1.1 Account inspection

```bash
# Verificar account status (todos campos)
redis-cli -h redis HGETALL gtm:account:<account_id>

# Listar todos accounts conectados
redis-cli -h redis SMEMBERS gtm:account:list

# Filtrar accounts do tenant Mentoria (UUID real 93031821-455e-490b-92c9-1ccbebf1b30f)
redis-cli -h redis SMEMBERS gtm:account:by_tenant:93031821-455e-490b-92c9-1ccbebf1b30f

# Marcar token como expirado (force re-validate na UI)
redis-cli -h redis HSET gtm:account:<account_id> status token_expired
```

### 1.2 Installation inspection

```bash
# Verificar installation atual (HASH com todos campos)
redis-cli -h redis HGETALL gtm:install:<installation_id>

# Listar todas installations
redis-cli -h redis SMEMBERS gtm:install:list

# Listar installations de 1 account
redis-cli -h redis SMEMBERS gtm:install:by_account:<account_id>

# Lookup por site (idempotency key)
# domain_sha1 = sha1("zerohum.com.br") — usar `echo -n "domain" | sha1sum`
redis-cli -h redis GET gtm:install:by_site:<sha1_do_domain>

# Force revalidate via API (re-roda validador 2-stage HEAD+GET)
curl -X POST "$API_BASE/api/installations/<installation_id>/revalidate" \
  -H "Authorization: Bearer $SUPABASE_JWT"

# Deploy/redeploy (cria draft + dispara deployJob async)
curl -X POST "$API_BASE/api/installations/<installation_id>/deploy" \
  -H "Authorization: Bearer $SUPABASE_JWT"

# Status atual (frontend polling endpoint)
curl "$API_BASE/api/installations/<installation_id>" \
  -H "Authorization: Bearer $SUPABASE_JWT"
```

### 1.3 Audit log

```bash
# Últimas 50 entries do audit log da installation (LIFO — newest first)
redis-cli -h redis LRANGE gtm:audit:<installation_id> 0 49

# Audit log global (cross-installation, max 5000 entries)
redis-cli -h redis LRANGE gtm:audit:global 0 49

# Contar entries totais do audit
redis-cli -h redis LLEN gtm:audit:<installation_id>
```

### 1.4 Lock management

```bash
# Verificar se lock existe + TTL restante (segundos)
redis-cli -h redis EXISTS gtm:lock:install:<installation_id>
redis-cli -h redis TTL gtm:lock:install:<installation_id>

# Liberar lock travado (worker crash mid-deploy)
redis-cli -h redis DEL gtm:lock:install:<installation_id>
```

### 1.5 Inspect tracking-api env (Easypanel API)

```bash
# Via Easypanel tRPC inspectService (precisa $EASYPANEL_API_TOKEN)
curl -s "$EASYPANEL_URL/api/trpc/services.app.inspectService" \
  -H "Authorization: Bearer $EASYPANEL_API_TOKEN" \
  --data-urlencode 'input={"projectName":"tracking","serviceName":"tracking-api"}' \
  | jq '.result.data.json.env'

# Easypanel UI alternativa: Dashboard → tracking → tracking-api → Environment tab
```

### 1.6 SSE events (tail logs de deploy real-time)

```bash
# Conectar ao stream SSE (browser EventSource ou curl --no-buffer)
curl -N "$API_BASE/api/installations/<id>/events?token=$SUPABASE_JWT"
# Eventos: upload_started, upload_complete, validation_passed, etc.
```

---

## 2. Troubleshooting matrix (sintoma → causa → fix)

| # | Sintoma | Causa provável | Fix |
|---|---|---|---|
| 1 | Token Hostinger expirado / 401 | Diego revogou no hpanel.hostinger.com OU token expirou | Reconectar via `/sites/connect` na UI → backend faz `sealEncrypt` + `storage.updateAccount` |
| 2 | Site não aparece em `/sites` | Cache 60s frontend OR account ainda não validou via `pingToken()` | Click refresh OU aguardar 60s. Se persistir: `redis-cli HGETALL gtm:account:<id>` confirma `status='active'` |
| 3 | Drift falso-positivo (validator falha em site OK) | Cache WP (LiteSpeed / WP-Rocket) interfere com regex F-S06 | Flush cache no WP-admin → `POST /api/installations/<id>/revalidate` |
| 4 | Install travado em `uploading` | Worker crash mid-deploy → lock prende 180s OR deployJob crashed silenciosamente | Aguardar 180s (lock TTL) OR `redis-cli DEL gtm:lock:install:<id>` + `POST .../deploy` novamente |
| 5 | Modal SSE não atualiza | Proxy buffer Caddy/Traefik (Easypanel default) bufferiza `text/event-stream` | Verificar config proxy: `X-Accel-Buffering: no` header OR `flush_interval=0` no reverse proxy. Frontend fallback polling 5s deve assumir |
| 6 | `dataLayer` ausente pós-install no DOM | GTM4WP não ativou (admin não clicou Activate OU fallback C de auto-activation falhou) | Manual: WP-admin → Plugins → "Activate GTM4WP Mentoria" → re-validate |
| 7 | Container ID errado no DOM (GTM-xxx ≠ esperado) | Bootstrap PHP `update_option('gtm4wp-options', ...)` falhou na activation | Editar manual via WP-admin → GTM4WP settings → cole container correto OR re-deploy |
| 8 | **Codex #3** — deploy travado, lock 180s expirou mas status ainda `uploading` | Job perdido por container restart (setImmediate não-durável) | Inspect deployJob logs: `docker logs tracking-api 2>&1 \| grep deployJob`. Se confirmado restart, force-update status + re-deploy |
| 9 | `[db] SUPABASE_URL env var não configurado` no boot tracking-api | Easypanel env tab perdeu vars OR rebuild não pegou env | Easypanel → tracking-api → Environment → conferir `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Restart serviço |
| 10 | Endpoints retornam `403 TENANT_CONTEXT_MISSING` mesmo logado | Custom Access Token Hook **não ativo** OR usuário Supabase sem `tenant_id` no profile | Supabase Dashboard → Auth → Hooks → confirma hook `custom_access_token` ativo + URL/secret OK. Verifica `profiles.tenant_id IS NOT NULL` no DB |
| 11 | Redis connection error `NOAUTH Authentication required` | `REDIS_URL` no Easypanel não contém `default:<password>@` | Editar var: `REDIS_URL=redis://default:<password>@redis:6379`. Restart tracking-api |
| 12 | 404 em `/api/hosting-accounts` (ou qualquer endpoint novo) pós-merge | Easypanel `autoDeploy=false` → último push em `main` não foi deployed | Force deploy via Easypanel UI (Deployments → Deploy now) OR via tRPC: `curl $EASYPANEL_URL/api/trpc/services.app.deployService -d '{"projectName":"tracking","serviceName":"tracking-api"}'` |
| 13 | `STORAGE_ENCRYPTION_PUBLIC_KEY ausente — ver ADR-0008a §3.2` no boot | Keypair libsodium não populado no env Easypanel após rotation | Rodar `npx tsx scripts/generate-libsodium-keypair.ts` (terminal isolado), cola as 2 linhas no Easypanel env tab, restart |
| 14 | `sealDecrypt` lança "wrong secret key" em todos os accounts | Keypair foi rotacionado **sem** migration de re-encrypt → tokens antigos cifrados com pubkey velha | (a) restaurar keypair antigo OR (b) deletar accounts (`redis-cli DEL gtm:account:*`) e re-conectar todos via UI. Ver §6.8 |
| 15 | Webhook hook falha com `invalid signature` no Supabase | `AUTH_HOOK_WEBHOOK_SECRET` no Supabase ≠ secret no edge function `custom-access-token` | Re-gerar secret aleatório, atualizar nos dois lados (Supabase Dashboard → Auth → Hooks + edge function env), redeploy edge function |

---

## 3. Redis state inspection

Mock storage F-S01 usa namespace `gtm:*` em Redis (per [ADR-0008a §2.3](./adr-0008a-mock-storage-mvp-addendum.md)). Sem migrations DB no MVP F.

### 3.1 Visão geral do namespace

| Key pattern | Tipo | Conteúdo |
|---|---|---|
| `gtm:account:<id>` | HASH | Campos do `HostingAccount` (token_encrypted, status, last_validated_at, ...) |
| `gtm:account:list` | SET | Todos account_ids existentes (pra listAll) |
| `gtm:account:by_tenant:<tenant_id>` | SET | account_ids do tenant (Onda 2 prep multi-tenant) |
| `gtm:install:<id>` | HASH | Campos do `GtmInstallation` (status, upload_dir_name, last_validation_result, ...) |
| `gtm:install:list` | SET | Todos installation_ids existentes |
| `gtm:install:by_account:<account_id>` | SET | installation_ids da conta |
| `gtm:install:by_site:<sha1(domain)>` | STRING | installation_id — idempotency lookup |
| `gtm:audit:<installation_id>` | LIST | Audit events (LPUSH + LTRIM 0 999 → max 1000 entries) |
| `gtm:audit:global` | LIST | Cross-installation audit (max 5000 entries) |
| `gtm:lock:install:<installation_id>` | STRING | Distributed lock (`SET NX EX 180`) |

### 3.2 Comandos comuns de inspeção

```bash
# Tudo de 1 account
redis-cli -h redis HGETALL gtm:account:<account_id>

# Tudo de 1 installation
redis-cli -h redis HGETALL gtm:install:<installation_id>

# Audit log completo (até 1000 entries)
redis-cli -h redis LRANGE gtm:audit:<installation_id> 0 -1

# Listar todas as installations
redis-cli -h redis SMEMBERS gtm:install:list

# Listar todos os accounts
redis-cli -h redis SMEMBERS gtm:account:list

# Verificar se 1 lock existe + tempo restante (s)
redis-cli -h redis EXISTS gtm:lock:install:<installation_id>
redis-cli -h redis TTL gtm:lock:install:<installation_id>

# Total de keys no Redis (incluindo Metabase cache e n8n dedup — NÃO só gtm:*)
redis-cli -h redis DBSIZE
```

### 3.3 KEYS vs SCAN — sempre prefira SCAN

```bash
# RUIM em prod (Redis bloqueia main thread enquanto varre milhões de keys):
redis-cli -h redis KEYS 'gtm:*'

# BOM (cursor incremental, batches de 100):
redis-cli -h redis --scan --pattern 'gtm:*' --count 100

# Contar quantas keys gtm:* tem
redis-cli -h redis --scan --pattern 'gtm:*' | wc -l

# Inspect só audit logs (1 por install):
redis-cli -h redis --scan --pattern 'gtm:audit:*'
```

### 3.4 Cleanup seletivo (CUIDADO)

```bash
# Deletar 1 account específico (não toca installs órfãs — limpar separado)
redis-cli -h redis DEL gtm:account:<account_id>
redis-cli -h redis SREM gtm:account:list <account_id>

# Limpar todos os audits (preserva install state) — só pra debug local
redis-cli -h redis --scan --pattern 'gtm:audit:*' | xargs -I {} redis-cli -h redis DEL {}

# NUKE total do namespace gtm:* (NÃO em prod sem backup recente)
redis-cli -h redis --scan --pattern 'gtm:*' | xargs -I {} redis-cli -h redis DEL {}
# Preserva metabase:* e track:dedup:* (outros namespaces da stack)
```

---

## 4. Backup/restore mock storage

Backup/restore documentado em **[`runbook-ops.md`](./runbook-ops.md)** (story F-S08). Não duplicar aqui.

Resumo: cron diário 03h BRT roda `scripts/backup_redis_gtm.sh` no compose `tracking-backup` (repo irmão `Mentoria-Tracking/infra/easypanel/tracking-backup-compose.yml`) → exporta JSONL key-by-key filtrado por `gtm:*` → upload MinIO `tracking-backups/redis/`. Retenção 30d alinhada com pg backup.

**Procedure restore key-by-key (após desastre redis-data):** ver [`runbook-ops.md`](./runbook-ops.md) §"Restore `gtm:*` snapshot" — passo-a-passo isolado em container temp + REPLACE seletivo no prod.

**Verificação mensal:** rodar `mc ls minio/tracking-backups/redis/` no primeiro dia do mês — deve listar 28-31 arquivos `gtm-snapshot-YYYY-MM-DD.tar.gz` com size > 100 bytes.

---

## 5. Migração futura pra DB (Onda 1.5)

Quando ERP `main` estabilizar e Diego liberar, migrar mock Redis → Supabase `tracking.*` tables. Não aplicar antes — ver critérios "retry rebase" e custos em **[ADR-0008a §4](./adr-0008a-mock-storage-mvp-addendum.md#4-migração-futura-pra-db-onda-15)**.

Resumo: migration 0245-0247 (specs prontos no ADR-0008 §3.5), `SupabaseGtmStorage` impl espelhando `RedisGtmStorage`, script `migrate_mock_storage_to_supabase.ts` com dual-read 24-48h, flag flip `STORAGE_BACKEND=supabase`. Estimativa total ~3-4h.

---

## 6. Cenários comuns

### 6.1 Token Hostinger expirado / revogado

Diego revogou o token no hpanel.hostinger.com (ou Hostinger expirou unilateralmente). Próximo `provider.pingToken()` retorna 401 → backend marca `status='token_expired'` no Redis → UI mostra banner amarelo no `/sites`.

**Procedure:**
1. Diego entra em hpanel.hostinger.com → Profile → API Tokens → "Generate New Token"
2. Cola token novo na UI `/sites/connect` (mesmo account label)
3. Backend faz `sealEncrypt(token)` + `storage.updateAccount({ token_encrypted, status: 'active' })`
4. Backend chama `provider.pingToken()` pra validar → marca `last_validated_at`
5. Site list deve voltar a aparecer em <60s (cache invalidation)

### 6.2 Site não aparece em `/sites`

Cache frontend 60s OR `account.status !== 'active'`. Não é bug por padrão.

**Diagnose:**
```bash
# Confirma account ativo
redis-cli -h redis HGET gtm:account:<id> status   # esperado: "active"
redis-cli -h redis HGET gtm:account:<id> last_validated_at
```

Se `status='active'` mas sites não aparecem em <60s: pode ser `provider.listSites()` lento (Hostinger API lenta). Refresh manual na UI força nova chamada.

### 6.3 Drift detectado falso-positivo

Validator F-S06 falha em site OK pelo regex bater HTML cacheado sem inject GTM. Comum em sites com LiteSpeed Cache ou WP-Rocket.

**Procedure:**
1. WP-admin → LiteSpeed Cache → Toolbox → Purge All
2. `POST /api/installations/<id>/revalidate` (não reinstala plugin, só re-roda validator)
3. Se falhar de novo: investigar HTML real com `curl https://<domain>/ | grep -o "GTM-[A-Z0-9]\{6,8\}"`

### 6.4 Install travado em `uploading`

Worker crashed mid-deploy (Codex #3 — setImmediate não-durável). Lock 180s persiste mas job não tem quem o execute.

**Procedure:**
1. Aguardar 180s (lock TTL natural)
2. Inspect logs: `docker logs tracking-api 2>&1 | grep <installation_id>`
3. Se confirma crash:
   ```bash
   redis-cli -h redis DEL gtm:lock:install:<installation_id>
   redis-cli -h redis HSET gtm:install:<id> status draft attempt_count 0
   ```
4. Re-deploy via UI ou `curl POST .../deploy`

**Onda 1.5:** mitigação real = BullMQ persistent queue (ADR-0008 §3.4 + §3.10).

### 6.5 SSE não atualiza modal (UI parece "morta")

Proxy bufferiza `text/event-stream` em vez de flushar event-by-event. Caddy/Traefik default = bufferiza.

**Diagnose:**
```bash
# Tail stream direto do API (bypass UI proxy) — se atualizar real-time = proxy issue
curl -N "$API_BASE/api/installations/<id>/events?token=$JWT"
```

Se atualiza no curl direto mas não na UI: Felix valida config reverse-proxy. Frontend tem fallback polling 5s.

### 6.6 Multiple installations no mesmo domain

**Não acontece por design.** Idempotency garantida via `gtm:install:by_site:<sha1(domain)>` STRING key (per ADR-0008a §2.3). Re-deploy no mesmo domain = UPDATE no install existente, NÃO INSERT novo.

**Verifique:**
```bash
DOMAIN_SHA1=$(echo -n "zerohum.com.br" | sha1sum | awk '{print $1}')
redis-cli -h redis GET gtm:install:by_site:$DOMAIN_SHA1
# Output: installation_id (sempre 1, nunca 2+)
```

### 6.7 Trocar UUID tenant Mentoria

Cenário: novo project Supabase criado, UUID tenant mudou. Constante hardcoded em `workers/lib/constants.ts` linha 30.

**Procedure:**
1. Conferir UUID novo no Supabase: `SELECT id FROM core.tenants WHERE slug='mentoria'`
2. Editar `workers/lib/constants.ts` linha 30: `export const MENTORIA_TENANT_ID = '<NOVO_UUID>' as TenantId;`
3. Atualizar todos `tenant_id` no Redis (script ad-hoc):
   ```bash
   # Migration manual — atualiza tenant_id em todos accounts/installs/audits
   redis-cli -h redis --scan --pattern 'gtm:account:*' \
     | xargs -I {} redis-cli -h redis HSET {} tenant_id <NOVO_UUID>
   ```
4. Reaplicar Custom Access Token Hook com novo UUID
5. Commit + deploy
6. Smoke: login → `/sites` deve listar accounts pré-existentes

**Nota:** em prod hoje `ctx.tenantId` do JWT prevalece (Codex fix #1 commit `f7f81e8`), mas a constante segue como fallback documental + smoke local.

### 6.8 Rotacionar keypair libsodium em prod

Mitigação se private key vazou OR rotação preventiva trimestral.

**ATENÇÃO:** rotação **invalida todos tokens encriptados existentes**. Procedure inclui re-conectar todos accounts via UI.

**Procedure:**
1. Em terminal **isolado** (não-shared, NÃO commita scripts):
   ```bash
   cd /Volumes/SSD\ 2T/Dev/Mentoria-Tracking-App
   npx tsx scripts/generate-libsodium-keypair.ts
   ```
   Stdout imprime 2 linhas `STORAGE_ENCRYPTION_PUBLIC_KEY=...` + `STORAGE_ENCRYPTION_SECRET_KEY=...`
2. Easypanel → tracking-api → Environment → substitui as 2 vars com os novos valores
3. Restart tracking-api: Easypanel → Deployments → Restart
4. **Smoke imediato:** `curl $API_BASE/healthz` → 200
5. Deletar accounts antigos (tokens cifrados com pubkey velha não decifram):
   ```bash
   redis-cli -h redis --scan --pattern 'gtm:account:*' | xargs -I {} redis-cli -h redis DEL {}
   redis-cli -h redis DEL gtm:account:list
   redis-cli -h redis --scan --pattern 'gtm:account:by_tenant:*' | xargs -I {} redis-cli -h redis DEL {}
   ```
6. Re-conectar todos accounts via UI `/sites/connect`
7. Documentar rotation date em CHANGELOG + audit log

**Alternativa não-destrutiva:** dual-key window — keep old keypair + new keypair vars (`*_OLD_*`), backend tenta decrypt com new → fallback old. Implementação não está no MVP F (débito).

### 6.9 Reset hook secret `AUTH_HOOK_WEBHOOK_SECRET`

Cenário: secret vazou em log ou compliance review pediu rotação.

**Procedure:**
1. Gerar secret novo: `openssl rand -base64 32`
2. Supabase Dashboard → Auth → Hooks → custom_access_token → Edit → cole secret novo + save
3. Edge function env: `supabase secrets set AUTH_HOOK_WEBHOOK_SECRET=<novo>` (CLI) OU Dashboard → Edge Functions → `custom-access-token` → Secrets
4. Redeploy edge function: `supabase functions deploy custom-access-token`
5. Smoke: login fresco → conferir JWT tem `tenant_id` claim
   ```bash
   # Decode JWT (jq não decode base64url — usa node)
   node -e "console.log(JSON.parse(Buffer.from('<JWT>'.split('.')[1], 'base64url').toString()))"
   ```

### 6.10 Adicionar nova brand ao `BRAND_GTM_MAP`

Cenário: Mentoria adquire/cria nova escola → precisa novo container GTM e brand_slug.

**Procedure:**
1. Criar container no Google Tag Manager → copiar ID (formato `GTM-XXXXXXX`)
2. Atualizar `core.schools` (ou tabela equivalente) com `gtm_container_id` da escola nova
3. Editar `workers/lib/constants.ts`:
   ```typescript
   export const BRAND_GTM_MAP = Object.freeze({
     'mentoria': 'GTM-5J587HS3',
     'mentoria-app': 'GTM-KMK749ZW',
     'zerohum': 'GTM-WVWQVMP',
     'ifrn': 'GTM-5J587HS3',
     'nova-brand': 'GTM-NOVOABCD',  // ← adicionar
   } as const);
   ```
4. TypeScript `BrandSlug` type auto-atualiza (keyof typeof)
5. Frontend `/sites/connect` form dropdown auto-popula (lê do mesmo enum via types compartilhados)
6. Build + deploy
7. Smoke: instalar plugin em 1 site da nova brand → validator confere container_id correto no DOM

---

## 7. Manutenção periódica

### 7.1 Bump GTM4WP version (security patch upstream)

GTM4WP é vendored no plugin build (F-S13). Quando upstream lança patch:

```bash
# 1. Update versão vendored (script fetch-gtm4wp.sh assume Mentoria-Tracking repo irmão OR aqui em scripts/ Onda 1.5)
bash scripts/fetch-gtm4wp.sh --version=1.19

# 2. Bump constant em workers/lib/constants.ts:
#    export const DEFAULT_PLUGIN_VERSION = 'gtm4wp-1.19+bootstrap-v1' as const;

# 3. Rebuild Docker image (CI ou local)
docker build -t tracking-api:v<new> -f Dockerfile.api .

# 4. Smoke retest em 1 site (zerohum recomendado): /sites → Install → modal completa OK
# 5. Push main → Easypanel auto-deploy (se autoDeploy=true) OR force deploy manual
```

**Frequência sugerida:** GTM4WP security advisories OR a cada 3 meses preventivo.

### 7.2 Rotacionar libsodium keypair

Ver §6.8 acima. **Frequência sugerida:** trimestral OU após qualquer suspeita de leak (terminal compartilhado, screen recording, log indevido).

### 7.3 Rotacionar Hostinger token

Tokens Hostinger não expiram automaticamente, mas rotacionar trimestralmente é boa prática.

**Procedure:**
1. hpanel.hostinger.com → Profile → API Tokens → Generate New
2. UI `/sites/connect` → cola novo token (mesmo label do account existente)
3. Backend sobrescreve `token_encrypted` no Redis (mantém `id` + `installations` ligadas)
4. Smoke: `/sites` lista sites com `last_validated_at` recente
5. hpanel.hostinger.com → revogar token antigo

### 7.4 Backup Redis verification (mensal)

```bash
# Listar backups dos últimos 31 dias
mc ls minio/tracking-backups/redis/ | tail -31

# Verificar pelo menos 28 arquivos (1/dia, tolerância 3d falha cron)
mc ls minio/tracking-backups/redis/ | wc -l

# Inspect last backup
LATEST=$(mc ls minio/tracking-backups/redis/ | tail -1 | awk '{print $NF}')
mc stat "minio/tracking-backups/redis/$LATEST"
# Esperado: size > 100 bytes
```

Se < 28 arquivos no mês: investigar cron `tracking-backup` compose (ver `runbook-ops.md` §"Troubleshooting").

---

## 8. Riscos conhecidos / débitos técnicos

### 8.1 Codex #3 — deploy não-durável (single-replica + setImmediate)

**Sintoma:** se container `tracking-api` reinicia mid-deploy, o job é perdido. Lock 180s expira sem completion.

**Mitigação atual:**
- Lock TTL 180s (não 60s) cobre worst case retry exponencial + validate (`workers/api/installations.ts` linha 234).
- Audit log persiste o que rolou até o crash.
- UI mostra status `uploading` indefinidamente até timeout do polling (frontend timeout 5min) — Diego sabe que algo está errado.

**Plano Onda 1.5:** trocar `setImmediate(() => deployJob(...))` por **BullMQ** persistent queue + Redis-backed (ver [ADR-0008 §3.4](./adr-0008-auto-provisioner-gtm-architecture.md) e backlog Onda 1.5).

**Workaround manual:** §6.4 procedure (DEL lock + reset status + re-deploy).

### 8.2 `libsodium-wrappers@0.7.16` ESM bug

Upstream ships broken ESM bundle (relative import `./libsodium.mjs` não resolve em Node ESM). Workaround temporário via `createRequire` em 3 arquivos:
- `workers/lib/storage/crypto.ts` (linha 19-21)
- `scripts/generate-libsodium-keypair.ts` (linha 23-28)
- (potencial 3º arquivo em testes — buscar com `grep -rn "createRequire" workers/ scripts/`)

**Quando reverter:** upstream consertar OR migrar pra outra biblioteca (age, sodium-native, etc.). TODO comentado em cada arquivo.

### 8.3 `MENTORIA_TENANT_ID` resolvido em 2026-05-27 mas mantido como const placeholder

UUID `93031821-455e-490b-92c9-1ccbebf1b30f` está hardcoded em `workers/lib/constants.ts` linha 30. Em prod **não é usado** — `ctx.tenantId` do JWT (via `supabase.auth.getClaims` + Custom Access Token Hook) prevalece desde Codex fix #1 (commit `f7f81e8`).

**Mantido pra:**
- Smoke local quando Custom Access Token Hook ausente
- Fallback documental
- Tests que não injetam JWT real

**Onda 1.5:** quando ERP main estabilizar e migrar pra DB real, ler de `core.tenants` direto via `getStorage().getTenantBySlug('mentoria')` no boot. Constante então pode ser removida.

### 8.4 Validator F-S06 sensível a cache WP

Regex bate no HTML servido — se LiteSpeed/WP-Rocket serve versão cacheada sem GTM, validator falha. Frequência observada nos smoke F-S14: ~5% dos sites primeira install.

**Mitigação:** §6.3 procedure (flush cache → revalidate). **Onda 1.5:** Playwright validator real (executa JS, detecta `window.dataLayer` runtime) — ver ADR-0008 §3.6.

### 8.5 Single-replica tracking-api

Easypanel hoje roda 1 replica do `tracking-api`. Se Easypanel auto-escala (replicas=2+ em deploy rolling), distributed lock `gtm:lock:install:<id>` previne 2x deploy concurrent no mesmo site (atomic `SET NX EX`). Mas race em audit log ordering possível (LPUSH não-determinístico cross-process).

**Mitigação atual:** auditoria não é financial-critical, ordering aproximado aceitável. **Onda 2:** se multi-tenant ativar replicas, considerar audit log via Postgres com `INSERT ... ORDER BY created_at`.

---

## 9. Cross-links

- **Story origem:** [`stories/F-S15.md`](./stories/F-S15.md) — AC-1 a AC-5 + DoD
- **Backup/restore detalhado:** [`runbook-ops.md`](./runbook-ops.md) — F-S08 (snapshot Redis `gtm:*` daily 03h BRT + restore key-by-key)
- **ADR arquitetura:** [`adr-0008-auto-provisioner-gtm-architecture.md`](./adr-0008-auto-provisioner-gtm-architecture.md) — provider adapter, validador 2-stage, retry, idempotência, LGPD
- **ADR mock storage:** [`adr-0008a-mock-storage-mvp-addendum.md`](./adr-0008a-mock-storage-mvp-addendum.md) — Redis namespace, libsodium sealed box, migração futura DB
- **PRD upstream:** [`prd-auto-provisioner-gtm-mvp.md`](./prd-auto-provisioner-gtm-mvp.md)
- **UX flow:** [`ux-auto-provisioner-gtm-flow.md`](./ux-auto-provisioner-gtm-flow.md)
- **Easypanel env vars:** [`easypanel-env-cutover.md`](./easypanel-env-cutover.md)
- **Story F-S08 backup:** [`stories/F-S08.md`](./stories/F-S08.md)
- **Story F-S13 plugin build:** [`stories/F-S13.md`](./stories/F-S13.md) (em paralelo — `scripts/fetch-gtm4wp.sh`)
- **Story F-S14 smoke:** [`stories/F-S14.md`](./stories/F-S14.md) (alimentou troubleshooting matrix)

### Códigos referenciados

- `workers/lib/constants.ts` — `MENTORIA_TENANT_ID` + `BRAND_GTM_MAP` + `DEFAULT_PLUGIN_VERSION`
- `workers/lib/storage/RedisGtmStorage.ts` — implementação mock storage (key prefixes em linhas 39-53)
- `workers/lib/storage/crypto.ts` — `sealEncrypt` / `sealDecrypt` libsodium
- `workers/api/installations.ts` — endpoints `/api/installations/*` (lock TTL 180s linha 234)
- `workers/api/deployJob.ts` — worker async pipeline 8 steps
- `workers/api/middleware.ts` — auth via `supabase.auth.getClaims` (Codex fix #2)
- `workers/api/tenantGuard.ts` — `resolveTenantId` + `assertTenantOwnership` (Codex fix #1)
- `scripts/generate-libsodium-keypair.ts` — CLI rotação keypair
- `scripts/backup_redis_gtm.sh` — backup cron daily

---

**Próxima revisão sugerida:** após primeira incidência real em prod (Diego anota lições aprendidas) OR após Onda 1.5 migração DB (atualizar §5 + §8).
