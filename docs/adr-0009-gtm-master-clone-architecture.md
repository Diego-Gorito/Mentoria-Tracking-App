# ADR-0009 — GTM Master Clone Architecture (Multi-Tenant SaaS)

**Status:** Proposed
**Data:** 2026-05-28
**Decisores:** Diego Gorito (PO + dev solo)
**Autor:** Claude (Sonnet 4.5, sessão Auto Mode)
**Upstream:**
- [ADR-0008](./adr-0008-auto-provisioner-gtm-architecture.md) — Auto-provisioner GTM single-tenant Hostinger
- `docs/SESSION-2026-05-27-late.md` — handoff que originou esta decisão
- `docs/gtm-master-v2-status.md` — snapshot atual master V2

**Downstream esperado:**
- ADR-0010 — Event Coverage Audit pós-install (separado)
- F-S20+ stories (schema, endpoint, UI)

**Cross-ADR:**
- ADR-0007 §schema `tracking.*` Supabase staging
- ADR-0008 §3 provider abstraction pattern

---

## 1. Contexto

### 1.1 Problema técnico

A gente saiu de **MVP single-tenant** (Mentoria/ZeroHum/IFRN — 4 containers manuais em GTM-5J587HS3 family) pra projetar **multi-tenant SaaS** onde cada cliente novo do produto `tracking.colegiomentoria.com.br` precisa de:

1. **Web container GTM próprio** (clone do master V2 `GTM-WLZ3H8VH`) com 51 tags, 60 vars, 14 triggers, 14 templates
2. **Server container GTM próprio** (clone do `GTM-KLDMV2VH`) com 11 tags, 30 vars, 9 triggers, 8 templates, 3 clients (GA4 + Kiwify + Kirvano)
3. **Pixel IDs parametrizados** — substituir os 11 placeholders `PIXEL_NAO_DEFINIDO` pelas vars [CT] com valores reais do tenant (Meta/GA4/Bing/X/Reddit/Pinterest/Snap/Quora + Kiwify/Kirvano secrets)
4. **Linkage** — Web container aponta pra Server container (transport_url, GA4 measurement, etc.)
5. **Web hostado no WP do cliente** (job já resolvido pelo ADR-0008 auto-provisioner)
6. **Server hostado em sGTM Cloud Run ou Easypanel** (Diego decide caso a caso)
7. **Publicação atômica** — web + server publicados juntos pra evitar mismatch
8. **Rollback** — se clone falha no meio, deletar containers parciais ou retomar de onde parou

### 1.2 Decisões já tomadas Diego (não rediscutir)

- **Containers ficam NA CONTA DO DIEGO** (`account 6059193756 = GTM | Colégio Mentoria`), NÃO na conta do cliente.
  - Razão: simplifica gestão (1 conta SA, 1 lugar pra auditar), reduz fricção onboarding (cliente não precisa ter conta Google), Diego mantém controle de evolução do master sem depender de cada cliente dar acesso.
  - Implicação: limite Google = 500 containers/conta. Diego cabe ~250 clientes (assumindo 1 web + 1 server por cliente). Hits limite → criar conta GTM secundária.
