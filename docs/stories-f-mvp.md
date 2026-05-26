# Stories — Feature F (Auto-Provisioner GTM MVP)

**Autora:** Nova (Visionary/PO)
**Data:** 2026-05-25
**Status:** Draft pra handoff River (story details)
**Modelo:** Opus 4.7 (1M context)

**Upstream:**
- PRD: [`prd-auto-provisioner-gtm-mvp.md`](./prd-auto-provisioner-gtm-mvp.md) (Kai)
- ADR base: [`adr-0008-auto-provisioner-gtm-architecture.md`](./adr-0008-auto-provisioner-gtm-architecture.md) (Aria)
- ADR addendum mock storage: [`adr-0008a-mock-storage-mvp-addendum.md`](./adr-0008a-mock-storage-mvp-addendum.md) (Aria)
- UX flow: [`ux-auto-provisioner-gtm-flow.md`](./ux-auto-provisioner-gtm-flow.md) (Uma)

**Downstream:** River detalha cada story → Dex/Dara implementam → Quinn gate por sprint → Felix deploy.

**Manifesto 22/05 vigente:** sem prazo. Story points definem ordem + dependências, não calendário. "1 dia ou 100 anos. Não importa."

---

## 1. Sumário executivo

| Métrica | Valor |
|---|---|
| Total stories | **15** (F-S01 a F-S15) |
| Soma story points | **52** |
| Sprints sugeridos | **4** (Foundation, Backend core, Frontend, Plugin+smoke) |
| Stories blocker (gate de tudo) | **F-S01, F-S02, F-S03** (Sprint 0 — sem elas nada flui) |
| Owners involved | **dex** (10), **dara** (0 — sem migrations no MVP F), **uma** (1 review), **orchestrator** (4) |
| Reuse rate frontend | 7 components ERP + 8 novos / 4 hooks / 4 rotas Vite |

### Distribuição por sprint

| Sprint | Stories | Pontos | Pode rodar em paralelo? |
|---|---|---|---|
| Sprint 0 — Foundation | F-S01, F-S02, F-S03 | 7 | ✅ 3 paralelas (Dex × 3 instâncias se Diego topar) |
| Sprint 1 — Backend core | F-S04 → F-S08 | 21 | ❌ Sequenciais (cada uma depende anterior) |
| Sprint 2 — Frontend | F-S09 → F-S12 | 14 | ⚠️ Parcial — F-S09 (componentes) e F-S11 (hooks) podem começar com mock data antes Sprint 1 fechar |
| Sprint 3 — Plugin + smoke + docs | F-S13, F-S14, F-S15 | 10 | ❌ Sequenciais |

---

## 2. Stories — Sprint 0 (Foundation, paralelizável)

### F-S01 — Mock storage layer (Redis-backed IGtmStorage)

**User story:**
> Como **dev backend (Dex)**, eu quero **uma camada de storage Redis port-adapter implementada por trás da interface `IGtmStorage`**, pra que **endpoints, validator e audit helper possam ler/escrever installations sem acoplar lógica de business com Redis específico** (e Onda 1.5 troque por Supabase sem refactor de callers).

**Acceptance Criteria:**

- AC-1 — Interface `IGtmStorage` definida em `tracking-api/src/lib/storage/IStorage.ts` com todos os métodos do ADR-0008a §2.5 (createAccount/getAccount/listAccounts/updateAccount/deleteAccount + createInstallation/getInstallation/getInstallationBySite/listInstallations/updateInstallation + appendAudit/listAudit + acquireLock/releaseLock).
- AC-2 — Branded types `AccountId`, `InstallationId`, `TenantId`, `ISO8601` em `tracking-api/src/lib/storage/types.ts` previnem mistura acidental de IDs em chamadas (typecheck rejeita passar `InstallationId` num parâmetro que espera `AccountId`).
- AC-3 — Implementação `RedisGtmStorage` em `tracking-api/src/lib/storage/RedisGtmStorage.ts` usa `ioredis` + key conventions do ADR-0008a §2.3 (`gtm:account:*`, `gtm:install:*`, `gtm:audit:*`, `gtm:lock:install:*`).
- AC-4 — Idempotência via `gtm:install:by_site:<sha1(site_domain)>` STRING key resolve: 2 chamadas `createInstallation` com mesmo `site_domain` retornam **mesmo `installation_id`** (não duplica).
- AC-5 — Distributed lock `acquireLock(installation_id, 60)` usa Redis `SET NX EX` — 2 chamadas concurrent retornam `true` apenas pra 1ª; segunda recebe `false` até TTL expirar ou releaseLock executar.
- AC-6 — Factory `tracking-api/src/lib/storage/index.ts` exporta `getStorage(env.STORAGE_BACKEND ?? 'redis')` — retorna `RedisGtmStorage` no MVP F.
- AC-7 — Unit tests com `redis-memory-server` cobrem: CRUD basics + idempotency lookup + lock acquire/release + AOF persistence simulation (kill+restart container → state preserva).

**Tech notes:**
- Referência principal: **ADR-0008a §2.5 (interface) + §2.3 (key conventions) + §2.4 (TypeScript types)**.
- Reuso pattern: design parecido com `IHostingProvider` (ADR-0008 §3.3) — port pattern já estabelecido no repo.
- LoC estimado: ~250 (interface + impl + types + unit tests).
- Sem migrations DB — MVP F throwaway code aceitável (Manifesto 22/05).

**Dependências:** none (blocker pra Sprint 1 inteiro).

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ TypeScript compila sem erros (`tsc --noEmit`)
- ✅ Unit tests passam (`vitest run`)
- ✅ Code review (auto-review Diego)
- ✅ Smoke local: `pnpm dev` no `tracking-api` instancia `RedisGtmStorage` sem crash
- ✅ Deploy staging (Easypanel KV8) com `STORAGE_BACKEND=redis`
- ✅ Doc inline em `IStorage.ts` referencia ADR-0008a

---

### F-S02 — libsodium token encryption helper

**User story:**
> Como **dev backend (Dex)**, eu quero **helpers `sealEncrypt`/`sealDecrypt` baseados em libsodium sealed box**, pra que **tokens Hostinger + WP admin passwords sejam criptografados antes de gravar no Redis** (sem Vault disponível no MVP, sem expor plaintext no `redis-cli`).

**Acceptance Criteria:**

- AC-1 — Módulo `tracking-api/src/lib/storage/crypto.ts` expõe `sealEncrypt(plaintext, publicKey): Promise<string>` e `sealDecrypt(cipher, publicKey, secretKey): Promise<string>`.
- AC-2 — Implementação usa `libsodium-wrappers` npm package (mantido, battle-tested).
- AC-3 — Env vars novos no `tracking-api`: `STORAGE_ENCRYPTION_PUBLIC_KEY` + `STORAGE_ENCRYPTION_SECRET_KEY` (ambos base64, 32 bytes).
- AC-4 — Script utilitário `scripts/generate-libsodium-keypair.ts` gera novo par via `crypto_box_keypair()` e imprime base64 — Diego roda 1× e cola no Easypanel Env tab.
- AC-5 — Roundtrip test: `sealDecrypt(sealEncrypt('foo', pub), pub, sec) === 'foo'` passa em vitest.
- AC-6 — Decrypt com chave errada **rejeita** (não retorna plaintext silencioso) — sealed box NaCl semantics.
- AC-7 — Documentação inline cita ADR-0008a §3.2 + nota de migração futura pra Vault (Onda 1.5).

