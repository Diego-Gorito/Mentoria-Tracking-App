# ADR-0008a — Mock Storage MVP (Addendum to ADR-0008)

**Status:** Approved (Diego, 2026-05-25 pós-leitura ADR-0008)
**Tipo:** Addendum (substitui §3.5 + parte de §6 do ADR-0008)
**Data:** 2026-05-25
**Autor:** Aria (System Architect, Opus 4.7)
**Substitui de ADR-0008:** §3.5 (DB schema 3 migrations) + §6 Story 1 (migrations Dara)
**Mantém de ADR-0008:** todo o resto — provider adapter pattern (§3.3), validador 2-stage (§3.6), plugin híbrido fork mínimo (§3.2), token rotação manual (§3.8), retry policy (§3.9), idempotência semantics (§3.10), LGPD audit policy (§3.7)
**Referência upstream:** [`adr-0008-auto-provisioner-gtm-architecture.md`](./adr-0008-auto-provisioner-gtm-architecture.md)

---

## 1. Mudança de direção (decisão Diego pós-ADR-0008)

> **Diego (verbatim 25/05/2026):** "MVP F sem migrations DB. Mock storage. Cada migration nova = mais drift = mais conflito no rebase futuro com main."

**Contexto:** branch staging Supabase `cjtwrzlwfqvzukjinmjr` continua orfã (cutover Fase 6 abortado 24/05 per CLAUDE.md). Cada nova migration aplicada na branch:
1. Aumenta drift contra ERP main (já 75 migrations atrás)
2. Aumenta probabilidade de conflito no eventual `merge_branch`
3. Cria débito porque ERP main vai precisar IGNORAR essas migrations (são de produto-feature, não da plataforma)

**Manifesto 22/05 vigente:** velocity > purity no MVP F. Throwaway code aceitável pra validar técnica. Diego é único usuário; nada a preservar.

**Onda 1.5 reverte:** quando ERP main estabilizar (CLAUDE.md "retry rebase" critérios), migrar mock storage → `tracking.*` tables formais. Custo estimado: ~2-4h Dex+Dara (§6 deste addendum).

---

## 2. Decisão revisada §3.5 — storage mock

### 2.1 Trade-off A1 (JSON file) vs A2 (Redis)

| Critério | A1 — JSON file no volume | A2 — Redis com AOF |
|---|---|---|
| Infra adicional | Zero (volume Easypanel) | Zero (Redis JÁ existe — `infra/easypanel/redis-compose.yml`, 256MB cache layer ativo) |
| Latência read/write | ~1-5ms (disk SSD) | ~0.5-2ms (network local Docker) |
| Concorrência | Lock file flaky em multi-process | Atomic ops nativas (HSET, SADD, WATCH/MULTI) |
| Backup pré-existente | Incluir em MinIO cron 03h é trivial (~5min config) | Redis AOF persiste no volume `redis-data` — pode incluir em mesmo MinIO backup |
| Migração futura → SQL | Read JSON file → INSERT loop. Trivial. | SCAN + HGETALL → INSERT loop. Levemente mais complexo. |
| Debug | `cat /data/.../gtm-installations.json` direto | `redis-cli HGETALL gtm:install:...` |
| Risk corruption em crash | Atomic write tmp+rename mitiga, mas race em fsync possível | AOF `appendfsync everysec` perde até 1s no pior caso |
| Multi-replica tracking-api | Não suporta (file lock cross-container ruim) | Suporta nativamente (Redis é shared) |
| LoC implementação | ~150 LoC (lock + atomic write + JSON parse) | ~80 LoC (ioredis client + key conventions) |
| Throwaway custo | Apaga 1 arquivo + remove volume | DEL prefix `gtm:*` no Redis (preserva outros caches) |

### 2.2 Escolha: **A2 — Redis** ✅

**Rationale curto:**
1. **Infra já existe** — `redis:7-alpine` rodando em KV8 com AOF, volume `redis-data` persistente, healthcheck ativo. Custo marginal = zero.
2. **Concorrência atomic nativa** — tracking-api roda em 1 container hoje, mas Easypanel pode escalar replicas auto-restart durante deploy; JSON file vira race condition. Redis HSET/SETNX cobre.
3. **Migração futura mais limpa** — read Redis SCAN é stateless (sem worry sobre file lock no momento do export). Diego pode fazer dual-write durante transição sem custom file watcher.
4. **Backup já consolidado** — Redis volume já fica no KV8 disk; estender `tracking-backup` compose pra incluir `redis-cli BGSAVE` + upload RDB pro MinIO = ~10 LoC bash.

