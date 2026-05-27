# PRD — Auto-Provisioner GTM (MVP Hostinger-Only)

**Autor:** Kai (Strategist/PM)
**Data:** 2026-05-25
**Status:** Draft pra revisão Aria/Uma
**Modelo:** Opus 4.7 (1M context)

**Pipeline AIOX downstream:** Aria (ADR arquitetura) → Uma (UX) → Nova/River (stories) → Dex (impl) → Quinn (gate) → Felix (deploy).

**Onde mora:** feature **dentro do** Mentoria-Tracking existente. Reusa backend Hono Node `tracking-api` Easypanel KV8 + frontend Vite SPA `tracking-app` em `tracking.colegiomentoria.com.br`. DB = Supabase branch staging `cjtwrzlwfqvzukjinmjr` (mesmo onde tracking mora pós-cutover-abortado 24/05). **Não é repo novo.**

**Manifesto 22/05 vigente:** "FODA-SE A DATA. O IMPORTANTE É FICAR BOM." Diego é único usuário até ficar excelente. Sem prazo. 1 dia ou 100 anos.

---

## 1. Problema

### 1.1 Estado atual (15-05/2026)

A pipeline server-side de tracking do Mentoria está **live em produção** para 1 brand de 4 que deveria cobrir:

| Brand | Tracking ativo? | Drift |
|---|---|---|
| Colégio e Curso Mentoria | ✅ Sim (validado prod 18/05) | — |
| Mentoria APP (alunos) | ⚠️ Parcial (Hotmart edge function ok, GTM web pendente) | médio |
| Colégio e Curso Zerohum | ❌ Não tem GTM web instalado | **crítico** |
| Blog IFRN — Preparatório | ❌ Não tem GTM web instalado | **crítico** |

Hoje, instrumentar GTM4WP num novo site WordPress envolve:

1. SSH ou hPanel manual no Hostinger
2. Upload do plugin .zip ou install do repo oficial
3. Configurar GTM Container ID na UI do plugin
4. Configurar Consent Mode v2, dataLayer hooks, brand_slug custom dimension
5. Smoke test manual (abrir site, F12, conferir dataLayer + sGTM hits)
6. Documentar credentials/access pra futuro

**Tempo médio Diego:** ~45-90min por site. Erro-prone (já houve drift entre Mentoria/Zerohum desde 14/05).

### 1.2 Quem sofre

- **MVP (P0):** Diego — único usuário até validar técnica. Ele perde tempo replicando setup manual nos 4 brands próprios e mantendo consistência conforme containers evoluem (v30 publicada 18/05 vai virar v31, v32…).
- **Onda 2 (fora deste PRD):** gestores de cursinhos militares clientes do SaaS Mentoria-Tracking, que vão querer "1 clique e tracking funcionando" sem entender GTM/WP.

### 1.3 Por que agora

- Ultra-tracking está LIVE no Mentoria desde 18/05. Drift Zerohum + IFRN aumenta a cada conversion não capturada.
- Plano SaaS (`docs/master-gtm-strategy.md`) já prevê Master GTM auto-provisionado — esse PRD é o **degrau zero** dessa visão, validando o fluxo técnico nos 4 brands próprios antes de expor pra terceiros.
- Stack já existe (backend Hono + frontend Vite + Postgres). Custo marginal = baixo. Risco isolado = só Diego no MVP, sem blast radius cliente.

---

## 2. Hipótese de valor

> Se Diego pode auto-provisionar tracking via painel num site WP do Hostinger em <2min/clique, então os 4 brands ficam cobertos sem ops manual e a feature está pronta pra Onda 2 (multi-tenant gestores externos).

### 2.1 Economias mensuráveis (MVP)

| Métrica | Hoje (manual) | Target MVP |
|---|---|---|
| Tempo install por site | 45-90min | <2min |
| Sucesso 1ª tentativa | ~60% (ajustes pós-install) | ≥95% |
| Sites cobertos | 1/4 | 4/4 |
| Drift detectado em <24h | Não (descobre 1-2 sem depois) | Sim (validador pós-install) |

### 2.2 Multiplicador Onda 2

Cada gestor cliente futuro pode ter 1-3 sites WP em Hostinger. Auto-provisioner = onboarding self-service. Sem ele, suporte 1:1 é gargalo do SaaS.

---

## 3. Escopo MVP (MoSCoW)

### 3.1 Must (não negociável pra MVP shippar)