**Tech notes:**
- Referência: **ADR-0008a §3.2 (implementação) + §3.3 (migração futura)**.
- LoC estimado: ~80 (crypto.ts + script generator + tests).
- Interface `EncryptCryptoLocal` parametrizada permite swap-in `EncryptCryptoVault` no Onda 1.5 sem tocar callers.

**Dependências:** none (paralela com F-S01).

**Story points:** **2**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Unit tests roundtrip passam
- ✅ Script generator imprime keypair válido base64 32 bytes
- ✅ Diego gerou keypair + colou em Easypanel Env tab (Validation Checklist ADR-0008a §8)
- ✅ Smoke: `sealEncrypt('token-test', env.PUBLIC_KEY)` no `tracking-api` produz string base64 não-vazia
- ✅ Doc inline referencia ADR-0008a

---

### F-S03 — Provider adapter interface IHostingProvider

**User story:**
> Como **dev backend (Dex)**, eu quero **uma interface `IHostingProvider` definida + factory `getProvider()`**, pra que **endpoints de install dependam de abstração (não de Hostinger MCP específico)** — Onda 2 pluga `WPRestAdapter` sem refactor.

**Acceptance Criteria:**

- AC-1 — Interface `IHostingProvider` em `tracking-api/src/lib/providers/IHostingProvider.ts` declara: `listSites(): Promise<Site[]>`, `verifyDomain(domain): Promise<boolean>`, `deployPlugin(opts): Promise<DeployResult>`, `pingToken(): Promise<boolean>`.
- AC-2 — Types `Site`, `DeployPluginOpts`, `DeployResult` definidos no mesmo arquivo (ou `types.ts` adjacente).
- AC-3 — Factory `tracking-api/src/lib/providers/index.ts` exporta `getProvider(type: 'hostinger', credentials): IHostingProvider` — retorna instância de adapter por tipo.
- AC-4 — Stub `HostingerAdapter` em `tracking-api/src/lib/providers/HostingerAdapter.ts` implementa interface com **TODO comments** em cada método (implementação completa em F-S04).
- AC-5 — Unit test stub: factory `getProvider('hostinger', {...})` retorna instance que satisfaz interface (typecheck + runtime `instanceof` check).
- AC-6 — `getProvider('wp_rest', ...)` lança erro `"Provider 'wp_rest' is Onda 2 — not implemented in MVP F"` (documenta extension point sem implementar).

**Tech notes:**
- Referência: **ADR-0008 §3.3 (provider adapter pattern)**.
- LoC estimado: ~120 (interface + types + factory + stub + unit tests).
- Esse pattern já é o canônico no ERP (ADR-0011 Integration Bridge) — Dex pode espelhar arquitetura.

**Dependências:** none (paralela com F-S01, F-S02).

**Story points:** **2**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ TypeScript compila sem erros
- ✅ Unit tests passam
- ✅ Code review (auto-review)
- ✅ Diff mostra clear separation: interface arquivo / factory arquivo / adapter stub arquivo
- ✅ Doc inline em `IHostingProvider.ts` cita ADR-0008 §3.3

---

## 3. Stories — Sprint 1 (Backend core, sequencial)

### F-S04 — HostingerAdapter (impl completa via MCP)

**User story:**
> Como **dev backend (Dex)**, eu quero **`HostingerAdapter` totalmente implementado** invocando o Hostinger MCP server (`mcp__hostinger__*` primitives), pra que **endpoints `/api/sites` + `/api/installations/:id/deploy` deleguem operações reais ao provider sem conhecer detalhes do MCP**.

**Acceptance Criteria:**

- AC-1 — `HostingerAdapter.listSites()` chama `mcp__hostinger__hosting_listWebsitesV1` (ou equivalente REST direto via fetch se MCP indisponível) — retorna `Site[]` normalizado (domain, wp_version detectado, php_version, ttfb_ms se disponível).
- AC-2 — `HostingerAdapter.verifyDomain(domain)` retorna `true` se domain aparece em `listSites()` resultado; `false` caso contrário.
- AC-3 — `HostingerAdapter.deployPlugin(opts)` chama `mcp__hostinger__hosting_deployWordpressPlugin` com payload `{ domain, slug, pluginPath }` per ADR-0008 §3.1; retorna `DeployResult` `{ status, summary, uploadDirName }`.
- AC-4 — `HostingerAdapter.pingToken()` chama `listSites()` com `page=1 per_page=1` — retorna `true` se 200, `false` se 401 (token expirado/revogado). Outros erros (5xx, network) propagam.
- AC-5 — Retry policy aplicada per ADR-0008 §3.9: `withRetry<T>` wrapper em erros transitórios (5xx + ECONNRESET) com backoff `[1s, 2s, 4s]`; 4xx fail-fast.
- AC-6 — Audit log `appendAudit` invocado em cada retry com `payload.retry_attempt = N`.
- AC-7 — Unit tests mockam MCP responses: happy path, 401 token expired, 5xx retry exhausted, 4xx fail-fast.

**Tech notes:**
- Referências: **ADR-0008 §3.1 (descoberta MCP semantics) + §3.9 (retry) + §3.3 (adapter pattern)**.
- LoC estimado: ~250 (impl + retry wrapper + unit tests com MCP mock).
- **Caveat crítico:** MCP `deployWordpressPlugin` adiciona random suffix em `uploadDirName` — idempotência mora em `gtm:install:by_site:*` (F-S01 AC-4), NÃO no filesystem.

**Dependências:** **blockedBy F-S01** (storage pra appendAudit) **+ F-S03** (interface).

**Story points:** **5**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Unit tests passam (incl. retry scenarios)
- ✅ Code review
- ✅ Smoke local: chamada `listSites()` real com token Diego retorna ≥1 site
- ✅ Deploy staging Easypanel KV8
- ✅ Audit log linha criada em Redis após smoke call

---

### F-S05 — Endpoints Hono (8 rotas API)

**User story:**
> Como **dev backend (Dex)**, eu quero **8 endpoints Hono REST implementados em `tracking-api/src/routes/`**, pra que **o frontend Vite SPA consiga criar/listar/atualizar hosting accounts + sites + installations via HTTP padrão** (Bearer JWT do Supabase auth).

**Acceptance Criteria:**