**Quando A1 venceria:** se não tivesse Redis na stack. Hoje tem. Decisão direta.

### 2.3 Convenções de key Redis

Namespace prefix `gtm:*` (separa de cache Metabase `metabase:*` + dedup n8n `track:dedup:*`).

```
gtm:account:<account_id>                  HASH   (campos do HostingAccount)
gtm:account:list                          SET    (account_ids existentes — pra listAll)
gtm:account:by_tenant:<tenant_id>         SET    (account_ids do tenant — Onda 2 prep)

gtm:install:<installation_id>             HASH   (campos do GtmInstallation)
gtm:install:list                          SET    (installation_ids existentes)
gtm:install:by_account:<account_id>       SET    (installation_ids da conta)
gtm:install:by_site:<sha1(site_domain)>   STRING (installation_id — idempotency lookup)

gtm:audit:<installation_id>               LIST   (eventos audit append, LPUSH; max 1000 entries via LTRIM)
gtm:audit:global                          LIST   (todos eventos cross-installation, max 5000 entries)

gtm:lock:install:<installation_id>        STRING (SET NX EX 60 — lock distribuído pra deploy concurrent)
```

**Idempotência por site** (substitui UNIQUE constraint DB): chave `gtm:install:by_site:<sha1(site_domain)>` aponta pro installation_id atual. Re-install no mesmo domain = UPDATE no mesmo install_id.

**SHA1 do domain como key suffix:** evita problemas com chars especiais em domain (`my-site.com.br` OK mas sanitização universal preferível).

### 2.4 Schema mock — TypeScript interfaces

Arquivo: `tracking-api/src/lib/storage/types.ts`

```typescript
// Branded types pra evitar mistura de IDs
export type AccountId = string & { readonly __brand: 'AccountId' };
export type InstallationId = string & { readonly __brand: 'InstallationId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type ISO8601 = string & { readonly __brand: 'ISO8601' };

export interface HostingAccount {
  id: AccountId;                      // uuid v4
  tenant_id: TenantId;                // hardcoded "mentoria" UUID no MVP F
  provider: 'hostinger';              // só hostinger no MVP F
  account_label: string;              // ex "Diego pessoal"
  token_encrypted: string;            // libsodium sealed box base64 (§3 abaixo)
  wp_admin_creds_encrypted?: string;  // opcional, sealed box base64
  account_email?: string;             // metadata, não-PII
  status: 'active' | 'token_expired' | 'revoked';
  last_validated_at?: ISO8601;
  created_at: ISO8601;
  updated_at: ISO8601;
}

export interface GtmInstallation {
  id: InstallationId;                 // uuid v4
  tenant_id: TenantId;
  hosting_account_id: AccountId;
  site_domain: string;                // ex "zerohum.com.br"
  brand_slug: 'mentoria' | 'mentoria-app' | 'zerohum' | 'ifrn';
  gtm_container_id: string;           // snapshot ex "GTM-WVWQVMP"
  plugin_version: string;             // ex "gtm4wp-1.18+bootstrap-v1"
  status:
    | 'draft' | 'uploading' | 'uploaded_pending_activation'
    | 'activating' | 'validating' | 'installed' | 'failed' | 'uninstalled';
  upload_dir_name?: string;           // returned by MCP, ex "gtm4wp-mentoria-aB3kZ9pQ"
  attempt_count: number;
  last_attempted_at?: ISO8601;
  installed_at?: ISO8601;
  last_validation_at?: ISO8601;
  last_validation_result?: {
    passed: boolean;
    stage: 'head' | 'full';
    details?: {
      containerMatch: boolean;
      expectedMatch: boolean;
      datalayerMatch: boolean;
      expectedContainerId: string;
    };
    reason?: string;
  };
  last_error?: string;                // ≤500 chars
  created_by?: string;                // user_id (Supabase auth.users.id)
  created_at: ISO8601;
  updated_at: ISO8601;
}

export interface InstallationAudit {
  id: string;                         // uuid v4
  installation_id: InstallationId;
  tenant_id: TenantId;
  action:
    | 'draft_created' | 'upload_started' | 'upload_complete' | 'upload_failed'
    | 'activation_started' | 'activation_complete' | 'activation_failed'
    | 'validation_passed' | 'validation_failed'
    | 'uninstalled' | 'token_refresh';
  payload: Record<string, unknown>;   // LGPD-safe (ADR-0008 §3.7 mantido)
  actor_user_id?: string;
  actor_source: 'tracking-api' | 'cron-validator' | 'manual-cli';
  created_at: ISO8601;
}
```

