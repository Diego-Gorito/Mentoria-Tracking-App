# Stories — Feature F (Auto-Provisioner GTM MVP) — Index & Status

**Detalhamento por:** River (Facilitator)
**Data:** 2026-05-25
**Modelo:** Opus 4.7 (1M context)
**Status pipeline AIOX:** Kai PRD → Aria ADR-0008 + ADR-0008a → Uma UX → Nova breakdown → **River details (este pacote)** → Dex implementa → Quinn gate → Felix deploy

---

## Índice das 15 stories

| # | Story | Sprint | Owner | Pts | Status |
|---|---|---|---|---|---|
| F-S01 | [Mock storage layer (Redis-backed IGtmStorage)](./F-S01.md) | 0 (Foundation) | dex | 3 | pending |
| F-S02 | [libsodium token encryption helper](./F-S02.md) | 0 (Foundation) | dex | 2 | pending |
| F-S03 | [Provider adapter interface IHostingProvider](./F-S03.md) | 0 (Foundation) | dex | 2 | pending |
| F-S04 | [HostingerAdapter (impl completa via MCP)](./F-S04.md) | 1 (Backend core) | dex | 5 | pending |
| F-S05 | [Endpoints Hono (8 rotas API)](./F-S05.md) | 1 (Backend core) | dex | 8 | pending |
| F-S06 | [Validador pós-deploy 2-stage (HEAD+GET)](./F-S06.md) | 1 (Backend core) | dex | 3 | pending |
| F-S07 | [Audit log + safeAuditPayload helper](./F-S07.md) | 1 (Backend core) | dex | 2 | pending |
| F-S08 | [Backup gtm:* keys no MinIO cron 03h](./F-S08.md) | 1 (Backend core) | orchestrator | 3 | pending |
| F-S09 | [8 components novos Vite + reuse 7](./F-S09.md) | 2 (Frontend) | dex | 5 | pending |
| F-S10 | [4 rotas Vite SPA + roteamento](./F-S10.md) | 2 (Frontend) | dex | 3 | pending |
| F-S11 | [4 hooks de data](./F-S11.md) | 2 (Frontend) | dex | 3 | pending |
| F-S12 | [SSE streaming progress modal real-time](./F-S12.md) | 2 (Frontend) | dex | 3 | pending |
| F-S13 | [Build pipeline plugin híbrido](./F-S13.md) | 3 (Plugin+smoke+docs) | dex | 3 | pending |
| F-S14 | [Smoke E2E manual nos 4 brands](./F-S14.md) | 3 (Plugin+smoke+docs) | orchestrator | 2 | pending |
| F-S15 | [Documentation runbook + troubleshooting](./F-S15.md) | 3 (Plugin+smoke+docs) | orchestrator | 2 | pending |

**Total:** 15 stories / 52 pts / 4 sprints.

---

## Sprint sequencing + paralelismo

```
Sprint 0 (paralelo — Dex pode rodar 3 instâncias paralelas se Diego topar):
  F-S01 ┐
  F-S02 ┼─── (sem deps externas)
  F-S03 ┘

Sprint 1 (sequencial, sem paralelismo):
  F-S04 ── needs F-S01 + F-S03
  F-S05 ── needs F-S01 + F-S02 + F-S03 + F-S04
  F-S06 ── needs F-S05
  F-S07 ── needs F-S01 (pode paralela com F-S06)
  F-S08 ── needs F-S01 (pode paralela com F-S06/F-S07)

Sprint 2 (parcial paralelo — mock data permite):
  F-S09 ── soft needs F-S05 (pode começar com mock)
  F-S11 ── needs F-S05 (pode paralela com F-S09)
  F-S10 ── needs F-S09 + F-S11
  F-S12 ── needs F-S05 + F-S09 + F-S11

Sprint 3 (sequencial):
  F-S13 ── needs F-S04 + F-S05
  F-S14 ── needs F-S13 + F-S12 + tudo anterior (story integradora)
  F-S15 ── needs F-S14
```