- AC-1 — `POST /api/hosting-accounts` aceita body `{ provider, token, label, wp_admin_password? }` — chama `sealEncrypt` (F-S02) + `storage.createAccount` (F-S01) + valida token via `provider.pingToken()` (F-S04). Retorna `{ id, status: 'connected' }` ou 401 se token inválido.
- AC-2 — `GET /api/hosting-accounts` lista accounts do tenant atual (Mentoria hardcoded MVP). Não retorna `token_encrypted` no JSON.
- AC-3 — `DELETE /api/hosting-accounts/:id` remove account (cascade audit log preservado per ADR-0008a §2.3 — keys `gtm:audit:*` independentes).
- AC-4 — `GET /api/sites` retorna lista merged: `provider.listSites()` + lookup em `storage.getInstallationBySite()` por domain — campos `{ domain, wp_version, php_version, ttfb_ms, status, brand_slug, container_id, last_install_at }`.
- AC-5 — `POST /api/installations` body `{ hosting_account_id, site_domain, brand_slug }` cria draft (status='draft') via `storage.createInstallation`. Lê `gtm_container_id` de `core.schools` por brand_slug (ainda existe esse table per CLAUDE.md "Brands rastreadas" — backend faz query SELECT). Snapshot grava em `gtm_installations.gtm_container_id`.
- AC-6 — `POST /api/installations/:id/deploy` adquire `storage.acquireLock(installation_id, 60)` — retorna 409 Conflict se outro deploy concurrent. Se OK, retorna `{ job_id, sse_url: '/api/installations/:id/events' }` 202 + dispara deploy async (worker pattern: setImmediate ou worker_threads).
- AC-7 — `GET /api/installations/:id` retorna status atual + last validation result. Idempotente. UI polling endpoint.
- AC-8 — `POST /api/installations/:id/revalidate` re-roda validador (F-S06) sem reinstalar. Atualiza `last_validation_at` + `last_validation_result`.
- AC-9 — `DELETE /api/installations/:id` marca `status='uninstalled'` (Should — actual WP cleanup é Onda 1.5 Story 8 ADR-0008).
- AC-10 — Todos endpoints retornam JSON consistente: `{ data?: T, error?: { code, message, request_id } }` — request_id pra correlacionar com Docker logs.
- AC-11 — Auth middleware: JWT Bearer Supabase obrigatório em todos endpoints; 401 se ausente/inválido.

**Tech notes:**
- Referências: **ADR-0008 §6 Story 3 (endpoints) + UX §10.5 (contract canônico)**.
- LoC estimado: ~600 (8 routes + Zod validation + auth middleware + error handling).
- Hono routing pattern já existe em `tracking-api/src/routes/` — copiar estrutura `webhooks.ts` ou similar.

**Dependências:** **blockedBy F-S01, F-S02, F-S03, F-S04** (precisa storage + crypto + provider).

**Story points:** **8**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ TypeScript compila
- ✅ Unit tests por endpoint (Zod schema validation + happy path + error cases)
- ✅ Integration test: criar account → listar sites → criar installation → deploy mock → status final
- ✅ Code review
- ✅ Deploy staging — curl smoke todos 8 endpoints retornando JSON válido
- ✅ Doc OpenAPI inline (Hono `describeRoute()` ou manual `docs/api-spec.md`)

---

### F-S06 — Validador pós-deploy 2-stage (HEAD+GET)

**User story:**
> Como **dev backend (Dex)**, eu quero **função `validate(domain, expectedContainerId)` implementando o validador 2-stage**, pra que **deploys confirmem dataLayer presence + container ID match no DOM** (não só HTTP 200) — detecta drift cedo.

**Acceptance Criteria:**

- AC-1 — Função `validate(domain, expectedContainerId): Promise<ValidationResult>` em `tracking-api/src/lib/validator.ts`.
- AC-2 — Stage 1 HEAD: `fetch(${domain}, { method: 'HEAD', timeout: 5000 })` — se status não-2xx, retorna `{ passed: false, stage: 'head', reason }`.
- AC-3 — Stage 2 Full GET: `fetch(${domain})` + `.text()` body. Regex check:
  - `containerMatch`: `/GTM-[A-Z0-9]{6,8}/` matches algum lugar no HTML
  - `expectedMatch`: HTML inclui `expectedContainerId` literal
  - `datalayerMatch`: `/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/` OR `/dataLayer\s*=\s*\[/` matches
- AC-4 — Retorno: `{ passed: containerMatch && expectedMatch && datalayerMatch, stage: 'full', details: { ... } }`.
- AC-5 — Timeout total ≤10s (5s HEAD + 5s GET). Se exceder, retorna `{ passed: false, reason: 'timeout' }`.
- AC-6 — Unit tests com `nock` ou `msw` mockam respostas HTML:
  - Site OK (datalayer + container correto) → passed=true
  - Site sem dataLayer → passed=false, details.datalayerMatch=false
  - Site com container errado → passed=false, details.expectedMatch=false
  - Site offline (HEAD 503) → passed=false, stage='head'
  - Timeout → passed=false, reason='timeout'

**Tech notes:**
- Referência: **ADR-0008 §3.6 (implementação completa pseudo-código)**.
- LoC estimado: ~120 (validator + types + unit tests com mocks).
- Playwright variant é **Onda 1.5 Should** (não MVP F).
- Regex robustness: testar contra GTM4WP output real (HTML de 1 site Mentoria pode servir como fixture).

**Dependências:** **blockedBy F-S05** (precisa endpoint `/revalidate` chamar essa função).

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Unit tests passam (5 cenários AC-6)
- ✅ Smoke: chamar `validate('colegiomentoria.com.br', 'GTM-5J587HS3')` retorna `passed=true` em prod
- ✅ Code review
- ✅ Doc inline cita ADR-0008 §3.6

---

### F-S07 — Audit log + safeAuditPayload helper

**User story:**
> Como **dev backend (Dex)**, eu quero **helper `safeAuditPayload(raw)` sanitizar payloads antes de gravar em `gtm:audit:*`**, pra que **logs nunca incluam tokens / passwords / response bodies brutos** (LGPD-safe by default).

**Acceptance Criteria:**

- AC-1 — Função `safeAuditPayload(raw): SafePayload` em `tracking-api/src/lib/audit.ts`.
- AC-2 — Whitelist explícita de keys: `site_domain, status_code, timing_ms, file_count, upload_dir_name, error_summary (≤500 chars)`.
- AC-3 — Blacklist hard: keys `token, password, secret, bearer, authorization, api_key` **rejeitadas silenciosamente** (não vazam mesmo se chamador errar).
- AC-4 — `error_summary` truncado a 500 chars via `.slice(0, 500)`.
- AC-5 — Wrapper `appendAuditWithSanitization(input)` faz `storage.appendAudit({ ...input, payload: safeAuditPayload(input.rawPayload) })` — endpoints/adapter chamam esse, NUNCA `storage.appendAudit` direto.
- AC-6 — Vitest tests:
  - Whitelist pass-through: `{ site_domain: 'x.com', status_code: 200 }` → payload preserva ambos
  - Blacklist reject: `{ token: 'abc', site_domain: 'x.com' }` → payload tem apenas `site_domain`
  - Error truncate: `error_summary` de 1000 chars vira 500 chars
  - Nested object: `{ raw: { hostinger_token: 'abc' } }` → blacklist recursivo (token nunca aparece em qualquer nível)