1. **Listar sites Hostinger do account Diego** — via `mcp__hostinger__hosting_listWebsitesV1` ou equivalente REST API direto do backend.
2. **Persistir API token Hostinger** criptografado em Supabase Vault (mesmo padrão ERP usa).
3. **UI lista de sites** no painel `tracking-app` — colunas: domain, status WP, brand_slug atribuído (null se não atribuído).
4. **Click "instalar tracking" num site** → sistema:
   a. Lê GTM container ID do brand_slug escolhido (já existe no DB: `core.schools` ou nova tabela `core.gtm_installations`)
   b. Deploya plugin GTM4WP pré-configurado via `mcp__hostinger__hosting_deployWordpressPlugin`
   c. Aguarda confirmação Hostinger API
5. **Validador pós-install** — HTTP GET no site root, parse DOM, confere presença de `window.dataLayer` + GTM script tag com container ID correto.
6. **Audit log em DB** — tabela `core.gtm_installations` com `(id, site_domain, brand_slug, gtm_container_id, status, installed_at, installed_by_user, validation_result_json)`.
7. **Auth Mentoria-only** — Diego loga com credencial existente do `tracking-app`. Sem signup público, sem multi-tenant exposto.

### 3.2 Should (entra se sobrar tempo, não bloqueia ship)

- **Preview do plugin** antes do deploy — mostra config (container ID, consent mode, dimensions) numa modal pra Diego confirmar.
- **Retry automático** em caso de falha transitória da Hostinger API (max 3 tentativas, backoff exponencial).
- **Rollback / Uninstall** — botão "desinstalar tracking" que reverte deploy (uninstall plugin, limpa audit log com `status='uninstalled'`).
- **Re-validação on-demand** — botão "revalidar" reroda o validador sem reinstalar (útil se Diego mudou container ID GTM).

### 3.3 Could (nice-to-have, claramente Onda 1.5)

- **Deploy em batch** — instalar em N sites de uma vez (selecionar múltiplos checkboxes).
- **Notificação Telegram pós-install** — reusa infra WF18b existente do tracking (alerta Diego no celular: "Site X instrumentado OK").
- **Diff visual antes/depois** — screenshot via Puppeteer/Playwright headless mostrando site renderiza igual pré/pós-install.
- **Health check periódico** — cron diário valida que cada site instalado ainda tem tracking ativo (detecta uninstall manual por engano).

### 3.4 Won't (explicitamente fora — Onda 2 ou nunca)

- ❌ **WP REST API genérico** (suporte a WP não-Hostinger, ex: WPEngine, Kinsta, self-hosted). Hostinger MCP é primitivo único do MVP.
- ❌ **Multi-tenant exposto pra gestores externos.** Sem signup, sem onboarding cliente externo, sem billing.
- ❌ **OAuth com Hostinger.** Token API estático cola/colado por Diego no MVP. OAuth = Onda 2 quando exposto pra terceiros.
- ❌ **Gerenciar GTM containers** (criar/editar/deletar tags, triggers, variables). Sistema só **deploya** o plugin com containerId pré-existente. Containers continuam editados manualmente na UI tagmanager.google.com.
- ❌ **Parsear/instrumentar formulários WP nativamente.** GTM4WP cobre via DOM events automáticos. Se cliente quer custom event, edita no GTM UI.
- ❌ **Suporte a Wix / Squarespace / Webflow / Shopify.** Só WP via Hostinger.
- ❌ **Billing/quota.** Diego é único user. Quota = Onda 2.
- ❌ **Dashboard analítico de installs** (gráfico "N installs/semana"). Audit log table é suficiente pra MVP.

---

## 4. User journey MVP

**Persona:** Diego (admin Mentoria, conhece stack, quer 1-clique).

1. **Login** — abre `tracking.colegiomentoria.com.br`, login com credencial existente (sem signup).
2. **Navega "Sites Conectados"** — nova rota `/sites` no menu lateral do `tracking-app`.
3. **Adiciona conta Hostinger** — botão "+ Conectar Hostinger" → modal pede API token (campo password). Submit → backend criptografa em Vault, valida token batendo em `listWebsitesV1`, persiste em `core.hosting_accounts (id, provider='hostinger', encrypted_token, account_label)`.
4. **Lista sites** — UI puxa `GET /api/sites` que chama Hostinger MCP e merge com `core.gtm_installations` pra mostrar status:
   - Domain
   - Status WP detectado (sim/não)
   - Tracking instalado? (✅ verde se sim com container_id, ⚠️ amarelo se drift detectado, ❌ vermelho se não)
   - Brand atribuído (dropdown editável: mentoria / mentoria-app / zerohum / ifrn)