**Bloqueantes críticos:** F-S01, F-S02, F-S03 (Sprint 0). Sem essas, nada flui.
**Story integradora:** F-S14 — concentra risco; se 1 dos 4 brands falhar, ciclo volta Sprint 1/2.

---

## Open Questions Resolution (Nova → River)

Conforme Nova §7 do `stories-f-mvp.md`, River decide 5 convenções técnicas transversais:

### Q1 — Naming convention endpoints Hono → **REST clássico**

**Decisão:** RESTful CRUD em recursos (`POST /api/hosting-accounts`, `GET /api/sites/:id`, `DELETE /api/installations/:id`); actions sub-rotas POST (`POST /api/installations/:id/deploy`, `POST /api/installations/:id/revalidate`).

**Rationale:** mais idiomatic Hono/HTTP, mapa limpo pra cache layer futura (Onda 1.5), convenção amplamente conhecida. Hybrid onde action ≠ CRUD (deploy, revalidate) — UX §10.5 já segue esse pattern.

**Aplicado em:** F-S05 todos endpoints.

### Q2 — Test framework → **Vitest**

**Decisão:** Vitest unificado backend (tracking-api) + frontend (tracking-app).

**Rationale:** Vite é build system do tracking-app, Vitest integra zero-config. Hono tem starter Vitest. ESM-first sem CommonJS legacy. Consistência mono-stack reduz cognitive load.

**Aplicado em:** todas stories com test plan (F-S01 a F-S15).

### Q3 — Error handling pattern → **throw + classes de erro**

**Decisão:** throw com classes customizadas (`HttpError`, `ValidationError`, `LockConflictError`, `InvalidTokenError`) capturadas por error middleware Hono central que mapeia pra JSON shape `{ error: { code, message, request_id }}`.

**Rationale:** idiomatic JS/TS, stack trace gratuito, propagação async/await trivial. Result<T,E> é verbose pra MVP sem benefit claro. Classes específicas permitem catch typed em testes.

**Aplicado em:** F-S05 (middleware) + F-S04 (throw em retry).

### Q4 — SSE library → **`hono/streaming` native**

**Decisão:** usar helper `streamSSE` do Hono core, sem dep extra. Implementação manual `c.body(stream)` apenas se Hono não cobrir edge case (heartbeat custom).

**Rationale:** Hono já no stack. Dep menor = menos surface attack. F-S12 contract permite swap pra implementação manual se necessário (interface não muda).

**Aplicado em:** F-S12.

### Q5 — E2E test strategy → **smoke manual MVP F**

**Decisão:** F-S14 manual (Diego executa 4 brands visualmente). Playwright = candidato Onda 1.5 (NÃO criar story agora — adicionar ao backlog post-MVP).

**Rationale:** Manifesto 22/05 sem prazo, mas overhead Playwright (~4-6h setup + 1 test/brand) NÃO vale antes de validar técnica. Manual = rápido pra MVP, sem flakiness CI. Onda 1.5 reativa quando feature estabilizar.

**Aplicado em:** F-S14.

---

## Riscos altos que requerem atenção do Quinn no gate

Identificados por River durante detalhamento — 3 stories merecem revisão extra-cuidadosa no Quinn gate:

### 1. **F-S05 — Endpoints Hono (8 rotas)** — risco médio-alto

- **Por quê:** 8 endpoints + middleware auth + error mapping + worker async = muita surface. Bug em 1 endpoint pode escalar.
- **Quinn foco:** integration test full flow (createAccount → listSites → createInstallation → deploy → status); error responses JSON shape consistente; JWT auth não vaza tenant_id; idempotência createInstallation respeita F-S01.

### 2. **F-S12 — SSE streaming** — risco médio-alto

- **Por quê:** Real-time async + proxy buffering Easypanel + EventSource native browser quirks + fallback polling. Edge case multi-client se Diego abrir 2 browsers.
- **Quinn foco:** heartbeat 15s observado em prod; fallback polling realmente ativa em onerror; Caddy/Traefik buffer off validado por Felix; SSE close limpo em client disconnect.