**Tech notes:**
- Referência: **ADR-0008 §3.7 (LGPD policy) + ADR-0008a §2.4 (interface InstallationAudit)**.
- LoC estimado: ~80 (helper + tests).
- Pattern: já existe em `tracking-api/src/lib/safeLog.ts` pra Webhook logs — Dex pode ler e adaptar.
- Validation no Onda 1.5 vira pgTAP test contra `tracking.installation_audit.payload` (ADR-0008 §3.7).

**Dependências:** **blockedBy F-S01** (precisa `storage.appendAudit`).

**Story points:** **2**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Vitest tests passam (4 cenários AC-6)
- ✅ Code review
- ✅ Smoke: deploy real (F-S04) produz audit linhas em `gtm:audit:*` sem keys sensíveis (manual check via `redis-cli LRANGE gtm:audit:<id> 0 -1`)
- ✅ Doc inline cita ADR-0008 §3.7

---

### F-S08 — Backup gtm:* keys no MinIO cron 03h

**User story:**
> Como **ops (Felix)**, eu quero **estender o compose `tracking-backup` pra incluir snapshot Redis das keys `gtm:*` no MinIO daily**, pra que **audit log + installations sobrevivam a desastre no volume Redis** (LGPD-relevant, retenção 30d alinhada pg backup).

**Acceptance Criteria:**

- AC-1 — Arquivo `infra/easypanel/tracking-backup-compose.yml` adiciona service `redis-snapshot` ou estende existente.
- AC-2 — Cron 03h BRT (alinhado pg backup) executa: `redis-cli --rdb /tmp/gtm-snapshot.rdb` filtrado por prefix `gtm:*` (via `redis-cli --scan --pattern 'gtm:*' | xargs redis-cli MIGRATE` ou similar; alternativa: BGSAVE full RDB + script extract keys gtm:*).
- AC-3 — Upload do `gtm-snapshot.rdb` pro MinIO bucket `tracking-backups/redis/gtm-snapshot-<YYYY-MM-DD>.rdb`.
- AC-4 — Retention policy: deletar snapshots >30 dias (mesma policy pg backup existente).
- AC-5 — Healthcheck pós-snapshot: verificar size do RDB > 100 bytes (sanity check — Redis vazio retorna ~80 bytes header).
- AC-6 — Doc atualizada em `docs/runbook-ops.md` (criar se não existir) com seção "Restore gtm:* snapshot" + comando `redis-cli --pipe < gtm-snapshot.rdb` exemplo.
- AC-7 — Smoke: rodar compose manualmente uma vez + confirmar arquivo aparece no MinIO bucket.

**Tech notes:**
- Referência: **ADR-0008a §6.1 R7 (mitigação backup mock storage)**.
- LoC estimado: ~50 bash + 30 yaml.
- Reuso compose `tracking-backup` existente (Felix conhece bem — fez D4 BusyBox awk fix em 24/05 per CLAUDE.md).
- Cron pode ser n8n WF ou systemd timer ou container cron — Felix decide qual mais simples.

**Dependências:** **blockedBy F-S01** (precisa keys `gtm:*` existindo pra backupar). **Soft dep:** F-S04+F-S07 produzindo dados reais pra validar size > 100 bytes (mas pode rodar com keys mock).

**Story points:** **3**

**Owner sugerido:** **orchestrator** (Felix executa, Dex revisa)

**Definition of Done:**
- ✅ Compose modificado committed
- ✅ Smoke manual: 1 backup completo gerado + uploaded MinIO
- ✅ Restore dry-run: download snapshot → `redis-cli --pipe` em Redis temp container → keys `gtm:*` aparecem
- ✅ Doc runbook criada/atualizada
- ✅ Cron schedule confirmado (03h BRT) sem conflito com pg backup

---

## 4. Stories — Sprint 2 (Frontend Vite SPA)

### F-S09 — 8 components novos Vite + reuse 7 existentes

**User story:**
> Como **dev frontend (Dex)**, eu quero **8 novos componentes React implementados** (SiteCard, BrandSelect, InstallProgressModal, InstallSuccessState, InstallFailureState, TokenInput, HostingerHelpAccordion, AuditLogEntry), pra que **as 4 rotas `/sites/*` tenham building blocks reutilizáveis** seguindo design system existente.

**Acceptance Criteria:**

- AC-1 — Component `<SiteCard />` em `src/components/sites/SiteCard.tsx`: props `{ site, onInstall, onRevalidate, onReinstall, onViewDetails }`. Renderiza per UX §3 Tela 3 (header + metadata + brand select + status pill + actions). Responsive (desktop horizontal / mobile stack vertical).
- AC-2 — Component `<BrandSelect />` em `src/components/sites/BrandSelect.tsx`: dropdown com 4 brands hardcoded (`mentoria`, `mentoria-app`, `zerohum`, `ifrn`). Props `{ value, onChange, disabled? }`. A11y: `<select>` nativo + `<label>` oculto-mas-presente.
- AC-3 — Component `<InstallProgressModal />` em `src/components/sites/InstallProgressModal.tsx`: full-screen modal não-fechável (Esc disabled durante install). 4 passos com estados (✓ verde / ⟳ azul animado / ◯ cinza). Progress bar. Tempo gasto por passo. Per UX §3 Tela 5.
- AC-4 — Component `<InstallSuccessState />` em `src/components/sites/InstallSuccessState.tsx`: checkmark animado scale 0→1.2→1.0. Checklist 4 itens. 4 CTAs (Abrir site / Ver audit / Instalar outro / Voltar). Per UX §3 Tela 6.
- AC-5 — Component `<InstallFailureState />` em `src/components/sites/InstallFailureState.tsx`: X vermelho. Detalhe técnico em `<pre>` mono. ID do erro copiável. Lista numerada "O que tentar". 4 CTAs contextuais. Per UX §3 Tela 7.
- AC-6 — Component `<TokenInput />` em `src/components/sites/TokenInput.tsx`: input `type='password'` default + eye toggle Phosphor icon. Props `{ value, onChange, onValidate, error }`. A11y: `aria-pressed` no toggle. Per UX §3 Tela 2.
- AC-7 — Component `<HostingerHelpAccordion />` em `src/components/sites/HostingerHelpAccordion.tsx`: accordion com 4 passos pra gerar token. Default aberto na primeira visita. Link "Abrir hPanel ↗" `target=_blank rel=noopener`. Per UX §3 Tela 2.
- AC-8 — Component `<AuditLogEntry />` em `src/components/sites/AuditLogEntry.tsx`: 1 row de log (timestamp + action + status pill + payload abridged + expand toggle pra payload completo).
- AC-9 — Components reusam: `<Button />`, `<EmptyState />`, `<StatusBadge />`/`<DotPill />`, `<Toast />`+`useToast`, `<ConfirmDialog />`+`useConfirm`, `useFocusTrap`, `<KpiCard />` (opcional header lista) — todos do design-system-extract existente.
- AC-10 — Storybook stories (se Storybook já existe no `tracking-app`) ou exemplos em `src/pages/__dev__/SiteCardDemo.tsx` mostram cada estado de cada component.