### 2.5 Storage interface (port pattern, espelha §3.3 ADR-0008)

Arquivo: `tracking-api/src/lib/storage/IStorage.ts`

```typescript
export interface IGtmStorage {
  // hosting_accounts
  createAccount(input: Omit<HostingAccount, 'id' | 'created_at' | 'updated_at'>): Promise<HostingAccount>;
  getAccount(id: AccountId): Promise<HostingAccount | null>;
  listAccounts(filters?: { tenant_id?: TenantId }): Promise<HostingAccount[]>;
  updateAccount(id: AccountId, patch: Partial<HostingAccount>): Promise<HostingAccount>;
  deleteAccount(id: AccountId): Promise<void>;

  // installations
  createInstallation(input: Omit<GtmInstallation, 'id' | 'created_at' | 'updated_at'>): Promise<GtmInstallation>;
  getInstallation(id: InstallationId): Promise<GtmInstallation | null>;
  getInstallationBySite(domain: string): Promise<GtmInstallation | null>;  // idempotency lookup
  listInstallations(filters?: { account_id?: AccountId; status?: string }): Promise<GtmInstallation[]>;
  updateInstallation(id: InstallationId, patch: Partial<GtmInstallation>): Promise<GtmInstallation>;

  // audit (append-only)
  appendAudit(input: Omit<InstallationAudit, 'id' | 'created_at'>): Promise<void>;
  listAudit(installation_id: InstallationId, limit?: number): Promise<InstallationAudit[]>;

  // distributed lock pra prevenir 2 deploys concurrent na mesma installation
  acquireLock(installation_id: InstallationId, ttl_sec: number): Promise<boolean>;
  releaseLock(installation_id: InstallationId): Promise<void>;
}

// 2 implementations:
// MVP F: RedisGtmStorage (workers/lib/storage/RedisGtmStorage.ts)
// Onda 1.5: SupabaseGtmStorage (workers/lib/storage/SupabaseGtmStorage.ts)
// Factory: workers/lib/storage/index.ts → getStorage(env.STORAGE_BACKEND ?? 'redis')
```

Esse port pattern permite swap-in da impl SQL no Onda 1.5 sem tocar callers (endpoints, validator, audit helper).

---

## 3. Token encryption — sem Vault, com libsodium sealed box

Sem DB session, `vault.create_secret` indisponível. Alternativa avaliada:

### 3.1 Opções consideradas

| Opção | Como funciona | Trade-off |
|---|---|---|
| **A — libsodium sealed box** (escolhida) | `crypto_box_seal(plaintext, public_key)` — só quem tem private key abre. Public key em env var, private key em env var. Backend tem ambas. | ✅ NaCl battle-tested. ✅ `libsodium-wrappers` npm package mantido. ❌ Mistura PKI sem benefit real (1 par de chaves). |
| B — age | Modern, simple. CLI + biblioteca. | ❌ JS bindings menos maduros que libsodium. ❌ Diego ainda não usa age em outros pontos da stack. |
| C — AES-GCM nativo Node `crypto` | Sem dep extra. | ❌ Mais propenso a erro impl (nonce reuse). ❌ Sem associated data automática. |
| D — Plaintext + relying on container isolation | Token em hash Redis sem encryption. | ❌ Diego usa Easypanel painel onde qualquer admin vê hash via Redis CLI. ❌ Quebra LGPD policy by-default. |

**Escolha: A — libsodium sealed box.** Simples, biblioteca node madura (`libsodium-wrappers`), fácil swap pra Vault no Onda 1.5 (mantém mesma interface `encrypt/decrypt`).

### 3.2 Implementação

Env vars novos no `tracking-api` Easypanel:

