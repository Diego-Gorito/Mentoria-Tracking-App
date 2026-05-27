# ADR-0008 — Auto-Provisioner GTM (MVP Hostinger-Only) — Architecture

**Status:** Proposed
**Data:** 2026-05-25
**Decisores:** Diego Gorito (PO + dev solo)
**Autor:** Aria (System Architect, Opus 4.7)
**PRD upstream:** [`docs/prd-auto-provisioner-gtm-mvp.md`](./prd-auto-provisioner-gtm-mvp.md) (Kai, 25/05/2026)
**Downstream:** Uma (UX) || Nova (stories) → River (story details) → Dara (migrations) → Dex (impl) → Quinn (gate) → Felix (deploy)
**Manifesto 22/05 vigente:** sem prazo. Cloudflare-Last vigente (REGRA #-2).
**Cross-ADR:** [ADR-0007](./adr/0007-rebase-from-kv2-to-supabase-erp.md) §schema `tracking.*` Supabase staging, [ADR-0011 ERP](file:///Users/gorito/Dev/ERP-Mentoria/docs/adr/0011-integration-bridge-pattern.md) Integration Bridge Pattern (ports/adapters).

> 🔥 **Validação prática crítica executada antes de finalizar ADR:** PRD assumia `mcp__hostinger__hosting_deployWordpressPlugin` existia; o local skill `hostinger-agent-skills/skills/hosting/SKILL.md` **NÃO** documenta esse primitive. Investigação ao código-fonte do MCP server oficial (https://github.com/hostinger/api-mcp-server `src/core/runtime.ts`, `tools/hosting.ts`) confirma que **a primitive EXISTE no MCP server unified binary** (não no SKILL.md local que está outdated). Detalhes mecanísticos descobertos modificam o desenho proposto — ver §3.1.

---

## 1. Contexto

### 1.1 Problema técnico

Auto-provisionar GTM4WP em N sites WordPress hospedados na Hostinger envolve 6 sub-problemas que arquitetura precisa endereçar:

1. **Multi-step deploy** — listar sites → resolver brand → preparar plugin dir → upload arquivos → ativar plugin → configurar container_id → validar dataLayer. Cada step pode falhar independentemente; idempotência precisa cobrir todos.
2. **Audit + LGPD** — registrar quem/quando/o-quê sem vazar PII (tokens, response bodies internos Hostinger).
3. **Secret storage** — token Hostinger API criptografado (já existe pattern Vault per ADR-0011 ERP).
4. **Provider abstraction** — MVP é Hostinger-only mas PRD §1.3 + master-gtm-strategy projeta Onda 2 com WP REST API genérico. Adapter pattern desde o início evita refactor doloroso.
5. **Idempotência** — re-instalar mesmo site não duplica (a primitive MCP cria diretório com sufixo random — quebra idempotência no filesystem; precisamos modelar idempotência no nosso schema).
6. **Validador pós-deploy** — confirmar dataLayer real, não só HTTP 200.

### 1.2 Decisões já tomadas Diego (não rediscutir)

- MVP scope: só Hostinger
- Single-tenant (Mentoria) — multi-tenant Onda 2
- Stack reuso: `tracking-api` Hono Node + `tracking-app` Vite + Supabase staging `cjtwrzlwfqvzukjinmjr`
- Cloudflare-last (sem Cloudflare aqui)

### 1.3 Forças (constraints reais)

| Força | Implicação |
|---|---|
| Diego sozinho dev | Solução simples > elegante. Adapter pattern OK porque code growth é linear. |
| Cloudflare-last (REGRA #-2) | Validador HTTP roda dentro do `tracking-api` Hono Node KV8, não em edge function. |
| Manifesto 22/05 sem prazo | Pode optar por solução robusta (audit + LGPD + retry) ainda no MVP. |
| `tracking.*` schema canônico | Migrations vivem em `supabase-target/migrations/02XX_*.sql`. Tabelas novas em `tracking.*`. |
| Vault padrão ADR-0011 ERP | Token Hostinger via `vault.create_secret` + `vault.decrypted_secrets`. Pattern já estabelecido (ver migration 0237). |
| Hostinger API rate limit desconhecido | Implementar retry exponencial + medir antes de batch. R1 do PRD. |
| Manifesto Diego "ficar bom > ship rápido" | Validar primitive ANTES (já feito acima) + escrever pgTAP tests pra cada RPC nova. |

---

## 2. Decision summary (TL;DR)

1. **Q1 plugin strategy →  HÍBRIDA "fork mínimo embarcado".** Mantém plugin official GTM4WP upstream como submodule/dep + injeta 1 arquivo de bootstrap (`mentoria-gtm-bootstrap.php`) que pre-popula opções WP via `update_option()` no `register_activation_hook`. Best of both: auto-update funciona (mantemos plugin upstream intacto), zero hop pós-deploy (bootstrap configura via DB on activation).
2. **Provider adapter pattern** — `IHostingProvider` interface TS no `tracking-api/src/lib/providers/`. 1 impl MVP `HostingerAdapter`. Onda 2 adiciona `WPRestAdapter` sem tocar callers.
3. **Auth/secret storage** — Token Hostinger em **Supabase Vault** seguindo pattern `integrations.tenant_credentials` (migration 0237). Field `tracking.hosting_accounts.token_vault_id` aponta pra `vault.secrets.id`.
4. **DB schema** — 3 tabelas novas no schema **`tracking.*`** (alinhado ADR-0007): `tracking.hosting_accounts`, `tracking.gtm_installations`, `tracking.installation_audit`. Detalhes §3.5.
5. **Validador pós-deploy** — **2-stage: HTTP HEAD fast-path (<500ms) + Full GET regex (~3s) on first install OR on revalidate.** Playwright **fora** do MVP (Should pra Onda 1.5).
6. **Token rotação** — **Manual MVP.** Healthcheck on-demand antes de cada deploy. UI mostra "última validação OK há Xd".
7. **Retry policy** — Exponential backoff `[1s, 2s, 4s]` (max 3), só pra erros 5xx + network. 4xx é fail-fast.
8. **Idempotência** — UNIQUE `(hosting_account_id, site_domain)` em `tracking.gtm_installations`. Re-install = UPDATE `last_attempted_at` + reset `status=installing`. Audit log preserva histórico.

---

## 3. Decision rationale (detalhado)

### 3.1 Descoberta crítica: como `hosting_deployWordpressPlugin` funciona de verdade

Investigação ao MCP server source (`api-mcp-server/src/core/runtime.ts` linhas ~`handleWordpressPluginDeploy`):

```ts
// Input schema:
{
  domain: string,      // ex "zerohum.com.br"
  slug: string,        // ex "gtm4wp-mentoria"
  pluginPath: string   // path local com files do plugin
}

// Comportamento:
1. resolveUsername(domain) → GET /api/hosting/v1/websites?domain=X → extrai username
2. randomSuffix = 8-char random → uploadDirName = `${slug}-${randomSuffix}`
3. scanDirectory(pluginPath) → lista todos files recursivamente
4. fetchUploadCredentials(username, domain) → POST → { uploadUrl, auth_key, rest_auth_key }
5. Para cada file: upload via tus-js-client → `wp-content/plugins/${uploadDirName}/${relPath}`
6. Retorna { status, summary{successful, failed}, results, uploadDirName }
```

**Implicações que mudam o desenho:**

| Descoberta | Implicação arquitetural |
|---|---|
| **Random suffix em uploadDirName** | NÃO podemos garantir mesmo path em re-install. Slug `gtm4wp-mentoria` vira `gtm4wp-mentoria-aB3kZ9pQ` na 1ª vez e `gtm4wp-mentoria-Xm7sJ2nL` na 2ª. Idempotência precisa morar no NOSSO DB (`tracking.gtm_installations`), não no filesystem. |
| **NÃO há ativação automática** | Upload deixa o plugin discoverable em /wp-admin/plugins (porque WP varre `wp-content/plugins/*/plugin-name.php`), mas **inativo**. Precisamos de mecanismo de ativação. |
| **Mecanismo de upload = TUS** | Resumable, tolerante a falha de rede. Bom. Mas requer credenciais via `fetchUploadCredentials` que provavelmente expira; cada deploy = 1 fresh credential. |
| **pluginPath é diretório local do MCP runtime** | O backend `tracking-api` precisa ter o plugin files no filesystem do container ANTES de chamar MCP. Implica: bundle plugin no Docker image OU baixar de Git release em runtime OU manter um volume Easypanel persistente. |
| **Sem garantia de aceitar ZIP** | Schema requer `pluginPath` = directory. Se quisermos .zip, descompactamos antes. Custom plugin → custom directory. ✅ Q1 fork strategy é viável. |
| **Não documenta erro quando username não resolve** | Site precisa estar listado em `/api/hosting/v1/websites`. Adicionar fase de pré-flight que confirma o site existe. |

### 3.2 Q1 — Plugin strategy: **híbrida "fork mínimo embarcado"**

Pesei 3 opções:

#### Opção A — Plugin GTM4WP oficial puro + WP REST API pós-deploy
- **Como funciona:** baixar `gtm4wp` do WP.org release, deploy via MCP, depois chamar WP REST API `/wp-json/wp/v2/options` (ou plugin-specific endpoint se houver) pra setar container ID + Consent Mode v2 + custom dimensions.
- ✅ Auto-update grátis (plugin oficial WP repo)
- ✅ Comunidade mantém código
- ❌ **GTM4WP NÃO expõe REST API pra config** — config mora em options serializadas (`gtm4wp-options`) que require autenticação application password + capability `manage_options`
- ❌ Mais um hop = mais um ponto de falha + latência (deploy + REST call)
- ❌ Application Password requer setup manual por site (Diego cola no painel) — fere o "1-clique" do PRD

#### Opção B — Fork pré-configurado .zip por brand
- **Como funciona:** clonar GTM4WP, hardcoded container ID + config no PHP source, manter 4 forks (mentoria, mentoria-app, zerohum, ifrn). Build via CI por brand.
- ✅ Zero config pós-deploy
- ❌ **4 forks × N upgrades = ops hell.** Quando GTM4WP lança v2.0 com security patch, replay 4 forks. Diego sozinho.
- ❌ Plugin slug vira único por brand (`gtm4wp-mentoria`, `gtm4wp-zerohum`) → WP não detecta auto-update (não tá no repo oficial)
- ❌ Quebra "fonte de verdade no DB" (R4) — container ID hardcoded no PHP duplica o que está em `core.schools.gtm_container_id`

#### Opção C (ESCOLHIDA) — Fork MÍNIMO embarcado (1 bootstrap file)
- **Como funciona:**
  1. Diretório local `tracking-api/plugins/gtm4wp-mentoria/` contém:
     - GTM4WP upstream completo (vendored via npm package OU git submodule OU `composer install` em CI; congelado em pinned version)
     - 1 arquivo NOSSO: `mentoria-gtm-bootstrap.php` que faz:
       ```php
       <?php
       /**
        * Plugin Name: GTM4WP Mentoria Bootstrap
        * Depends: GTM4WP
        */
       register_activation_hook(__FILE__, function() {
         $tenant_config = json_decode(file_get_contents(__DIR__ . '/mentoria-config.json'), true);
         update_option('gtm4wp-options', [
           'gtm-code' => $tenant_config['container_id'],
           'consent-mode-v2' => true,
           // ... rest of config
         ]);
         if (!is_plugin_active('gtm4wp/gtm4wp.php')) {
           activate_plugin('gtm4wp/gtm4wp.php');
         }
         activate_plugin(plugin_basename(__FILE__));
       });
       ```
     - 1 arquivo gerado per-deploy: `mentoria-config.json` (container_id + brand_slug)
  2. `tracking-api` injeta `mentoria-config.json` DO DB (`tracking.gtm_installations` → JOIN `core.schools.gtm_container_id`) ANTES de chamar MCP `hosting_deployWordpressPlugin`
  3. MCP faz upload, WP detecta plugin novo, Diego (OU sistema) ativa → bootstrap hook pre-configura GTM4WP
- ✅ GTM4WP fica intocado, auto-update funciona quando ativado manualmente
- ✅ Container ID continua single-source-of-truth no DB (`core.schools.gtm_container_id` + JOIN no install)
- ✅ Apenas 1 arquivo custom mantido (`bootstrap.php` + `config.json`)
- ✅ Bootstrap PHP < 50 LoC — Diego mantém
- ❌ Ainda precisa "ativar plugin" pós-deploy (NÃO é problema porque uploadando ambos `gtm4wp` + `gtm4wp-mentoria` ao mesmo path e WP auto-detecta ambos; activation via fallback HTTP ou mu-plugins trick — ver §3.4)
- ⚠️ Risco: se GTM4WP muda nomes de option keys em major bump, bootstrap quebra. Mitigação: pgTAP test no validator detecta drift; backend versiona `tracking.gtm_installations.plugin_version`.

**Decisão final:** Opção C. Trade-off: ~3-5 LoC PHP custom em troca de auto-update + DB-as-source-of-truth.

### 3.3 Provider adapter pattern

Arquitetura ports/adapters (per ADR-0011 ERP):

```
┌────────────────────────────────────────────────┐
│  tracking-api (Hono Node)                       │
│  ┌──────────────────────────────────────────┐  │
│  │ POST /api/installations/:id/deploy       │  │
│  │   - lê tracking.gtm_installations         │  │
│  │   - lê core.schools (gtm_container_id)    │  │
│  │   - chama IHostingProvider.deployPlugin() │  │
│  └──────────────────────┬───────────────────┘  │
│                          │ port                 │
│  ┌───────────────────────▼──────────────────┐  │
│  │ interface IHostingProvider {              │  │
│  │   listSites(): Promise<Site[]>            │  │
│  │   verifyDomain(domain): Promise<boolean>  │  │
│  │   deployPlugin(opts): Promise<DeployRes>  │  │
│  │   pingToken(): Promise<boolean>           │  │
│  │ }                                          │  │
│  └─────┬───────────────────────────┬────────┘  │
│        │ MVP                       │ Onda 2     │
│  ┌─────▼──────────┐         ┌──────▼─────────┐ │
│  │ HostingerAdapter│         │ WPRestAdapter  │ │
│  │ (MCP wrapper)   │         │ (generic WP)   │ │
│  └─────────────────┘         └────────────────┘ │
└────────────────────────────────────────────────┘
```

Estrutura proposta:

```
tracking-api/src/
  lib/providers/
    IHostingProvider.ts      # interface + types
    HostingerAdapter.ts      # MVP impl wrapping MCP + Hostinger REST
    index.ts                 # factory: getProvider(type: 'hostinger') → instance
  routes/
    installations.ts         # endpoints
    hosting-accounts.ts
  plugins/
    gtm4wp-mentoria/
      gtm4wp/                # vendored upstream (gitignore + populated by CI)
      mentoria-gtm-bootstrap.php
      mentoria-config.json.template
```

Onda 2 plug-in (WPRestAdapter) só precisa implementar a interface — caller não muda.

### 3.4 Ativação do plugin pós-upload

**Problema:** MCP só uploada, não ativa. WP-admin requer login.

**3 estratégias avaliadas:**

| # | Estratégia | Como | Trade-off |
|---|---|---|---|
| A | **must-use plugin (mu-plugins)** | Em vez de subir em `plugins/`, subir em `mu-plugins/` (WP carrega automaticamente sem ativação). | ❌ MCP hardcode `wp-content/plugins/` no upload path. Não controlamos o destino. |
| B | **`wp-cli` via SSH** | SSH no shared hosting Hostinger → `wp plugin activate gtm4wp-mentoria-XXX`. | ❌ Shared hosting Hostinger SSH é restrito (apenas Premium+ tier). Diego precisa confirmar plan. Maioria dos planos Hostinger compartilhados NÃO tem SSH. |
| C (ESCOLHIDA) | **HTTP request a `/wp-admin/admin-ajax.php` ou `/wp-login.php`** com nonce + auth | Backend Hostinger envia request com cookie session de admin OU application password. | ⚠️ Requer credencial WP admin (não só Hostinger token). Diego cola 1x por site. Stored em Vault separadamente (`tracking.hosting_accounts.wp_admin_credentials_vault_id` nullable). |
| D (FALLBACK) | **Manual click "Activate"** no WP-admin Hostinger | UI MVP mostra: "Plugin uploaded ✓. Click [Open WP Admin] → Plugins → Activate GTM4WP Mentoria → Click [Re-validate] here." | ✅ Zero requisito técnico extra. ❌ Quebra "1-clique" promessa do PRD. |

**Decisão final:** **C como Must se feasible; D como fallback declarado no PRD.**

Implementação:
- Migration cria coluna `tracking.hosting_accounts.wp_admin_creds_vault_id uuid NULL` (nullable porque alguns sites podem optar por D)
- UI "Add Hostinger account" tem 2 campos opcionais: "Hostinger API Token (required)" + "WP Admin App Password (optional, enables auto-activation)"
- Backend tenta C; se falhar OU faltar creds, marca install com `status='uploaded_pending_activation'` + UI mostra step D explícito

**Validação que ativação funcionou:** validador pós-deploy (§3.6) só passa se dataLayer EXISTS no DOM — automaticamente cobre "ativou ou não".

### 3.5 DB schema — 3 tabelas novas + 1 coluna existente

**Schema canônico:** `tracking.*` (per ADR-0007). Migrations: `supabase-target/migrations/0245_*.sql` em diante (próximo livre).

#### Migration 0245 — `tracking.hosting_accounts`

```sql
CREATE TABLE tracking.hosting_accounts (
  id                       uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id                uuid          NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  provider                 text          NOT NULL CHECK (provider IN ('hostinger', 'wp_rest')),
  account_label            text          NOT NULL,                -- "Diego pessoal" / "Mentoria account"
  token_vault_id           uuid          NOT NULL,                -- → vault.secrets.id (Hostinger API token)
  wp_admin_creds_vault_id  uuid          NULL,                    -- → vault.secrets.id (WP app password, opcional)
  account_email            text          NULL,                    -- metadata, não-PII (já é pública)
  status                   text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','token_expired','revoked')),
  last_validated_at        timestamptz   NULL,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hosting_accounts_unique UNIQUE (tenant_id, provider, account_label)
);
COMMENT ON TABLE tracking.hosting_accounts IS
  'Credenciais Hosting Provider (Hostinger MVP, WP REST Onda 2). Tokens em Vault.';
```

RLS: `tenant_id` policy padrão (`USING (tenant_id IN (SELECT id FROM core.tenants WHERE ...))`).

#### Migration 0246 — `tracking.gtm_installations`

```sql
CREATE TABLE tracking.gtm_installations (
  id                       uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id                uuid          NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  hosting_account_id       uuid          NOT NULL REFERENCES tracking.hosting_accounts(id) ON DELETE RESTRICT,
  site_domain              text          NOT NULL,                -- "zerohum.com.br"
  brand_slug               text          NOT NULL,                -- ref core.schools.slug
  gtm_container_id         text          NOT NULL,                -- snapshot do core.schools.gtm_container_id no momento do install
  plugin_version           text          NOT NULL,                -- ex "gtm4wp-1.18+bootstrap-v1"
  status                   text          NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','uploading','uploaded_pending_activation',
                                               'activating','validating','installed','failed','uninstalled')),
  upload_dir_name          text          NULL,                    -- "gtm4wp-mentoria-aB3kZ9pQ" (returned by MCP)
  attempt_count            int           NOT NULL DEFAULT 0,
  last_attempted_at        timestamptz   NULL,
  installed_at             timestamptz   NULL,
  last_validation_at       timestamptz   NULL,
  last_validation_result   jsonb         NULL,                    -- {datalayer_present: true, container_match: true, ...}
  last_error               text          NULL,
  created_by               uuid          NULL REFERENCES auth.users(id),
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT gtm_installations_unique_per_site UNIQUE (hosting_account_id, site_domain)
);
CREATE INDEX gtm_installations_status_idx
  ON tracking.gtm_installations (tenant_id, status)
  WHERE status IN ('uploading','activating','validating');
COMMENT ON TABLE tracking.gtm_installations IS
  'Estado por (hosting_account × site). UNIQUE garante idempotência re-install.';
```

#### Migration 0247 — `tracking.installation_audit`

```sql
CREATE TABLE tracking.installation_audit (
  id                       uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  installation_id          uuid          NOT NULL REFERENCES tracking.gtm_installations(id) ON DELETE CASCADE,
  tenant_id                uuid          NOT NULL,                -- denormalizado pra RLS performance
  action                   text          NOT NULL
                             CHECK (action IN ('draft_created','upload_started','upload_complete','upload_failed',
                                               'activation_started','activation_complete','activation_failed',
                                               'validation_passed','validation_failed','uninstalled','token_refresh')),
  payload                  jsonb         NOT NULL DEFAULT '{}',   -- METADATA APENAS, no PII (ver §3.7 LGPD)
  actor_user_id            uuid          NULL REFERENCES auth.users(id),
  actor_source             text          NOT NULL DEFAULT 'tracking-api'  -- 'tracking-api' | 'cron-validator' | 'manual-sql'
                             CHECK (actor_source IN ('tracking-api','cron-validator','manual-sql','migration')),
  created_at               timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX installation_audit_lookup_idx
  ON tracking.installation_audit (installation_id, created_at DESC);
COMMENT ON TABLE tracking.installation_audit IS
  'Append-only audit log. LGPD-safe: payload SEM tokens/secrets/response bodies brutos. Ver bootstrap.';
```

Trigger pra autopopulate `tenant_id` from installation_id (denormalização defensiva pra RLS — pattern já usado em outras migrations 02xx).

#### Não-migration: dados em `core.schools.gtm_container_id` já existem

Confirmado por CLAUDE.md §"Brands rastreadas". Auto-provisioner LÊ daí (single source of truth). NÃO escreve.

**Resolve Q2:** Opção B do PRD modificada — `tracking.gtm_installations.gtm_container_id` é SNAPSHOT (não authoritative). Authoritative = `core.schools`. Snapshot permite trace "qual container foi instalado em X data" mesmo se brand mudar de container depois.

### 3.6 Validador pós-deploy — 2-stage

**Decisão Q3:** rejeita HEAD puro (não confere dataLayer); rejeita Playwright puro (custo infra + complexidade no MVP). Adota híbrido:

```ts
async function validate(domain: string, expectedContainerId: string): ValidationResult {
  // Stage 1: HEAD fast-path (<500ms) — confere site online
  const headRes = await fetch(`https://${domain}/`, { method: 'HEAD', timeout: 5000 });
  if (!headRes.ok) return { passed: false, stage: 'head', reason: `HTTP ${headRes.status}` };

  // Stage 2: Full GET + regex DOM (~3s)
  const html = await (await fetch(`https://${domain}/`)).text();
  const containerMatch = new RegExp(`GTM-[A-Z0-9]{6,8}`).test(html);
  const expectedMatch = html.includes(expectedContainerId);
  const datalayerMatch = /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/.test(html)
                      || /dataLayer\s*=\s*\[/.test(html);

  return {
    passed: containerMatch && expectedMatch && datalayerMatch,
    stage: 'full',
    details: { containerMatch, expectedMatch, datalayerMatch, expectedContainerId }
  };
}
```

**Playwright** = Should pra Onda 1.5 (detecta dataLayer presence APÓS JS execute, não só no source — útil pra sites que injetam GTM via JS file separado).

**Cron diário (Could, Onda 1.5):** revalida cada install ativo 1× / 24h. Detecta uninstall manual por engano.

### 3.7 LGPD — Q4 resolvido

**Decisão:** **só metadata em `installation_audit.payload`.** Raw response Hostinger fica em log temporário (Docker stdout do `tracking-api`, persiste 7 dias por Easypanel retention) — Diego pode `docker logs` se precisar debug.

`payload jsonb` aceita:
- ✅ `site_domain`, `status_code`, `timing_ms`, `file_count`, `upload_dir_name`, `error_message_truncated_500_chars`
- ❌ `hostinger_token`, `wp_admin_password`, `account_email_personal`, `response_body_full`

Bootstrap helper Dex escreve:

```ts
function safeAuditPayload(raw: any): SafePayload {
  return {
    site_domain: raw.domain,
    status_code: raw.status,
    timing_ms: raw.timing,
    file_count: raw.summary?.total,
    upload_dir_name: raw.uploadDirName,
    error_summary: raw.error?.toString().slice(0, 500),
    // NÃO inclui raw.results (paths fs do container), NÃO inclui tokens
  };
}
```

pgTAP test garante `tracking.installation_audit.payload` NÃO contém keys `token`, `password`, `secret`, `bearer`.

### 3.8 Token rotação — Q5 resolvido

**Decisão:** **manual MVP.** Hostinger API tokens ficam em hpanel.hostinger.com/profile/api por tempo indeterminado até user revogar. OAuth refresh = Onda 2.

Pingar token:
- **On-demand:** botão "Validar conexão" na UI da hosting_account
- **Automático:** antes de cada `deployPlugin()`, chamar `provider.pingToken()` (= `listSites()` com page=1, per_page=1). Se 401 → marca account `status='token_expired'` + UI alert.
- **Cron diário (Could):** WF18 (uptime monitor já existente per CLAUDE.md backlog) revalida todos tokens ativos.

### 3.9 Retry policy

**Apenas em erros transitórios (5xx + network).** 4xx (auth, validation, not_found) = fail-fast.

```ts
const RETRY_BACKOFF_MS = [1000, 2000, 4000];  // ~7s pior caso
const RETRY_STATUSES = [500, 502, 503, 504];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isRetryable = RETRY_STATUSES.includes(e.status) || e.code === 'ECONNRESET';
      if (!isRetryable || attempt === RETRY_BACKOFF_MS.length - 1) throw e;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  throw new Error('Unreachable');
}
```

Audit log registra cada retry em `installation_audit.payload.retry_attempt`.

### 3.10 Idempotência

**UNIQUE `(hosting_account_id, site_domain)` garante 1 row per install.**

Re-install flow:
```ts
async function deployInstallation(siteId: string) {
  await db.tx(async (tx) => {
    const inst = await tx.upsertGtmInstallation({
      // ... onConflict updates last_attempted_at, attempt_count++, status='uploading'
    });
    // ... deploy steps
  });
}
```

Se MCP cria diretório novo a cada deploy (per §3.1), velhos diretórios ficam órfãos no filesystem WP. **Cleanup story (Should):** botão "Uninstall + Cleanup" remove diretório antigo via WP REST API (`/wp-json/wp/v2/plugins/{slug}`) ANTES de novo upload.

---

## 4. Consequences

### 4.1 Positivos

- ✅ **Provider adapter facilita Onda 2** — WPRestAdapter plug-in sem refactor consumers
- ✅ **Audit log permite debug + LGPD compliance** — append-only, sem PII
- ✅ **Schema preparado pra multi-tenant** desde MVP (campo `tenant_id` em todas tabelas + RLS)
- ✅ **Vault pattern reuso** — sem reinventar encryption, sem manter chave secreta no env
- ✅ **Fork mínimo bootstrap = manutenção quase zero** — só 1 arquivo PHP custom
- ✅ **DB-as-source-of-truth pra container_id** — sem drift entre código/config
- ✅ **Validador 2-stage = bom trade-off speed/accuracy** — HEAD descarta 80% problemas rapidamente, full GET cobre os 20% restantes

### 4.2 Negativos

- ❌ **Supabase Vault encryption latency** — `vault.decrypted_secrets` lookup adiciona ~10-30ms por get. Não-bloqueante mas mensurável.
- ❌ **Retry exponencial pior caso ~7s** — UI precisa loading state visível (Uma responsabilidade)
- ❌ **Plugin files no container** — bundle Docker image fica maior (~5-10MB extra com GTM4WP vendored). Trade-off aceitável.
- ❌ **WP Admin password storage extra Vault** — se Diego optar fluxo C ativação, +1 credencial por site pra rotacionar. Onda 2 OAuth pode automatizar.
- ❌ **MCP plugin upload random suffix quebra `wp plugin update`** — auto-update WP funciona por slug folder. Solução: bootstrap NÃO é o gtm4wp main; bootstrap só configura. GTM4WP main vai instalado com slug `gtm4wp` (sem random) via WP REST install. Re-validar implementação.

### 4.3 Riscos cobertos

| Risco PRD | Mitigação ADR |
|---|---|
| R1 Rate limit | Retry exponencial §3.9 + serial deploy (no batch parallel até medir) |
| R2 Deploy falha meio | Validador 2-stage + status `uploaded_pending_activation` + audit log preserva contexto |
| R3 Token expira | `pingToken()` antes de cada deploy + cron diário (Could) |
| R4 Container ID errado | DB single-source-of-truth + validador confere container no DOM bate com expected |
| R5 MCP limitação plugin .zip | **RESOLVIDO via investigação §3.1** — MCP aceita directory, fork mínimo OK |

### 4.4 Riscos NOVOS introduzidos pelo ADR

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **GTM4WP option keys mudam em major release** | Baixa | Médio | pgTAP test no validator + versionamento `tracking.gtm_installations.plugin_version` |
| **Hostinger shared hosting sem SSH/WP-CLI** | Alta (default Hostinger plans) | Médio | Fallback D (manual activation com link UI) declared |
| **TUS upload credentials expiram durante deploy lento** | Baixa | Alto | MCP já lida internamente (refetch). Documentar timeout backend = 120s. |
| **WP Application Password setup requer Diego manual 1× por site** | Alta | Baixo | Documentado no PRD. UI step claro. |
| **Multi-site na mesma hosting account com mesmo brand_slug** | Baixa | Baixo | UNIQUE `(hosting_account_id, site_domain)` previne. site_domain é o discriminator. |

---

## 5. Alternatives considered (rejeitadas)

### Alt 1 — Direct SSH em vez de MCP
- ❌ Maioria planos Hostinger compartilhados não tem SSH
- ❌ Perde primitive Hostinger oficial (TUS upload + auth credenciado)
- ❌ Idempotência pior (precisa gerenciar SSH keys, jump host)

### Alt 2 — n8n workflow em vez de endpoint `tracking-api`
- ❌ Perde transações DB (n8n stateless, multi-node async)
- ❌ UX assíncrona ruim (frontend não tem progresso real-time, só polling)
- ❌ Audit log fragmentado (n8n logs ≠ DB)
- ✅ Único pro: reuso pattern receiver→consumer já existente. Não vale o trade-off.

### Alt 3 — Edge Function Supabase em vez de Hono Node
- ❌ MCP Hostinger não roda em Deno edge runtime (Node-only, tus-js-client)
- ❌ Plugin files vendored não cabem em edge function size limit
- ❌ Cloudflare-last policy reforça preferência Hono Node Easypanel

### Alt 4 — REST direto à Hostinger API em vez de MCP
- ⚠️ Considerado seriamente. MCP é wrapper sobre REST + TUS. Poderíamos chamar TUS direto.
- ❌ Reescreveríamos `fetchUploadCredentials` + TUS upload loop + scanDirectory — duplicação
- ❌ MCP gerencia OAuth/token refresh + retries internos
- ✅ Vantagem: menos camada. Mas overhead manter > benefit MVP.
- **Veredito:** usar MCP no MVP. Reavaliar em Onda 2 se MCP virar bottleneck.

### Alt 5 — Plugin nuclear: subir 100% custom (sem GTM4WP)
- ❌ Reescrever GTM injection from scratch
- ❌ Sem benefit (GTM4WP é bem mantido, Consent Mode v2 nativo)
- ❌ Forço Diego a manter integration com WP themes/builders (Elementor, Divi, etc.) — GTM4WP cobre

---

## 6. Implementation roadmap (handoff Dex/Dara)

Ordem lógica de dependências (Manifesto 22/05: sem datas, ordem importa):

### Story 1 — Database migrations (Dara)
- Migrations 0245, 0246, 0247 do §3.5
- RLS policies (`tenant_id` based) seguindo pattern existente
- pgTAP tests:
  - UNIQUE constraint `(hosting_account_id, site_domain)` previne duplicates
  - `installation_audit.payload` triggers reject keys `token|password|secret|bearer`
  - RLS isolates tenant_id (Diego só vê seus rows)
- Função RPC `tracking.rpc_create_installation(p_account_id, p_domain, p_brand_slug)` retorna installation_id

### Story 2 — Provider interface + HostingerAdapter (Dex)
- `tracking-api/src/lib/providers/IHostingProvider.ts` — interface + types
- `tracking-api/src/lib/providers/HostingerAdapter.ts` — impl wrapping MCP
- `tracking-api/src/lib/providers/index.ts` — factory
- Unit tests com MCP mock (vitest)
- Documenta `pluginPath` strategy: GTM4WP vendored via npm or git submodule, bootstrap PHP file generated per-install

### Story 3 — API endpoints (Dex)
- `POST /api/hosting-accounts` — body `{ provider, token, label, wp_admin_password? }`. Cria vault secret + row.
- `GET /api/hosting-accounts/:id/sites` — lista sites Hostinger merged com installs
- `POST /api/installations` — body `{ hosting_account_id, site_domain, brand_slug }`. Cria draft.
- `POST /api/installations/:id/deploy` — trigger deploy assíncrono. Retorna 202 + installation_id pra polling.
- `GET /api/installations/:id` — status atual (UI polling endpoint)
- `POST /api/installations/:id/revalidate` — re-roda validador sem reinstalar
- `DELETE /api/installations/:id` — uninstall (Should, mas endpoint pronto pra MVP)

### Story 4 — Validador pós-deploy (Dex)
- `tracking-api/src/lib/validator.ts` — função `validate(domain, expectedContainerId)` per §3.6
- pgTAP integration test: mock site HTML com/sem dataLayer e container correto/errado

### Story 5 — Audit log + retry (Dex)
- Helper `safeAuditPayload(raw)` per §3.7
- `withRetry<T>` per §3.9
- pgTAP test: payload sanitization

### Story 6 — Frontend integration (Uma → Dex)
- Uma desenha wireframes (paralelo a este ADR)
- Rota `/sites` no tracking-app Vite
- Dex implementa: lista sites, modal "Add Hostinger account", botão "Install tracking", progress polling, success/error states
- Reusa design tokens ERP existente (per CLAUDE.md)

### Story 7 (opcional Onda 1.5) — Cron validador diário
- WF18 reuse (uptime monitor) — daily 04h BRT verifica cada install
- Insere `installation_audit.action='validation_passed' | 'validation_failed'`
- Alerta Telegram se >5 sites failed (reusa infra WF18b já existente)

### Story 8 (opcional Onda 1.5) — Uninstall + cleanup
- WP REST API DELETE `/wp-json/wp/v2/plugins/{slug}` (requer app password)
- Remove orphan directories de re-installs anteriores
- pgTAP test cleanup

---

## 7. Open questions PRD respondidas

| # | Q (PRD §10) | Decisão final | Rationale curto |
|---|---|---|---|
| **Q1** | Plugin oficial vs fork .zip | **Híbrida "fork mínimo embarcado" (Opção C nova)** | Best-of-both: auto-update GTM4WP intacto + 1 file bootstrap pre-popula opções. ~50 LoC PHP custom. |
| **Q2** | GTM container ID mora onde | **Authoritative: `core.schools.gtm_container_id` (já existe). Snapshot: `tracking.gtm_installations.gtm_container_id`** | DB single source of truth (R4 mitigação). Snapshot permite audit "que container foi instalado em X data". |
| **Q3** | Validador HEAD vs full vs Playwright | **2-stage: HEAD fast-path + Full GET regex. Playwright = Onda 1.5** | Equilíbrio latency/accuracy. ~3s p95. Playwright caro pro MVP. |
| **Q4** | Audit payload raw vs metadata | **Só metadata. Raw fica em Docker stdout 7d retention** | LGPD-safe by default. Debug via `docker logs` quando necessário. pgTAP test reject keys sensíveis. |
| **Q5** | Token rotação auto vs manual | **Manual MVP. OAuth = Onda 2** | Hostinger API tokens não expiram automaticamente. `pingToken()` antes de deploy detecta revogação. |

---

## 8. Validation checklist pré-implementação

Antes de Dara aplicar migration 0245:

- [ ] Diego confirma plan Hostinger dele suporta SSH (info pra fallback Alt 1 se MCP virar bloqueio)
- [ ] Diego gera Hostinger API token + WP Application Password (1 por site WP) — anota no 1Password
- [ ] Aria valida que vendored GTM4WP cabe no Docker image `tracking-api` (size budget +10MB OK?)
- [ ] Aria escreve smoke test E2E em staging: instalar GTM4WP-mentoria em 1 site Hostinger test (preferência: usar 1 site free subdomain `*.hostingersite.com` pra evitar tocar zerohum/IFRN prod)
- [ ] Quinn dry-run migrations 0245-0247 em branch staging Supabase
- [ ] Uma wireframes paralelos prontos antes de Dex Story 3

---

## 9. Cloudflare-last policy compliance

- ✅ Sem Cloudflare adicionado
- ✅ Backend Hono Node Easypanel KV8 (mantém)
- ✅ Frontend Vite Easypanel KV8 (mantém)
- ✅ DB Supabase staging cjtwrzlwfqvzukjinmjr (mantém)
- ✅ MCP Hostinger = wrapper sobre TUS upload + Hostinger REST (sem Cloudflare proxy)
- ✅ Validador = direct HTTP request `tracking-api` → site WP (sem CDN intermediário)

---

## 10. Referências

- PRD upstream: `docs/prd-auto-provisioner-gtm-mvp.md`
- ADR-0006 (Mentoria-Tracking SaaS strategy): `docs/adrs/0006-mentoria-tracking-saas.md`
- ADR-0007 (rebase KV2→Supabase ERP schema `tracking.*`): `docs/adr/0007-rebase-from-kv2-to-supabase-erp.md`
- ADR-0011 ERP (Integration Bridge Pattern): cross-repo file:///Users/gorito/Dev/ERP-Mentoria/docs/adr/0011-integration-bridge-pattern.md
- Master GTM Strategy: `docs/master-gtm-strategy.md`
- Hostinger MCP server source (runtime.ts): https://github.com/hostinger/api-mcp-server/blob/main/src/core/runtime.ts
- Hostinger MCP tools list (hosting.ts): https://github.com/hostinger/api-mcp-server/blob/main/src/core/tools/hosting.ts
- GTM4WP plugin: https://github.com/duracelltomi/gtm4wp (Thomas Geiger)
- Migrations 0237/0238 (Vault pattern reference): `supabase-target/migrations/`

---

**Fim do ADR-0008. Status: Proposed. Aguarda Diego review + Uma wireframes paralelos antes de Nova story breakdown.**