**Tech notes:**
- Referência principal: **UX §3 (7 telas) + §10.2 (componentes a criar) + §10.1 (reuse)**.
- LoC estimado: ~1200 (8 components × ~150 LoC + small reuses).
- Reduce motion respeitado em todos (UX §5.5).
- Touch targets ≥44px mobile (UX §5.4).
- Design tokens importados do `tracking-app/src/styles/tokens.css` (verde Mentoria `#16DF6F` é FIXO per CLAUDE.md).

**Dependências:** **soft dep F-S05** (endpoints) pra integração real; pode começar com mock data + Storybook isolado.

**Story points:** **5**

**Owner sugerido:** **dex** (uma review opcional pré-merge)

**Definition of Done:**
- ✅ TypeScript compila
- ✅ Lint passa (eslint + prettier)
- ✅ Lighthouse a11y ≥95 por component (axe-core dev mode)
- ✅ Code review
- ✅ Visual smoke em dev local (`pnpm dev` + browser) — cada component renderiza sem warning
- ✅ Doc inline em cada component cita UX section relevante

---

### F-S10 — 4 rotas Vite SPA + roteamento

**User story:**
> Como **dev frontend (Dex)**, eu quero **4 rotas Vite (`/sites`, `/sites/connect`, `/sites/:id`, `/sites/:id/logs`) com pages compostas dos components F-S09**, pra que **Diego navegue pelo flow completo** via menu sidebar.

**Acceptance Criteria:**

- AC-1 — Rota `/sites` → `<SitesListPage />` em `src/pages/SitesListPage.tsx`. Empty state (sem hosting accounts) per UX §3 Tela 1. Lista de cards `<SiteCard />` per UX §3 Tela 3. Header com filtros + refresh + "Conectar conta".
- AC-2 — Rota `/sites/connect` → `<ConnectHostingerPage />` em `src/pages/ConnectHostingerPage.tsx`. Form per UX §3 Tela 2: accordion + apelido + `<TokenInput />` + CTAs "Validar e conectar" / "Cancelar".
- AC-3 — Rota `/sites/:siteId` → `<SiteDetailPage />` em `src/pages/SiteDetailPage.tsx`. Tabs (Overview / Audit Log / Settings) — Overview mostra metadata + último install + revalidar/reinstalar/desinstalar; Audit Log usa `<AuditLogEntry />` em loop; Settings reserved (Onda 1.5).
- AC-4 — Rota `/sites/:siteId/logs` → `<SiteAuditLogPage />` standalone (mesma view do tab mas full-page pra bookmark/share).
- AC-5 — Entrada "Sites Conectados" adicionada ao `<Sidebar />` componente do AppShell, entre Dashboard e Configurações per UX §2.1. Badge NEW primeiros 14 dias (feature flag ou simples date check).
- AC-6 — Roteamento usa React Router v6+ (já no `tracking-app` ou instalar). Lazy load das pages via `React.lazy()`.
- AC-7 — Auth guard: rotas `/sites/*` requerem login Supabase auth (redirect `/login` se não autenticado).
- AC-8 — Layout `AppShell` (sidebar + topbar) consistente em todas rotas — reuso do layout existente.

**Tech notes:**
- Referência: **UX §2.2 (hierarquia rotas) + §10.4 (rotas Vite SPA)**.
- LoC estimado: ~800 (4 pages + sidebar update + router config).
- Padrão page composition: pages compõem components F-S09 + hooks F-S11 — NÃO duplicar lógica.

**Dependências:** **blockedBy F-S09** (components) **+ F-S11** (hooks pra data fetching).

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ TypeScript compila
- ✅ Lint passa
- ✅ Smoke local: navegar 4 rotas sem console warning
- ✅ Auth guard funciona (logout → redirect login → login → redirect sites)
- ✅ Sidebar entrada visível com badge NEW
- ✅ Lighthouse a11y ≥95 por page
- ✅ Mobile responsive testado em 375px (DevTools)

---

### F-S11 — 4 hooks de data (useSites, useHostingerAccount, useInstallTracking, useAuditLog)

**User story:**
> Como **dev frontend (Dex)**, eu quero **4 custom hooks encapsulando data fetching + state management** dos endpoints F-S05, pra que **pages F-S10 não duplicarem lógica de loading/error/cache** (DRY + testabilidade).

**Acceptance Criteria:**

- AC-1 — `useSites()` em `src/hooks/useSites.ts`: retorna `{ sites, isLoading, error, refresh }`. Fetch `GET /api/sites`. Cache 60s. `refresh()` força refetch.
- AC-2 — `useHostingerAccount()` em `src/hooks/useHostingerAccount.ts`: retorna `{ account, isConnected, connect, disconnect }`. `connect(token, label, wpAdminPass?)` chama `POST /api/hosting-accounts`. `disconnect()` chama `DELETE /api/hosting-accounts/:id`.
- AC-3 — `useInstallTracking(siteId)` em `src/hooks/useInstallTracking.ts`: retorna `{ install, progress, status, result, start }`. `start(brandSlug)` chama `POST /api/installations/:id/deploy` + abre SSE pro `/api/installations/:id/events` pra progress real-time. F-S12 implementa SSE.
- AC-4 — `useAuditLog(siteId?)` em `src/hooks/useAuditLog.ts`: retorna `{ entries, isLoading, refresh }`. Fetch `GET /api/sites/:id/audit-log` (filtrado) ou `/api/audit-log` (global). Pagination cursor-based (Onda 1.5; MVP carrega últimas 50).
- AC-5 — Stack data fetching: pode usar `@tanstack/react-query` (se já no `tracking-app`) ou fetch nativo + `useEffect` + `useState`. Decisão fica com Dex baseado em deps existentes.
- AC-6 — Error handling: hooks retornam `error: Error | null` com mensagem traduzida PT-BR (mapeada de UX §4.6).
- AC-7 — Vitest tests: mockam fetch + verificam states `idle → loading → success` / `idle → loading → error`. Refresh re-fetcha.

**Tech notes:**
- Referência: **UX §10.3 (hooks a criar)**.
- LoC estimado: ~400 (4 hooks + tests).
- React Query é fortemente recomendado se `tracking-app` já tem (gerencia cache + retry + stale-while-revalidate gratuito).

**Dependências:** **blockedBy F-S05** (endpoints existentes). Pode rodar paralelo com F-S09 (components) usando mock fetch.

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Vitest tests passam por hook
- ✅ TypeScript compila
- ✅ Code review
- ✅ Smoke local: useSites integrado no SitesListPage chama API real (staging) e renderiza
- ✅ Error states testados manualmente (desligar backend → ver `error` mensagem PT-BR)