```
STORAGE_ENCRYPTION_PUBLIC_KEY  — base64 (32 bytes) — gerado 1x via `sodium.crypto_box_keypair()`
STORAGE_ENCRYPTION_SECRET_KEY  — base64 (32 bytes) — mesma origem
REDIS_URL                       — redis://redis:6379 (Easypanel internal)
STORAGE_BACKEND                 — "redis" no MVP F, "supabase" no Onda 1.5
```

```typescript
// tracking-api/src/lib/storage/crypto.ts
import sodium from 'libsodium-wrappers';

let initialized = false;
async function init() { if (!initialized) { await sodium.ready; initialized = true; } }

export async function sealEncrypt(plaintext: string, publicKeyBase64: string): Promise<string> {
  await init();
  const pubKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const cipher = sodium.crypto_box_seal(plaintext, pubKey);
  return sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL);
}

export async function sealDecrypt(cipherBase64: string, publicKeyBase64: string, secretKeyBase64: string): Promise<string> {
  await init();
  const cipher = sodium.from_base64(cipherBase64, sodium.base64_variants.ORIGINAL);
  const pubKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const secKey = sodium.from_base64(secretKeyBase64, sodium.base64_variants.ORIGINAL);
  const plain = sodium.crypto_box_seal_open(cipher, pubKey, secKey);
  return sodium.to_string(plain);
}
```

**Geração de keypair (1x, manual Diego):**
```bash
node -e "const s=require('libsodium-wrappers'); s.ready.then(()=>{ \
  const kp=s.crypto_box_keypair(); \
  console.log('PUBLIC:', s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL)); \
  console.log('SECRET:', s.to_base64(kp.privateKey, s.base64_variants.ORIGINAL)); \
});"
```

Cola ambos no Easypanel Env tab. **NÃO commitar.**

### 3.3 Migração crypto pra Vault no Onda 1.5

Quando SupabaseGtmStorage entrar:
1. Manter sealed box impl como `EncryptCryptoLocal` (fallback)
2. Adicionar `EncryptCryptoVault` que chama `vault.create_secret` + retorna `vault.secrets.id`
3. Backfill script: lê token_encrypted do Redis → sealDecrypt → `vault.create_secret(plaintext)` → grava `token_vault_id` na nova tabela DB
4. Após backfill, drop env vars `STORAGE_ENCRYPTION_*`

---

## 4. Migração futura pra DB (Onda 1.5)

Quando ERP main estabilizar (CLAUDE.md retry rebase criteria) e Diego liberar:

### 4.1 Script idempotente

`scripts/migrate_mock_storage_to_supabase.ts`:

```typescript
// Pseudo-code
async function migrate() {
  const redis = new IORedis(env.REDIS_URL);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // 1. Apply migrations 0245-0247 (per ADR-0008 §3.5 specs originais)
  // 2. Iterate Redis SET gtm:account:list
  const accountIds = await redis.smembers('gtm:account:list');
  for (const id of accountIds) {
    const account = await redis.hgetall(`gtm:account:${id}`);
    const plaintextToken = await sealDecrypt(account.token_encrypted, ...);
    const { data: vaultRow } = await supabase.rpc('vault_create_secret', { secret: plaintextToken });
    await supabase.from('tracking.hosting_accounts').upsert({
      id: account.id,
      tenant_id: account.tenant_id,
      provider: account.provider,
      token_vault_id: vaultRow.id,
      account_email: account.account_email,
      status: account.status,
      last_validated_at: account.last_validated_at,
      created_at: account.created_at,
    });
  }

  // 3. Iterate gtm:install:list — UPSERT em tracking.gtm_installations
  // 4. Iterate gtm:audit:<id> — INSERT batch em tracking.installation_audit
  // 5. Verify counts match (Redis vs DB)
  // 6. Set feature flag STORAGE_BACKEND=supabase no Easypanel + redeploy
}
```

### 4.2 Dual-read durante transição

Factory storage suporta `STORAGE_BACKEND=dual` durante 24-48h:
- Reads: tenta Supabase primeiro, fallback Redis
- Writes: writes em ambos (Supabase como source-of-truth, Redis como espelho)

Após validation Diego, `STORAGE_BACKEND=supabase` + drop Redis keys `gtm:*` (preserva `metabase:*` e `track:dedup:*`).

### 4.3 Custo estimado migration futura