### 3. **F-S14 — Smoke E2E 4 brands** — risco crítico (story integradora)

- **Por quê:** Toca prod real (mentoria.com.br!). Se mentoria falha install, Diego perde tracking em prod. p95 <2min é committed PRD.
- **Quinn foco:** ordem execução zerohum → ifrn → mentoria-app → mentoria respeitada (risco crescente); rollback procedure documented antes de mentoria; audit log LGPD-safe spot check; smoke results doc completo com screenshots; drift detect false positive scenarios verified.

**Stories de baixo risco (Quinn pode revisar lighter):** F-S01, F-S02, F-S03, F-S06, F-S07, F-S08, F-S15.

---

## Profundidade do detalhamento

Conforme prompt River:

- **Sprint 0 (F-S01-S03)** — detalhe máximo, ~200-260 linhas cada (foundation crítica)
- **Sprint 1 (F-S04-S08)** — detalhe alto, ~150-200 linhas cada (backend core)
- **Sprint 2 (F-S09-S12)** — detalhe médio-alto, ~150-180 linhas cada (frontend)
- **Sprint 3 (F-S13-S15)** — detalhe médio, ~120-160 linhas cada (final integração)

Total linhas (estimativa pós-criação): ~2400 linhas markdown distribuídas em 15 arquivos + este index ~180 linhas.

---

## Próximos passos pós-River

1. **Diego revisa este pacote** — valida open questions resolutions + profundidade stories
2. **Spawn Dex Sprint 0 parallel:** F-S01 + F-S02 + F-S03 em 3 instâncias paralelas (cada uma 1.5-2h dev focado)
3. **Quinn gate pós-Sprint 0:** valida types/interfaces consistentes, factories funcionando, no breaking on import
4. **Sprint 1 sequencial:** F-S04 → F-S05 → (F-S06/F-S07/F-S08 paralelos onde possível)
5. **Quinn gate pós-Sprint 1:** valida endpoints contract estável, audit LGPD-safe, retry funcional
6. **Sprint 2 parcial paralelo:** F-S09 + F-S11 começam com mock; F-S10 + F-S12 quando Sprint 1 fecha
7. **Quinn gate pós-Sprint 2:** valida a11y AA, mobile responsive, error states cobertos
8. **Sprint 3 sequencial:** F-S13 → F-S14 (story integradora, Quinn gate apertado) → F-S15
9. **Quinn gate final MVP:** smoke 4 brands + runbook completo

**Sem prazo. 1 dia ou 100 anos. Não importa.** Manifesto 22/05.

---

## Aderência CLAUDE.md (validação cross-cutting)

| Regra CLAUDE.md | Compliance no pacote stories |
|---|---|
| Cloudflare-last (#-2) | ✅ Sem Cloudflare em nenhuma story (tudo Easypanel KV8) |
| Manifesto 22/05 (sem data) | ✅ Stories sem timeline; estimates em hours not dates |
| Cutover Fase 6 abortado | ✅ Sem migrations DB (ADR-0008a mock Redis); sem touch ERP main |
| Não touch hotmart-webhook | ✅ Auto-provisioner não toca edge function Mentoria APP |
| Multi-tenant (CL-1) | ✅ Schema prepara tenant_id everywhere (MVP single-tenant Mentoria) |
| LGPD (regra #1 hash PII) | ✅ F-S07 safeAuditPayload sanitiza tokens; sem PII em audit |
| Backup MinIO retention | ✅ F-S08 alinhado 30d pg backup |
| Verde `#16DF6F` FIXO | ✅ F-S09 components reuso tokens existentes |
| pgTAP tests | N/A esta feature (sem migrations); vitest substitui (mock storage) |
| dbt models | N/A — feature não toca analytics |

**Verificado por River:** 100% adherence — nenhuma story rompe regras CLAUDE.md.

---

**Fim do detalhamento River.** Pacote pronto pra spawn Dex Sprint 0 paralelo.