---

### F-S12 — SSE streaming pra progress modal real-time

**User story:**
> Como **dev fullstack (Dex)**, eu quero **endpoint SSE `GET /api/installations/:id/events` no backend + cliente EventSource no frontend hook `useInstallTracking`**, pra que **o modal de progresso (F-S09 InstallProgressModal) atualize passo-a-passo em tempo real** (não polling).

**Acceptance Criteria:**

- AC-1 — Backend endpoint `GET /api/installations/:id/events` em `tracking-api/src/routes/installations.ts` retorna `Content-Type: text/event-stream`.
- AC-2 — Eventos publicados durante deploy assíncrono (F-S05 AC-6 worker): cada step transition (`upload_started`, `upload_complete`, `activation_started`, `activation_complete`, `validation_passed | validation_failed`) emite SSE event JSON `{ step: string, status: 'in_progress' | 'done' | 'failed', timing_ms?: number, error?: string }`.
- AC-3 — Mecânica pub-sub: worker grava em Redis LIST `gtm:events:<installation_id>` via `LPUSH` (TTL 5min). SSE endpoint faz `BRPOP` ou `XREAD` em loop com timeout — escolha Dex (Redis Streams é mais robusto, LPUSH+BRPOP é mais simples).
- AC-4 — Heartbeat ping cada 15s pra evitar timeout proxy Easypanel.
- AC-5 — Cliente `EventSource` no hook `useInstallTracking` (F-S11) subscribe quando `start()` é chamado; unsubscribe em cleanup. Updates de `progress` triggam re-render do `<InstallProgressModal />`.
- AC-6 — Fallback polling: se EventSource error (navegador antigo, proxy block), hook degrada pra `GET /api/installations/:id` a cada 2s.
- AC-7 — Vitest tests: mock SSE server + verifica que cada evento atualiza `progress` corretamente. Fallback polling testado com EventSource desabilitado.

**Tech notes:**
- Referências: **UX §3 Tela 5 (progress real-time) + UX §10.5 sugestão Dex (SSE)**.
- LoC estimado: ~300 (endpoint SSE + worker pub + client EventSource + fallback).
- Library decision: `hono-sse` plugin OU implementação manual com `c.body(streamingReader)`. River vai perguntar (open question §7).
- Easypanel Caddy/Traefik proxy: confirmar buffering off pra SSE (Felix valida em staging).

**Dependências:** **blockedBy F-S05** (endpoint deploy precisa publicar eventos) **+ F-S09** (modal consome).

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ TypeScript compila
- ✅ Vitest tests passam
- ✅ Smoke E2E manual: trigger install real em staging → modal atualiza step-by-step sem refresh
- ✅ Heartbeat ping observado em DevTools Network tab cada 15s
- ✅ Fallback polling validado (DevTools → desabilitar EventSource → modal continua via polling)
- ✅ Doc inline cita ADR-0008 §3 + UX §3 Tela 5

---

## 5. Stories — Sprint 3 (Plugin + smoke + docs)

### F-S13 — Build pipeline plugin híbrido (GTM4WP vendored + bootstrap PHP)

**User story:**
> Como **dev backend (Dex)**, eu quero **pipeline de build do plugin híbrido (`gtm4wp` upstream vendored + `mentoria-gtm-bootstrap.php` custom + `mentoria-config.json` per-deploy) produzindo directory ready pra Hostinger MCP upload**, pra que **endpoint `/deploy` (F-S05) tenha plugin files prontos sem hops manuais**.

**Acceptance Criteria:**

- AC-1 — Diretório `tracking-api/plugins/gtm4wp-mentoria/` contém:
  - `gtm4wp/` — GTM4WP upstream vendored (pinned version, e.g. v1.18). Via git submodule OU npm package OU `scripts/fetch-gtm4wp.sh` baixa de GitHub release tag.
  - `mentoria-gtm-bootstrap.php` — bootstrap custom per ADR-0008 §3.2 Opção C (~50 LoC PHP).
  - `mentoria-config.json.template` — template substituído per-deploy.
- AC-2 — Script `tracking-api/scripts/build-plugin.ts` (ou shell) lê `mentoria-config.json.template` + injeta `{ container_id, brand_slug, plugin_version }` do install request → produz `mentoria-config.json` final.
- AC-3 — Bootstrap PHP usa `register_activation_hook` pra ler `mentoria-config.json` + `update_option('gtm4wp-options', { 'gtm-code': container_id, 'consent-mode-v2': true, ... })`.
- AC-4 — Plugin metadata em `mentoria-gtm-bootstrap.php` header: `Plugin Name: GTM4WP Mentoria Bootstrap`, `Depends: GTM4WP`, `Version: 1.0.0`.
- AC-5 — Docker image `tracking-api` inclui plugin files (`COPY plugins/ /app/plugins/`). Size delta ≤10MB (per ADR-0008 §4.2).
- AC-6 — Endpoint `POST /api/installations/:id/deploy` (F-S05) chama `buildPlugin(installation)` → produz path temporário → passa pro `provider.deployPlugin({ pluginPath, ... })` (F-S04).
- AC-7 — Cleanup: path temporário deletado após deploy (success ou fail).
- AC-8 — Unit test: `buildPlugin` com `{ container_id: 'GTM-WVWQVMP', brand_slug: 'zerohum' }` produz directory válido + `mentoria-config.json` content correto.

**Tech notes:**
- Referência: **ADR-0008 §3.2 Opção C (decisão final plugin híbrido)**.
- LoC estimado: ~200 (build script + bootstrap PHP + tests).
- GTM4WP licença: GPL-2.0 — fork OK.
- Pinning version: começar com gtm4wp latest stable (~v1.18 em 25/05). Bump quando upstream lançar security patch.

**Dependências:** **blockedBy F-S04** (HostingerAdapter precisa receber pluginPath válido) **+ F-S05** (deploy endpoint chama buildPlugin).

**Story points:** **3**

**Owner sugerido:** **dex**

**Definition of Done:**
- ✅ Docker image build inclui plugin files (`docker images` mostra tamanho)
- ✅ Unit test buildPlugin passa
- ✅ Smoke local: `buildPlugin({ ... })` produz directory inspecionável manualmente (PHP + JSON corretos)
- ✅ Smoke E2E (parte de F-S14): plugin uploaded ativa GTM4WP em site test
- ✅ Doc inline cita ADR-0008 §3.2

---

### F-S14 — Smoke E2E manual nos 4 brands Mentoria

**User story:**
> Como **PO (Diego/Nova)**, eu quero **smoke test E2E executado nos 4 brands próprios (mentoria, mentoria-app, zerohum, ifrn)** seguindo fluxo completo (conectar Hostinger → listar sites → instalar tracking → validar dataLayer), pra que **a feature seja **provada** antes de marcar MVP-done** (não só "passa testes unitários").