| Tarefa | Estimativa | Owner |
|---|---|---|
| Dara aplicar migrations 0245-0247 em branch staging (specs ADR-0008 §3.5 prontos) | 30min | Dara |
| Dex implementar SupabaseGtmStorage impl (espelha RedisGtmStorage) | 60-90min | Dex |
| Dex script `migrate_mock_storage_to_supabase.ts` + dry-run em staging | 45-60min | Dex |
| Quinn smoke E2E dual-read + verify counts | 30min | Quinn |
| Felix deploy + flag flip + drop Redis keys | 15min | Felix |
| **Total** | **~3-4h** | — |

Manifesto 22/05 vigente — sem prazo. Quando Diego liberar.

---

## 5. Impacto no §6 do ADR-0008 (roadmap Dex)

### 5.1 Mudanças

| Story original | Mudança | Estimativa nova |
|---|---|---|
| **Story 1 — migrations Dara** | **CANCELADA pra MVP F** | — |
| **Story 1' (NEW) — Mock storage layer** | Dex implementa: `IGtmStorage` interface + `RedisGtmStorage` impl + `crypto.ts` libsodium helpers + unit tests com `redis-memory-server`. | 90-120min |
| Story 2 — Provider adapter | Inalterada (independente de storage) | Igual ADR-0008 |
| Story 3 — API endpoints | Ajuste: trocar `db.tx()` por `storage.tx()` (Redis MULTI/EXEC); trocar `vault.create_secret` por `sealEncrypt`. | -15min (menos boilerplate) |
| Story 4 — Validador | Inalterada | Igual ADR-0008 |
| Story 5 — Audit + retry | Ajuste menor: `appendAudit` via Redis LPUSH em vez de INSERT SQL. pgTAP test vira vitest test + Redis fixture. | Igual ADR-0008 |
| Story 6 — Frontend | Inalterada (consome endpoints HTTP, agnóstico ao storage) | Igual ADR-0008 |
| Story 7 — Cron validator (Onda 1.5) | Inalterada | Igual ADR-0008 |
| Story 8 — Uninstall cleanup (Onda 1.5) | Inalterada | Igual ADR-0008 |
| **Story 9 (NEW) — Backup mock storage** | Estender `tracking-backup` compose com `redis-cli --rdb gtm-snapshot.rdb` filtrado por keys `gtm:*` + upload MinIO | 30min |

### 5.2 Net impact

- **Total LoC removido:** ~600 (3 migrations SQL + pgTAP tests)
- **Total LoC adicionado:** ~250 (RedisGtmStorage + crypto helpers + vitest tests)
- **Net velocity:** +30-45min ganho no MVP F
- **Débito técnico documentado:** §4 deste addendum (migração futura ~3-4h)

---

## 6. Riscos novos do mock storage

### 6.1 Top 3 riscos com mitigação

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| **R6** | **Container Redis restart sem volume persistente = perde state** | Baixa (volume `redis-data` já configurado AOF) | Alto (Diego perde configurações de install) | (1) Validar volume Easypanel persiste cross-restart (smoke test pré-MVP). (2) Backup MinIO daily (Story 9). (3) Healthcheck `redis-cli LASTSAVE` no monitoring uptime WF18. |
| **R7** | **Backup mock storage não incluído no cron MinIO 03h** | Média (cron atual só faz pg_dump) | Alto (LGPD-relevant — perde audit log em desastre) | Story 9 NEW estende `tracking-backup` compose com `redis-cli BGSAVE` + filter keys `gtm:*` (via `MIGRATE` ou `--rdb` dump filtrado) + upload `gtm-snapshot.rdb` pro MinIO bucket `tracking-backups/redis/`. Retenção 30d alinhada com pg backup. |
| **R8** | **Concorrência multi-replica tracking-api** | Baixa hoje (1 réplica), média futura (Easypanel auto-scale) | Alto (race condition em re-install double-deploy) | (1) Distributed lock via `gtm:lock:install:<id>` Redis `SET NX EX 60` em `IGtmStorage.acquireLock`. (2) Audit log captura `actor_source` pra debug pós-fato. (3) Documentar limite "1 deploy concurrent por installation". |

### 6.2 Riscos menores aceitos