5. **Escolhe site + brand** — Diego clica linha "zerohum.colegiomentoria.com.br" → dropdown brand_slug = "zerohum" → save (persiste em `core.gtm_installations` com `status='draft'`).
6. **Click "Instalar Tracking"** — botão na linha do site. Backend:
   - Lê `gtm_container_id` do brand (Zerohum = `GTM-WVWQVMP` per CLAUDE.md tabela brands)
   - Chama `mcp__hostinger__hosting_deployWordpressPlugin` com payload do plugin pré-configurado
   - Aguarda resposta Hostinger (timeout 60s)
   - Roda validador (HTTP GET site root, regex container ID + dataLayer presence)
   - Atualiza `core.gtm_installations` (`status='installed'` ou `'failed'`, `validation_result_json`)
7. **Feedback UI** — progress bar durante deploy → success modal com:
   - ✅ "Tracking instalado em zerohum.colegiomentoria.com.br"
   - Link "Abrir site (nova aba)" pra Diego conferir manualmente
   - Link "Ver audit log"
   - Botão "Desinstalar" (se Should #3 estiver no scope)

**Failure path:** se deploy ou validação falha, modal mostra erro raw da Hostinger API + sugestões ("token expirado? regenerar em hpanel" / "site offline? tentar mais tarde").

---

## 5. Success metrics

### 5.1 MVP (validação Diego nos 4 brands)

| Métrica | Como medir | Target |
|---|---|---|
| **Tempo install médio** | `installed_at - draft_at` em `core.gtm_installations` | <2min p95 |
| **Sucesso rate** | `COUNT(status='installed') / COUNT(*)` | ≥95% |
| **Drift Mentoria** | `COUNT(brands sem gtm_installations.status='installed')` | 0 |
| **Auto-detect drift** | Validador pós-install detecta dataLayer ausente | 100% true positive rate |

### 5.2 Gate de promoção Onda 2

Antes de expor pra gestor externo (Onda 2), todos os 4 brands Mentoria devem rodar com `status='installed'` por **30 dias consecutivos** sem intervenção manual. Manifesto 22/05 vigente — sem prazo, mas critério qualidade firme.

---

## 6. Riscos & mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | **Hostinger API rate limit** atinge teto durante batch ou retries | Média | Médio | Backoff exponencial 1s→2s→4s. Documentar limite real após 1ª medição. Se necessário, queue local. Could: batch deploy só serial, nunca parallel. |
| R2 | **Plugin deploy falha no meio** — Hostinger confirma upload mas WP rejeita ativação. Estado inconsistente. | Média | Alto | Validador pós-install é mandatório (Must #5). Se valida=false → audit log marca `status='deploy_partial'` + alerta UI. Should #3 (rollback) cobre cleanup manual. |
| R3 | **Token Hostinger expira/revogado** sem aviso | Baixa | Alto | Healthcheck periódico (Could) ou on-demand antes de cada deploy: chama `listWebsitesV1` como ping. Se 401 → UI pede novo token, marca account `status='token_expired'`. |
| R4 | **GTM container ID errado** (Diego escolhe brand_slug=zerohum mas DB tinha container Mentoria por engano) | Baixa | Alto (mistura analytics cross-brand, LGPD risk) | Source of truth: `core.schools` table (per CLAUDE.md item 4 da tabela "Brands rastreadas"). Backend NUNCA aceita container_id da UI — sempre lê do DB pelo brand_slug. Validador pós-install confere container no DOM bate com esperado. |
| R5 | **Plugin via Hostinger MCP tem limitações vs SSH direto** — talvez não permite upload de plugin .zip custom, só do repo WP oficial. | Média | Alto (bloqueia config pré-baked) | Aria precisa validar primeiro thing. Se confirmar limitação: fallback é deploy plugin oficial + chamar WP REST API (`/wp-json/wp/v2`) pra configurar options. Onda 2 já contempla WP REST API genérico. |

---

## 7. Não-faz parte (Won't, expandido)

Para evitar scope creep, Aria/Dex devem rejeitar adicionar:

1. **Gestão de tags GTM** — auto-provisioner só instala o plugin que carrega o container existente. Cria/edita/deleta tags no GTM web UI continua manual (ou via Master GTM API quando Onda 2 entrar — `docs/master-gtm-strategy.md` §Fase 1).
2. **Custom event registration** — se cliente quer evento custom, edita no GTM UI. Sistema não vai oferecer "register custom event via form".
3. **Billing/quota** — sem cobrança, sem limite N sites. Diego é único user MVP.
4. **OAuth flow Hostinger** — token estático colado MVP. OAuth = Onda 2 (gestor externo nunca cola token raw).
5. **Onboarding wizard tipo SaaS** — Diego pula direto pra UI. Wizard friendly = Onda 2.
6. **Email notifications** — sem SMTP/Resend pra MVP. Telegram (Could) reusa infra existente se entrar no scope.
7. **Versionamento de installs** — se Diego reinstala, simplesmente sobrescreve audit log row (`status='installed'` atualiza `installed_at`). Sem histórico imutável MVP. Histórico = Onda 2.
8. **Auditoria LGPD detalhada do payload Hostinger raw** — backend pode logar metadata (site_domain, status_code, timing), **não** o token nem o response body completo. Open question #4 pra Aria.

---

## 8. Dependências externas

Pra Dex começar implementação, isso precisa estar pronto:

| # | Dependência | Status | Owner |
|---|---|---|---|
| D1 | GTM containers existem por brand | ✅ Mentoria `GTM-5J587HS3`, Zerohum `GTM-WVWQVMP`, IFRN reusa Mentoria, Mentoria APP `GTM-KMK749ZW` | — |
| D2 | Hostinger API token Diego | ⏳ Diego gera em hpanel quando Aria/Dex pedirem | Diego |
| D3 | Plugin GTM4WP empacotado pré-configurado como .zip | ❓ Aria decide: usar plugin oficial WP repo (auto-update, mas precisa post-install config via WP REST API) OU fork pré-configurado (sem auto-update, mas zero config pós-deploy). Open question #1. | Aria |
| D4 | Supabase Vault encryption pattern | ✅ ERP usa, reusar mesmo helper | — |
| D5 | Tabela `core.gtm_installations` no DB | ⏳ Migration nova, Dara escreve após Aria ADR | Dara |
| D6 | Tabela `core.hosting_accounts` (multi-account prep mesmo se MVP só 1) | ⏳ Migration nova, Dara escreve após Aria ADR | Dara |
| D7 | Rota `/sites` no Vite SPA + componentes | ⏳ Uma desenha UX, Dex implementa | Uma → Dex |
| D8 | Endpoints Hono `/api/sites/*` no `tracking-api` | ⏳ Dex após Aria ADR | Dex |

**Bloqueio principal:** D3 (decisão plugin oficial vs fork) — Aria precisa resolver primeiro pra Dex saber se backend faz WP REST API call pós-deploy ou se plugin já vem pronto.

---

## 9. Cronograma sugerido (sem datas, manifesto 22/05)

Ordem de execução AIOX, sem prazos absolutos:

| # | Etapa | Owner | Estimativa esforço |
|---|---|---|---|
| 1 | **ADR arquitetura** — Hostinger adapter pattern, decisão plugin oficial vs fork, schema DB (`core.gtm_installations`, `core.hosting_accounts`), auth/Vault integration, validador implementation | Aria | ~1h |
| 2 | **UX wireframes** — fluxo 5-7 steps user journey §4, estados loading/success/error, design tokens do ERP | Uma | ~1h (paralelo com Aria) |
| 3 | **Story breakdown** — quebrar PRD em 4-6 stories independentes (backend connect Hostinger, frontend lista sites, deploy flow, validador, audit log, rollback) | Nova | ~30min |
| 4 | **Story details** — cada story com AC, test plan, dependencies | River | ~30min × 4-6 stories |
| 5 | **Implementação** — backend Hono + frontend Vite + migrations Dara | Dex | ~2-4h por story |
| 6 | **QA gate** — testes pgTAP + smoke E2E + revisão segurança token | Quinn | ~30min |
| 7 | **Deploy** — backend + frontend Easypanel KV8 + migrations Supabase staging | Felix | ~15min |

**Marcos de validação Diego:**
- Após Aria ADR: Diego revisa decisões P0 (open questions §10) antes de Uma/Dex começarem
- Após primeiro install end-to-end num brand (sugestão: começar por Zerohum, brand não-crítico): Diego smoke test manual
- Após 4/4 brands instalados: Diego decide se promove Should/Could itens pra Onda 1.5

---

## 10. Open questions pra Aria/Dex

Decisões técnicas que Kai NÃO responde — Aria (arquitetura) + Dex (impl) decidem:

### Q1 (Aria) — Plugin GTM4WP oficial OU fork pré-configurado?

- **Opção A (oficial repo WP):** auto-update gratuito, comunidade mantém. Mas precisa WP REST API call pós-deploy pra configurar GTM container ID, Consent Mode v2, custom dimensions. Adiciona 1 hop de risco.
- **Opção B (fork pré-configurado .zip):** zero config pós-deploy, plugin já vem com container_id hardcoded como variável de ambiente lida do nome do .zip ou similar. Mas perdemos auto-update + temos que rebuildar .zip por brand.

**Trade-off:** Manutenção (A vence) vs Simplicidade install (B vence).

### Q2 (Aria + Dara) — GTM container ID mora onde?

- **Opção A:** Coluna em `core.schools.gtm_container_id` (denormalizado, 1 linha por brand).
- **Opção B:** Nova tabela `core.gtm_installations.gtm_container_id` (1 linha por site, permite múltiplos sites/brand com containers diferentes — útil Onda 2).
- **Opção C:** Env var por brand no backend (`GTM_CONTAINER_MENTORIA`, `GTM_CONTAINER_ZEROHUM`). Mais simples mas menos multi-tenant-ready.

**Recomendação Kai:** Opção B (preparar Onda 2 sem custo extra). Mas Aria avalia.

### Q3 (Dex) — Validador pós-install: HTTP HEAD OU full page load com selectors?

- **HEAD:** rápido (<500ms), mas só confere status 200, não dataLayer presence.
- **Full GET + regex DOM:** ~2-3s, confere `<script>` tag GTM + `window.dataLayer = ...` no source.
- **Playwright headless:** ~5-10s, confere dataLayer real após JS execute (mais accurate, mais custo infra).

**Recomendação Kai:** Full GET + regex (Must). Playwright = Could pra Onda 1.5.

### Q4 (Aria + LGPD) — Audit log persiste payload Hostinger raw OU só metadata?

- **Payload raw:** debug fácil quando algo quebra. Risco: response Hostinger pode incluir info conta (email Diego, account ID).
- **Só metadata:** site_domain, status_code, timing, error_summary. Sem dados pessoais.

**Recomendação Kai:** só metadata (LGPD-safe by default). Raw payload em log temporário 7 dias se Dex precisar debug.

### Q5 (Aria + Diego) — Rotação token Hostinger automática OU manual?

- **Automática:** backend roda cron mensal pedindo Hostinger OAuth refresh (se API suporta). Complexo MVP.
- **Manual:** Diego cola novo token quando 401 aparecer. UX inferior mas trivial MVP.

**Recomendação Kai:** manual MVP. Auto = Onda 2.

---

## 11. Aderência a CLAUDE.md regras

| Regra | Como esse PRD respeita |
|---|---|
| Cloudflare-last (23/05) | Sem Cloudflare. Easypanel KV8 cobre backend + frontend deploy. R2 mirror irrelevante aqui. |
| Manifesto 22/05 (sem data) | PRD cronograma usa "esforço" não "data". |
| Cutover abortado 24/05 | DB = Supabase staging `cjtwrzlwfqvzukjinmjr` continua. Sem touch ERP main project. |
| Não touch hotmart-webhook edge function | N/A. Auto-provisioner não toca edge functions. |
| Multi-tenant (CL-1) | MVP é Mentoria-only mas DB schema preparado pra multi-tenant (`core.hosting_accounts.tenant_id` opcional, default Mentoria). Onda 2 só liga a flag. |
| `core.conversion_dispatches` pattern | N/A pra essa feature (não envia conversions). |

---

## 12. Glossário

| Termo | Definição |
|---|---|
| **GTM4WP** | Plugin WordPress oficial Google Tag Manager for WordPress (gtm4wp.com) |
| **GTM Container** | Workspace tagmanager.google.com com tags/triggers (ex: `GTM-5J587HS3`) |
| **sGTM** | Server-side GTM, container `GTM-PPVPWNXG` self-hosted em KV8 |
| **Brand slug** | Identificador único da escola/produto em `core.schools.slug` (mentoria/mentoria-app/zerohum/ifrn) |
| **Validador pós-install** | HTTP check que confere dataLayer + GTM script presentes pós-deploy |
| **Hostinger MCP** | Servidor MCP que expõe primitivas `hosting_*` pro Claude/backend |
| **Vault** | Supabase Vault, mecanismo de encryption-at-rest pra credentials |
| **Onda 2** | Próxima fase pós-MVP (multi-tenant exposto pra gestores externos) |

---

**Fim do PRD.** Próximo passo: Aria escreve ADR baseado em §10 open questions + §3 scope MVP.