**Acceptance Criteria:**

- AC-1 — Diego conecta Hostinger account real via UI (`/sites/connect`) — token persistido encrypted Redis.
- AC-2 — UI `/sites` lista todos sites Hostinger Diego.
- AC-3 — Para cada um dos 4 brands (zerohum primeiro per PRD §6.1 sugestão — não-crítico antes de tocar mentoria.com.br prod):
  - Atribuir brand_slug correto via dropdown
  - Clicar "Instalar tracking" → modal confirm aparece com container_id correto
  - Confirmar → modal progress aparece com 4 steps
  - Todos steps completam status=`done`
  - Modal success aparece com checklist 4 itens verdes + tempo total
  - Audit log mostra evento `installation_completed`
- AC-4 — Pós-install em cada brand: Diego abre o site real em nova aba → F12 → confere `window.dataLayer` definido + script tag GTM com container correto.
- AC-5 — Métrica tempo total (modal success): <2min p95 (per PRD §5.1 success metric).
- AC-6 — Drift detect smoke: Diego desativa plugin manualmente via WP-admin em 1 site → clica "Revalidar" na UI → status muda pra `drift_detected` com explicação "dataLayer ausente".
- AC-7 — Reinstall smoke: Diego clica "Reinstalar" em site drift → install completa → status volta `installed`.
- AC-8 — Failure smoke (controlado): Diego revoga token Hostinger via hPanel → tenta install → modal failure aparece com ID erro copiável + sugestão "Reconectar Hostinger".
- AC-9 — Documentação dos resultados em `docs/smoke-f-mvp-results.md`: tabela 4 brands × passa/falha + screenshots dos modais + tempo medido.

**Tech notes:**
- Referência: **PRD §5.1 (success metrics MVP) + §6 (riscos a validar)**.
- Execução manual — não automatizada nessa story (Playwright E2E = Onda 1.5).
- **Recomendação ordem:** zerohum (baixo risco) → ifrn (médio) → mentoria-app (médio) → mentoria.com.br (alto, deixar por último).
- Se algum brand falhar: NÃO marcar story done — abrir bug + retornar para Sprint 1/2 fix.

**Dependências:** **blockedBy F-S13** (precisa plugin pronto) **+ F-S12** (modal progress real-time) **+ todos anteriores**. Esta é a story integradora.

**Story points:** **2**

**Owner sugerido:** **orchestrator** (Diego executa, Nova valida resultados, Quinn gate)

**Definition of Done:**
- ✅ 4/4 brands instalados com status `installed`
- ✅ Validação manual F12 dataLayer + container em todos 4
- ✅ Drift detect + reinstall smoke OK em 1 brand
- ✅ Failure smoke OK (token revoke + recovery)
- ✅ Tempo p95 <2min
- ✅ Documentação smoke results criada
- ✅ Quinn gate PASS (sem CONCERNS bloqueantes)

---

### F-S15 — Documentation runbook + troubleshooting

**User story:**
> Como **PO (Diego)**, eu quero **runbook ops + troubleshooting guide documentado**, pra que **eu (ou Claude futuro) consiga diagnosticar problemas sem ler todo o código** — Manifesto 22/05 "ficar bom" implica boa documentação operacional.

**Acceptance Criteria:**

- AC-1 — Arquivo `docs/runbook-auto-provisioner-gtm.md` criado contendo:
  - **Quick reference:** comandos comuns (verificar account status, listar installations, force revalidate, ver audit log)
  - **Troubleshooting matrix:** sintoma → causa provável → fix. Cobre erros UX §4.6 + edge cases.
  - **Redis state inspection:** comandos `redis-cli` pra inspecionar keys `gtm:*` (HGETALL account, LRANGE audit, SMEMBERS list).
  - **Backup/restore mock storage:** procedure full restore do MinIO snapshot (F-S08).
  - **Migração futura pra DB:** referência rápida ao ADR-0008a §4 (sem detalhar — link).
- AC-2 — Seção "Cenários comuns":
  - Token Hostinger expirado / revogado
  - Site não aparece em `/sites` (cache 60s, refresh manual)
  - Drift detectado falso-positivo (plugin de cache interferindo)
  - Install travado em `uploading` (lock release manual via `redis-cli DEL gtm:lock:install:<id>`)
- AC-3 — Seção "Manutenção periódica":
  - Bump GTM4WP version (steps: update vendored → bump `plugin_version` constant → rebuild Docker image → smoke retest 1 site)
  - Rotação libsodium keypair (steps: gerar novo par → migration script decrypt old + encrypt new → flip env vars → smoke)
- AC-4 — Atualizar `CLAUDE.md` adicionando bloco breve da feature F (1 paragraph: "Auto-Provisioner GTM live, 4 brands cobertos, mock Redis storage até ERP main estabilizar, runbook em docs/runbook-...md").
- AC-5 — Atualizar `docs/README.md` index adicionando link pra novo runbook.

**Tech notes:**
- Referência: cross-cutting — PRD + ADR-0008 + ADR-0008a + UX + smoke results F-S14.
- LoC estimado: ~300 markdown.
- Linguagem: PT-BR (consistente com docs Mentoria-Tracking).
- Format: usar mesma estrutura runbook ERP-Mentoria se existir; senão pattern markdown simples com sections H2.

**Dependências:** **blockedBy F-S14** (smoke results alimentam troubleshooting com cases reais).

**Story points:** **2**

**Owner sugerido:** **orchestrator** (Diego escreve OU delegar pra Claude futuro com context completo)

**Definition of Done:**
- ✅ Arquivo runbook criado e committed
- ✅ CLAUDE.md atualizada
- ✅ docs/README.md index atualizado
- ✅ Diego revisa + 1 cenário troubleshooting testado seguindo runbook (validates procedure works)
- ✅ Quinn gate PASS pra MVP completo

---

## 6. Resumo de dependências (gráfico)

```
Sprint 0 (paralelo):
  F-S01 ┐
  F-S02 ┼─── (3 stories paralelas, sem deps externas)
  F-S03 ┘

Sprint 1 (sequencial):
  F-S04 ── needs F-S01 + F-S03
  F-S05 ── needs F-S01 + F-S02 + F-S03 + F-S04
  F-S06 ── needs F-S05
  F-S07 ── needs F-S01
  F-S08 ── needs F-S01 (+ soft F-S04/F-S07)

Sprint 2 (parcialmente paralelo):
  F-S09 ── needs (soft) F-S05 — pode começar com mock
  F-S11 ── needs F-S05
  F-S10 ── needs F-S09 + F-S11
  F-S12 ── needs F-S05 + F-S09

Sprint 3 (sequencial):
  F-S13 ── needs F-S04 + F-S05
  F-S14 ── needs F-S13 + F-S12 (+ todos anteriores) ⚠️ STORY INTEGRADORA
  F-S15 ── needs F-S14
```

**Stories bloqueantes (gate de tudo):** F-S01, F-S02, F-S03 (Sprint 0). Sem elas, **nada** avança.