- **Service Account `tracking-claude-sa`** com role Administrador na conta acima faz todo o trabalho via API.
- **Master V2 é canônico** — todo cliente clona V2, V1 (containers atuais) só sobrevive em produção atual. Não há "alguns clientes em V1, outros em V2".
- **Cloudflare-last** (REGRA #-2): tudo backend Hono Node Easypanel KV8. sGTM Cloud Run permitido (não é CDN, é runtime).
- **Stack reuso:** `tracking-api` Hono + Supabase staging `cjtwrzlwfqvzukjinmjr` schema `core.*` (multi-tenant) e `tracking.*` (single-tenant legacy ADR-0008).

### 1.3 Forças (constraints reais)

| Força | Implicação |
|---|---|
| **GTM API rate limit** — não documentado oficialmente, mas observado: ~30 req/segundo, 50.000 req/dia/SA | Clone batch (~300 calls/cliente) cabe. Throttle 100ms entre calls. 1 cliente = ~30s de API. |
| **Limit 500 containers/conta** | Marcar contador `core.gtm_account_usage(account_id, container_count)`. Quando passa 480 → alerta provisional pra criar conta GTM2. |
| **sGTM hosting cost** — Cloud Run free tier limitado, Easypanel scale = mais VPS | Decidir per-tenant: 1 sGTM por tenant (caro) vs 1 sGTM multi-tenant com claim por path (`/track-tenant1`, `/track-tenant2`). **Decisão: multi-tenant por path no MVP** (1 sGTM container Easypanel atende N clientes via path). Onda 2 separa por tenant se hit perf wall. |
| **Master evolui** — Diego adiciona TikTok Shop, novo evento, etc., depois de já ter clientes | Estratégia versionamento: cada clone snapshot `master_version_id` (ex: `v0.2`). Update master → publicar nova versão `v0.3`. Tenants existentes ficam em v0.2 até admin clicar "Republish from master v0.3". Detalhes §3.4. |
| **Cliente pode querer customizar** — Tag específica do cliente que master não tem | Política: customizações vivem em **namespace `[CT-LOCAL]`** vs master `[CT]`. Re-clone preserva `[CT-LOCAL]` mas sobrescreve `[CT]`. Detalhes §3.5. |
| **Race conditions** — 2 clones concorrentes do mesmo master | Lock pessimista via Redis (`gtm:clone:lock:master_v2`) com TTL 5min. 2º clone aguarda. |
| **Secrets per-tenant** (pixel IDs, HMAC) | Storage criptografado: extending pattern do ADR-0008 `tracking.hosting_accounts.token_vault_id` → `core.tenant_pixel_secrets` com Supabase Vault. |
| **Idempotência** — re-rodar provision do mesmo tenant não duplica containers | `core.tenant_containers(tenant_id)` UNIQUE. Re-provision = UPDATE + sync vars com valores atuais (caso Diego mudou pixel ID depois). |

---

## 2. Decision summary (TL;DR)

1. **Schema** — 4 tabelas novas em `core.*`:
   - `core.tenant_containers(tenant_id, web_container_id, server_container_id, master_version_id, status, created_at, last_published_at)` UNIQUE(tenant_id)
   - `core.tenant_pixel_secrets(tenant_id, platform, pixel_id_vault_id)` — Meta/GA4/Bing/X/Reddit/Pinterest/Snap/Quora
   - `core.gtm_master_versions(version_id, web_master_id, server_master_id, snapshot_at, notes)` — track de master snapshots
   - `core.gtm_clone_audit(id, tenant_id, action, status, error, created_at)` — log de tentativas

2. **Endpoint** — `POST /api/gtm/provision-container` no `tracking-api`:
   - Recebe `{ tenant_slug, pixel_ids: { meta, ga4, bing, x, reddit, pinterest, snap, quora }, kiwify_secret?, kirvano_secret? }`
   - 1. Lock Redis
   - 2. Clone master V2 web → novo container (~30 calls API)
   - 3. Clone master V2 server → novo container (~15 calls API)
   - 4. Configura linkage web→server (transport_url)
   - 5. Substitui vars `[CT] [*]` pelos pixel IDs
   - 6. Publica versões iniciais (web v1 + server v1)
   - 7. Persiste `core.tenant_containers` + audit log
   - 8. Release lock
   - Retorna `{ web_container_public_id, server_container_public_id, gtm_snippet }`

3. **Service Account auth** — JSON key `/Volumes/SSD 2T/Dev/tracking-claude-sa.json` movido pra Supabase Vault (FORA do filesystem) acessada em runtime via `vault.decrypted_secrets`. Em prod, sopa env `GCP_SA_KEY_VAULT_ID`.

4. **Rate limiting** — throttle 100ms entre calls GTM API (`p-limit` lib). Total clone ~45s. UI mostra progress SSE (reusa pattern ADR-0008 §3.6 sseBus).

5. **Master update propagation** — manual via UI "Republish from master v0.X". Backend re-clone preservando vars do tenant. Não é re-clone full (perderia customizações [CT-LOCAL]); é **diff sync**:
   - Tags + vars + triggers + templates + clients do master V2 entram (ou sobrescrevem se name match)
   - Tags do tenant com namespace `[CT-LOCAL]` ficam intactas
   - Vars `[CT]` preservam valores atuais do tenant (não sobrescreve pixel IDs)
   - Publish nova versão automaticamente após sync

6. **Web ↔ Server linkage** — Server container_id é var no Web (`{{[CT] [GTM] Server Container URL}}`). Após clone, value setado para `https://sgtm.{tenant_slug}.colegiomentoria.com.br` OR `https://sgtm.colegiomentoria.com.br/{tenant_slug}` (path-based MVP).

7. **Rollback strategy** — Clone parcial detectado por audit log status `failed_at_step_X`. Cron `gtm-clone-janitor` (1x dia) deleta containers órfãos sem registro em `core.tenant_containers`. Manual `DELETE /api/gtm/tenant-container/:tenant_slug` disponível pra retry limpo.

8. **Versionamento master** — cada `create_version` no master V2 vira row em `core.gtm_master_versions`. Endpoint `GET /api/gtm/master-versions` lista. UI mostra "tenant em v0.2 (out 2026), master atual v0.4 — Republish?".

---

## 3. Decision rationale (detalhado)

### 3.1 Por que containers na conta Diego (não cliente)?

3 opções consideradas:

| Opção | Prós | Contras |
|---|---|---|
| **A. Containers na conta Diego (decidida)** | 1 SA, 1 conta auditável; cliente não precisa Google; Diego controla deploys de master sem permission dance | Limite 500 containers; conflito de "owner" se cliente sair |
| B. Containers na conta do cliente | Cliente "dono" dos dados; sem limit por Diego; export limpo se sair | Cliente precisa Google account; SA precisa permission em cada conta (manual prompt OU OAuth flow); Diego depende do cliente pra atualizar master |
| C. Híbrido (web na conta cliente, server na Diego) | Cliente vê web no GTM próprio; server fica "infra" Diego | Pior dos 2 mundos: clientes precisam Google + complexidade auth dupla |

Decisão Diego: **A**. Trade-off: clientes que saírem podem solicitar export do container JSON (a gente fornece) — não é portabilidade automática mas é honesta.

### 3.2 Sub-problema: GTM API rate limits

Observado em testes desta sessão (2026-05-28):
- 22 tags criadas em ~13s (sleep 0.5s entre) — sem erro
- 60+ vars + 14 triggers + 14 templates + 22 tags = ~120 calls sem rate limit hit
- Erros 429 só apareceram quando passou de ~30 req/s burst

Plano: usar `p-limit({ concurrency: 1 })` com 100ms delay garantido entre calls. Pior caso 1 cliente = 300 calls × 100ms = 30s. UI SSE mostra progresso por etapa.

### 3.3 Sub-problema: Web ↔ Server linkage

GA4 transport, Meta CAPI server endpoint, Server cookie domain — várias vars no Web precisam apontar pro Server URL.

**Estratégia path-based MVP:**
- 1 sGTM container Easypanel multi-tenant
- Roteia por path: `https://sgtm.colegiomentoria.com.br/{tenant_slug}/*` → claim em Custom Client (já temos pattern Kiwify/Kirvano)
- Web aponta pra `https://sgtm.colegiomentoria.com.br/{tenant_slug}` na var `{{[CT] [GTM] Server URL}}`

Trade-off: 1 sGTM down → todos clientes down. Onda 2 separa per-tenant se SLA virar problema.

### 3.4 Sub-problema: Master evolui sem quebrar clientes

Cenário: Diego adiciona "TikTok Shop conversion" no master V2 → vira v0.3. Cliente1 está em v0.2 desde out 2026. Cliente2 acabou de ser onboarded em v0.3.

Opções:
1. **Force-update todos pro v0.3** — quebra customizações locais
2. **Manual republish per-tenant** — Diego clica botão pra cada cliente
3. **Diff sync inteligente (escolhida)** — backend identifica delta entre v0.2 e v0.3 → aplica apenas additions/updates de tags `[CT]`, preserva `[CT-LOCAL]` + valores das vars per-tenant

Implementação §5.

### 3.5 Sub-problema: Customização per-cliente

Quando cliente pede "minha tag custom de pixel TikTok Shop antes do TikTok ser oficialmente suportado":

- Tags com prefix `[CT-LOCAL]` (vs master `[CT]`)
- Diff sync preserva tudo `[CT-LOCAL]`
- Suporte humano (Diego) usa UI GTM normal pra criar tag — não passa pelo provision API

Trade-off documentado: Diego responsável manualmente. Onda 3 considera "marketplace de tags clientes podem adicionar via UI próprio".

### 3.6 Sub-problema: Secrets pixel IDs

Pixel IDs não são "secretos" no sentido de senha (são públicos no DOM final), mas Diego controla quais a gente carrega. Storage:

```sql
CREATE TABLE core.tenant_pixel_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','ga4_web','ga4_server','bing','x','reddit','pinterest','snap','quora','clarity','tiktok','linkedin','taboola','outbrain','google_ads')),
  pixel_id text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, platform)
);
```

Não usa Vault (pixel IDs são públicos no front-end final). HMAC secrets Kiwify/Kirvano vão pra Vault separado:

```sql
CREATE TABLE core.tenant_webhook_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('kiwify','kirvano','stripe')),
  secret_vault_id uuid NOT NULL REFERENCES vault.secrets(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, provider)
);
```

### 3.7 Sub-problema: Rate limit Google quota recovery

Se SA bate 50.000 req/dia (quota não-public mas observado nos limites GTM):
- Pause provision queue → resume next day
- Alerta `core.gtm_api_quota_alerts(tenant_id, retry_after)`
- UI mostra "Provisionamento em fila — limite Google atingido, retomará em 12h"

---

## 4. Schema detalhado

### 4.1 Migration 0250 (proposta nome) — `core.tenant_containers`

```sql
CREATE TABLE core.tenant_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  gtm_account_id text NOT NULL,                    -- '6059193756'
  web_container_id text,                            -- 'GTM-XXXXXXX' internal
  web_container_public_id text,                     -- 'GTM-XXXXXXX' public
  server_container_id text,
  server_container_public_id text,
  master_version_id uuid REFERENCES core.gtm_master_versions(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cloning','linking','publishing','active','failed','archived')),
  failed_at_step text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  last_published_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_tc_status ON core.tenant_containers(status);
CREATE INDEX idx_tc_master_version ON core.tenant_containers(master_version_id);
```

### 4.2 Migration 0251 — `core.gtm_master_versions`

```sql
CREATE TABLE core.gtm_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL,                       -- 'v0.2'
  web_master_container_id text NOT NULL,            -- 'GTM-WLZ3H8VH'
  web_master_version_id text NOT NULL,              -- GTM version number (ex: '2')
  server_master_container_id text NOT NULL,         -- 'GTM-KLDMV2VH'
  server_master_version_id text NOT NULL,
  snapshot_at timestamptz NOT NULL,
  notes text,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(version_name)
);

-- Bootstrap row
INSERT INTO core.gtm_master_versions
(version_name, web_master_container_id, web_master_version_id, server_master_container_id, server_master_version_id, snapshot_at, notes, is_current)
VALUES (
  'v0.2',
  'GTM-WLZ3H8VH', '2',
  'GTM-KLDMV2VH', '2',
  '2026-05-28 14:00:00+00',
  '+22 tags base 5 plataformas + 2 Custom Clients Kiwify/Kirvano MVP',
  true
);
```

### 4.3 Migration 0252 — `core.tenant_pixel_secrets`

(spec §3.6)

### 4.4 Migration 0253 — `core.tenant_webhook_secrets`

(spec §3.6)

### 4.5 Migration 0254 — `core.gtm_clone_audit`

```sql
CREATE TABLE core.gtm_clone_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES core.tenants(id),
  master_version_id uuid REFERENCES core.gtm_master_versions(id),
  action text NOT NULL CHECK (action IN ('provision','republish','rollback','delete')),
  step text,                                       -- 'clone_vars','clone_tags','link_web_server','publish_web','publish_server'
  status text NOT NULL CHECK (status IN ('success','failed','retrying')),
  error jsonb,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON core.gtm_clone_audit(tenant_id, created_at DESC);
CREATE INDEX idx_audit_status ON core.gtm_clone_audit(status, created_at DESC);
```

---

## 5. Endpoint `POST /api/gtm/provision-container`

### 5.1 Contract

```typescript
// Request
{
  tenant_slug: string;          // 'mentoria'
  pixel_ids: {
    meta?: string;              // '1234567890'
    ga4_web?: string;           // 'G-XXXXXXX'
    ga4_server?: string;        // measurement ID server-side
    bing?: string;              // UET tag ID
    x?: string;                 // X Ads pixel ID
    reddit?: string;
    pinterest?: string;
    snap?: string;
    quora?: string;
    clarity?: string;
    tiktok?: string;
    linkedin?: string;
    google_ads_conversion_id?: string;
    google_ads_remarketing_id?: string;
  };
  webhook_secrets?: {
    kiwify?: string;            // shared token
    kirvano?: string;
  };
  // Onda 2: customizations override
}

// Response 200
{
  tenant_id: string;
  web_container: {
    public_id: 'GTM-NEWXXXX';
    internal_id: '253999999';
    snippet: '<!-- Google Tag Manager --> ...';
  };
  server_container: {
    public_id: 'GTM-SRVYYYY';
    internal_id: '253888888';
    url: 'https://sgtm.colegiomentoria.com.br/mentoria';
  };
  master_version: 'v0.2';
}

// Response 409 (already provisioned)
{ error: { code: 'TENANT_ALREADY_HAS_CONTAINERS', existing: {...} } }

// Response 422
{ error: { code: 'INVALID_PIXEL_ID_FORMAT', field: 'pixel_ids.meta' } }

// Response 503 (Google quota hit)
{ error: { code: 'GTM_QUOTA_EXCEEDED', retry_after: 43200 } }
```

### 5.2 Implementação pseudocódigo

```typescript
// workers/api/gtm-provision.ts
export async function provisionContainer(req: ProvisionRequest, ctx: AuthContext) {
  const lockKey = `gtm:clone:${req.tenant_slug}`;
  const acquired = await redis.set(lockKey, ctx.requestId, 'NX', 'EX', 600); // 10min TTL
  if (!acquired) throw new HttpError(409, 'PROVISION_IN_PROGRESS');

  const auditId = await createAuditEntry({ tenant_slug: req.tenant_slug, action: 'provision' });

  try {
    // 1. Validate tenant exists, has no container yet
    const tenant = await db.getTenantBySlug(req.tenant_slug);
    if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND');
    const existing = await db.getTenantContainer(tenant.id);
    if (existing) throw new HttpError(409, 'TENANT_ALREADY_HAS_CONTAINERS');

    // 2. Get current master version
    const master = await db.getCurrentMasterVersion();
    await emitSSE({ step: 'init', master_version: master.version_name });

    // 3. Clone web container
    await emitSSE({ step: 'clone_web' });
    const webContainer = await gtmApi.createContainer({
      accountId: master.gtm_account_id,
      name: `${tenant.slug}-web`,
      usageContext: ['web'],
    });

    // 4. Copy templates, vars, triggers, tags from web master
    await copyContainerContents({
      sourceContainer: master.web_master_container_id,
      sourceWorkspace: 2,
      targetContainer: webContainer.containerId,
      targetWorkspace: 1,
      throttleMs: 100,
      onProgress: (step, count) => emitSSE({ step: 'clone_web_progress', detail: `${step}: ${count}` }),
    });

    // 5. Clone server container + copy contents (idem)
    await emitSSE({ step: 'clone_server' });
    const serverContainer = await gtmApi.createContainer({
      accountId: master.gtm_account_id,
      name: `${tenant.slug}-server`,
      usageContext: ['server'],
    });
    await copyContainerContents({ ...server });

    // 6. Substitute pixel ID vars in web container
    await emitSSE({ step: 'parametrize' });
    await updateVarValues(webContainer.containerId, 1, {
      '[CT] [Meta Ads] Pixel ID': req.pixel_ids.meta ?? 'PIXEL_NAO_DEFINIDO',
      '[CT] [GA4] Measurement ID': req.pixel_ids.ga4_web ?? 'G-NAO_DEFINIDO',
      '[CT] [Bing UET] Tag ID': req.pixel_ids.bing ?? 'UET_NAO_DEFINIDO',
      '[CT] [X Ads] Pixel ID': req.pixel_ids.x ?? 'X_NAO_DEFINIDO',
      // ... demais
    });
    // 7. Link web → server (transport_url)
    await emitSSE({ step: 'link' });
    await updateVarValues(webContainer.containerId, 1, {
      '[CT] [GTM] Server URL': `https://sgtm.colegiomentoria.com.br/${tenant.slug}`,
    });

    // 8. Persist secrets to Vault if any
    if (req.webhook_secrets) {
      await persistWebhookSecrets(tenant.id, req.webhook_secrets);
    }

    // 9. Publish initial versions (web + server)
    await emitSSE({ step: 'publish' });
    const webVer = await gtmApi.publishWorkspace(webContainer.containerId, 1, 'v1 — initial provision');
    const serverVer = await gtmApi.publishWorkspace(serverContainer.containerId, 1, 'v1 — initial provision');

    // 10. Persist to core.tenant_containers
    await db.insertTenantContainer({
      tenant_id: tenant.id,
      web_container_public_id: webContainer.publicId,
      web_container_id: webContainer.containerId,
      server_container_public_id: serverContainer.publicId,
      server_container_id: serverContainer.containerId,
      master_version_id: master.id,
      status: 'active',
      last_published_at: new Date(),
    });

    // 11. Audit success
    await updateAuditEntry(auditId, { status: 'success' });

    return {
      tenant_id: tenant.id,
      web_container: {
        public_id: webContainer.publicId,
        internal_id: webContainer.containerId,
        snippet: generateGtmSnippet(webContainer.publicId),
      },
      server_container: {
        public_id: serverContainer.publicId,
        internal_id: serverContainer.containerId,
        url: `https://sgtm.colegiomentoria.com.br/${tenant.slug}`,
      },
      master_version: master.version_name,
    };
  } catch (err) {
    await updateAuditEntry(auditId, { status: 'failed', error: err });
    // Don't auto-cleanup — janitor cron handles orphans
    throw err;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## 6. Riscos identificados

| Risco | Mitigação |
|---|---|
| **R1 — Clone parcial (timeout em meio do batch de 300 calls)** | Audit log com `step` salva onde parou. Endpoint `POST /api/gtm/resume-provision` reseta de onde parou. Janitor cron diariamente deleta containers órfãos sem `tenant_containers` row. |
| **R2 — GTM API quebra entre versions** | Pin version `tagmanager/v2` no SA client. Smoke test E2E em staging antes de prod toda semana. |
| **R3 — Cliente quer customizar e perde no re-clone** | Namespace `[CT-LOCAL]` documentado §3.5. UI mostra warning "Republish vai sobrescrever tags `[CT]` mas preservar `[CT-LOCAL]`". |
| **R4 — Limit 500 containers/conta** | Telemetria `core.gtm_account_usage`. Alerta em 480. Doc procedure pra criar GTM2 secundária. |
| **R5 — Service account key vaza** | Rotação trimestral via gcloud IAM. JSON nunca commitado (já garantido — fora do repo). Em prod, key em Vault encrypted at rest. |
| **R6 — Tenant deletado, container fica órfão** | ON DELETE CASCADE FK → tenant_containers. Hook backend deleta containers via GTM API antes de DELETE tenant row. Idempotent: se container já deletado, segue. |
| **R7 — sGTM multi-tenant single point of failure** | Onda 2 separa per-tenant se hit perf wall. Monitor latência p95 por tenant. |
| **R8 — Concurrent provision do mesmo tenant (race)** | Lock Redis NX EX 600 §5.2. |
| **R9 — Publish parcial (web v1 publica, server v1 falha)** | Saga pattern: se server publish falha → unpublish web (delete version) → mark `status=failed`. |

---

## 7. Implementação — ordem proposta (stories)

| Story | Descrição | Estimativa | Block by |
|---|---|---|---|
| **F-S20** | Migrations 0250-0254 (schema) + seed `v0.2` master version row | 2h | — |
| **F-S21** | Service Account auth helper (`workers/lib/gtm/auth.ts`) + Vault integration pra key | 3h | F-S20 |
| **F-S22** | `gtmApi` client (`workers/lib/gtm/client.ts`) — createContainer, copyContents, updateVars, publishWorkspace + p-limit throttle | 8h | F-S21 |
| **F-S23** | Endpoint `POST /api/gtm/provision-container` + SSE progress + audit logging | 5h | F-S22 |
| **F-S24** | Janitor cron (`workers/jobs/gtm-clone-janitor.ts`) — limpa órfãos diariamente | 3h | F-S23 |
| **F-S25** | Endpoint `POST /api/gtm/republish/:tenant_slug` — diff sync master vN → tenant | 8h | F-S23 |
| **F-S26** | UI `/integracoes/gtm` — botão "Provisionar GTM" + status + republish button | 6h | F-S23 |
| **F-S27** | UI `/admin/master-versions` (Diego-only) — list, snapshot now, set as current | 4h | F-S20 |
| **F-S28** | Smoke test E2E em staging — provision tenant fake, validar containers no GTM | 4h | F-S26 |

**Total estimado:** ~43h (~1 semana de Diego solo). Pode paralelizar F-S26 com F-S25.

---

## 8. Validation checklist pré-implementação

- [ ] Diego confirma decisão "containers na conta dele" definitiva (sem voltar atrás)
- [ ] Diego confirma sGTM multi-tenant por path (não 1 sGTM per tenant) pra MVP
- [ ] Diego confirma quota limit 500 + plano pra GTM2 quando crescer
- [ ] SA key migrada pra Supabase Vault antes de implementar F-S21
- [ ] Pixel ID formato valido por plataforma (regex/Zod schema) documentado
- [ ] Master version v0.2 publicada via UI manualmente antes do MVP rodar (status atualmente: snapshot only)
- [ ] Backend tem rate limit interno (não só GTM API) — `p-limit` por SA, não por endpoint

---

## 9. Cloudflare-last policy compliance

- ✅ Sem Cloudflare adicionado
- ✅ Backend Hono Node Easypanel KV8 (mantém)
- ✅ Frontend Vite Easypanel KV8 (mantém)
- ✅ DB Supabase staging cjtwrzlwfqvzukjinmjr schema `core.*` (mantém)
- ✅ Google Tag Manager API direct (sem CDN intermediário)
- ✅ sGTM Easypanel container OR Cloud Run (Cloud Run permitido — runtime, não CDN)

---

## 10. Referências

- ADR-0008 (auto-provisioner single-tenant): `docs/adr-0008-auto-provisioner-gtm-architecture.md`
- ADR-0011 ERP (Integration Bridge Pattern): cross-repo `file:///Users/gorito/Dev/ERP-Mentoria/docs/adr/0011-integration-bridge-pattern.md`
- Master V2 status: `docs/gtm-master-v2-status.md`
- Webhook setup: `docs/gtm-server-webhooks-setup.md`
- GTM API docs: https://developers.google.com/tag-manager/api/v2
- Reference scripts: `scripts/gtm/`

---

**Fim do ADR-0009. Status: Proposed. Aguarda Diego review + decisões §8 antes de Nova story breakdown F-S20+.**