| # | Risco | Mitigação aceita |
|---|---|---|
| R9 | Redis maxmemory 256MB pode encher se installs explodirem | Hoje Diego é único user; ~5-10 installs total no MVP F. ~10KB/install + 100KB audit = <2MB total. Folga de 250MB. Re-avaliar Onda 1.5. |
| R10 | AOF `appendfsync everysec` perde até 1s no crash | Aceitável MVP F (auditoria não é financial-critical). Onda 1.5 SQL tem WAL stronger. |
| R11 | Sealed box keys em env var = vazamento se Easypanel admin comprometido | Mesmo nível de risco que `DATABASE_URL_OWNER` atual. Easypanel admin tem trust total. Mitigação real = OAuth Onda 2. |
| R12 | Migração futura pode ter inconsistências se mock storage corromper antes do backfill | Dual-read fase + count verify Quinn QA gate detecta. Pior caso: re-deploy do MVP do zero (throwaway-accepted). |

---

## 7. Aderência a CLAUDE.md + ADR-0007 + ADR-0008

| Regra | Como esse addendum respeita |
|---|---|
| Cloudflare-last (REGRA #-2) | Redis em Easypanel KV8 (mantém). Sem Cloudflare. |
| Manifesto 22/05 (sem data) | Throwaway code aceitável pra MVP F. Migração futura documentada sem deadline. |
| ADR-0007 schema `tracking.*` | Mock storage NÃO toca schema tracking. Migração futura (Onda 1.5) aplica migrations 0245-0247 quando branch estabilizar. |
| ADR-0008 §3.2 plugin híbrido | Mantido. Inalterado. |
| ADR-0008 §3.3 provider adapter | Mantido. Inalterado. |
| ADR-0008 §3.6 validador 2-stage | Mantido. Inalterado. |
| ADR-0008 §3.7 LGPD audit policy | Mantido. `gtm:audit:*` lists tem mesmo safeAuditPayload helper. pgTAP test vira vitest test. |
| ADR-0008 §3.8 token rotação manual | Mantido. `pingToken()` chama `provider.listSites()` antes de deploy. |
| ADR-0008 §3.9 retry policy | Mantido. Inalterado. |
| ADR-0008 §3.10 idempotência | Mantido via `gtm:install:by_site:<sha1(domain)>` STRING key. |

---

## 8. Validation checklist pré-implementação (revisado)

- [x] Redis já existe em Easypanel KV8 (`infra/easypanel/redis-compose.yml` confirmado linha 22)
- [x] Volume `redis-data` configurado AOF persistente (mesma compose)
- [ ] Diego gera libsodium keypair (1 comando node, ~10s) + cola em Easypanel Env tab
- [ ] Diego confirma plan Hostinger SSH-capable (§3.4 ADR-0008 fallback C) — independente do storage
- [ ] Diego gera Hostinger API token + WP Application Passwords — independente do storage
- [ ] Aria valida tamanho Docker image `tracking-api` com `libsodium-wrappers` + `ioredis` (~3MB extra, within budget)
- [ ] Quinn smoke test Redis volume persistence cross-restart container
- [ ] Quinn validate `tracking-backup` compose extension Story 9 (backup `gtm:*` keys ➜ MinIO)
- [ ] Felix deploy nova env vars Easypanel (`STORAGE_ENCRYPTION_*`, `STORAGE_BACKEND=redis`)

---

## 9. Referências

- ADR-0008 (base): [`adr-0008-auto-provisioner-gtm-architecture.md`](./adr-0008-auto-provisioner-gtm-architecture.md)
- ADR-0007 (schema tracking.*): [`adr/0007-rebase-from-kv2-to-supabase-erp.md`](./adr/0007-rebase-from-kv2-to-supabase-erp.md)
- PRD upstream: [`prd-auto-provisioner-gtm-mvp.md`](./prd-auto-provisioner-gtm-mvp.md)
- Redis compose: [`infra/easypanel/redis-compose.yml`](../infra/easypanel/redis-compose.yml)
- Backup compose (a estender): [`infra/easypanel/tracking-backup-compose.yml`](../infra/easypanel/tracking-backup-compose.yml)
- libsodium-wrappers npm: https://www.npmjs.com/package/libsodium-wrappers
- ioredis npm: https://www.npmjs.com/package/ioredis
- Cutover Fase 6 lessons: [`cutover-fase6-aborted-lessons.md`](./cutover-fase6-aborted-lessons.md)

---

**Fim do ADR-0008a addendum. Status: Approved. Libera Nova pra quebrar stories revisadas. Story 1' (mock storage) + Story 9 (backup mock) novos; Stories 2-8 inalteradas em substância.**