**Story integradora:** F-S14 — concentra risco. Se 1 dos 4 brands falhar smoke, ciclo volta pra Sprint 1/2.

---

## 7. Open questions pra River (próxima na cadeia)

River vai detalhar cada story (AC mais granulares, test plan, code structure). Antes de fazer isso, precisa decidir 5 convenções técnicas que aplicam transversalmente:

### Q1 — Naming convention dos endpoints Hono: REST vs RPC-style?

- **REST clássico:** `POST /api/hosting-accounts`, `GET /api/sites/:id`, `DELETE /api/installations/:id` (verbos HTTP + nouns).
- **RPC-style:** `POST /api/installations/deploy`, `POST /api/installations/revalidate`, `POST /api/sites/list` (todos POST + action verbs).
- **Trade-off:** REST mais idiomatic Hono/HTTP; RPC mais explícito quando action ≠ CRUD óbvio (deploy, revalidate, uninstall não mapeiam limpo em CRUD).

**Recomendação Nova:** Híbrido — CRUD vai REST (hosting-accounts, installations), actions vão sub-rotas POST (`/installations/:id/deploy`, `/installations/:id/revalidate`). UX §10.5 já segue esse pattern; River confirma + documenta.

### Q2 — Test framework: Vitest vs Jest vs `node:test`?

- **Vitest:** mais moderno, integra com Vite (já é build do tracking-app). Hot reload tests. Ecosystem ESM-first.
- **Jest:** padrão de fato, mature. Mais lento. CommonJS legacy issues com ESM.
- **node:test:** zero deps, Node 20+. Menos features (sem snapshot testing fluente, mock weaker).

**Recomendação Nova:** **Vitest** — já provável no `tracking-app` (Vite repo). Consistência mono-stack.

### Q3 — Error handling pattern: `throw` vs `Result<T, E>` type?

- **Throw:** idiomatic JS/TS. Stack trace gratuito. Fácil propagar via async/await.
- **Result type:** funcional. Type-safe (consumer SABE que pode falhar). Mais verbose.

**Recomendação Nova:** **Throw + classes erro customizadas** (`HostingerError`, `ValidationError`, `LockConflictError`). Hono middleware central captura e mapeia pra JSON `{ error: { code, message, request_id } }` (F-S05 AC-10). Simples e idiomatic.

### Q4 — SSE library: `hono-sse` plugin vs implementação manual `c.body(stream)`?

- **`hono-sse`:** plugin oficial. Helpers `c.streamSSE(handler)`. Heartbeat built-in (talvez).
- **Manual:** `c.body(streamReader)` + escrever Content-Type + format eventos manualmente. Mais código mas controle total.

**Recomendação Nova:** **`hono-sse`** se existe e é mantido. Senão manual mas com helper `src/lib/sse.ts` reutilizável. F-S12 AC-3 deixa Dex decidir entre `BRPOP` (LIST) ou `XREAD` (Streams) — River pergunta.

### Q5 — E2E test strategy F-S14: smoke manual definitivo ou Playwright já no MVP?

- **Manual:** Diego executa visualmente. Rápido pra MVP. Sem flakiness CI.
- **Playwright automated:** repeatable. Vira test suite pro CI futuro. Custo: ~4-6h setup + 1 test por brand (~30min cada).

**Recomendação Nova:** **Manual no MVP F (story F-S14 atual)**. Playwright fica como **F-S16 candidato Onda 1.5** (não criar story agora — adicionar ao backlog quando MVP fechar). Manifesto 22/05 — sem prazo pra Onda 1.5.

---

## 8. Considerações finais

### 8.1 Velocity vs Quality

Manifesto 22/05 vigente — não há pressão temporal. **Quinn gate por sprint** garante quality bar:
- **Pós-Sprint 0:** valida types/interfaces consistentes, factories funcionando, no breaking on import.
- **Pós-Sprint 1:** valida endpoints contract estável (consumers Frontend podem começar), audit LGPD-safe, retry funcional.
- **Pós-Sprint 2:** valida a11y AA, mobile responsive, error states cobertos.
- **Pós-Sprint 3:** smoke E2E real nos 4 brands + runbook completo.

### 8.2 Riscos remanescentes (carry-over PRD/ADR)

| Risco | Story que mitiga | Status |
|---|---|---|
| MCP `deployWordpressPlugin` falha em plano Hostinger shared sem permission | F-S04 (validar com Diego antes Sprint 1 fecha) | Aria reportou em ADR §4.4 |
| WP Admin password setup manual 1× por site | F-S05 AC-1 (`wp_admin_password?` opcional) | UX §3 Tela 2 já cobre |
| Redis volume restart perde state | F-S08 (backup MinIO) | ADR-0008a §6.1 R6 |
| GTM4WP option keys mudam em major bump | F-S13 (pin version) + F-S15 (runbook bump procedure) | ADR-0008 §3.2 ⚠ |

### 8.3 Anti-scope-creep guard

Pre-listando o que **NÃO** entra MVP F (referência rápida pra Dex/River durante implementation):

- ❌ Playwright validador (ADR-0008 §3.6 Should Onda 1.5)
- ❌ Cron diário revalidação (ADR-0008 §6 Story 7 Onda 1.5)
- ❌ Uninstall + cleanup orphan dirs (ADR-0008 §6 Story 8 Onda 1.5)
- ❌ OAuth Hostinger (PRD §3.4)
- ❌ Multi-tenant exposto (PRD §3.4)
- ❌ WP REST API generic adapter (PRD §3.4 — Onda 2)
- ❌ Migrations DB Supabase (ADR-0008a — postponed até ERP main estabilizar)
- ❌ Batch deploy multiplo (PRD §3.3 Could)
- ❌ Telegram notifications (PRD §3.3 Could)
- ❌ Email notifications (PRD §7)

Se algum desses surgir durante implementation: rejeitar + abrir backlog item separado pra Onda 1.5.

### 8.4 Próximos passos pós-Nova

1. **Diego revisa este doc** — valida quebra + estimativas + ordem
2. **River detalha cada story** — AC mais granulares, test plan por endpoint/component, code structure (~30min × 15 stories = ~7h River)
3. **Dex inicia Sprint 0** (3 paralelas: F-S01, F-S02, F-S03)
4. **Quinn gate pós Sprint 0** — bless paralelas funcionando antes de seguir
5. **Sprint 1 sequencial:** F-S04 → F-S05 → F-S06 → F-S07 → F-S08
6. **Sprint 2 parcial paralelo:** F-S09 + F-S11 começam com mock; F-S10 + F-S12 quando Sprint 1 fecha
7. **Sprint 3 final:** F-S13 → F-S14 (story integradora, Quinn gate apertado) → F-S15

**Sem prazo. 1 dia ou 100 anos. Não importa.** Manifesto 22/05.

---

**Fim das stories F MVP.** Total: **15 stories / 52 pontos / 4 sprints**. Status: Draft pra handoff River.
