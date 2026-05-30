# ADR-0011 — Suíte Mentoria: Receita ERP-primária, União do Tracking, Atribuição Closed-Loop, Chatwoot Headless

**Status:** Accepted
**Data:** 2026-05-30
**Decisores:** Diego Gorito (PO + dev solo)
**Autor:** Claude (Opus 4.8 1M, sessão Auto Mode)
**Upstream:**
- [ADR-0009](./adr-0009-gtm-master-clone-architecture.md) — GTM Master Clone (Era 2)
- Sessão 2026-05-30 — diagnóstico de nível do tracking + ordem rumo à perfeição

**Downstream esperado:**
- Migration `0261_attribution_conversion_from_enrollment.sql` (função de atribuição)
- Tasks #72 (Enhanced Conversions), #73 (ROAS unificado), #77 (closed-loop), #78 (Chatwoot)

---

## 1. Contexto

A **Suíte Mentoria** = três produtos que se vendem separados mas convergem:

| Produto | Papel | Banco |
|---|---|---|
| **ERP** | âncora — matrícula, financeiro, acadêmico | Supabase `apzakxgmmucutejhsjsa` (schema `erp.*`) |
| **Tracking** | aquisição — origem do lead → conversão | Supabase `cjtwrzlwfqvzukjinmjr` (branch `tracking-rebase` de apza) |
| **Chatwoot** | atendimento — WhatsApp/chat omnichannel | self-hosted KV8 (Easypanel) |

A tese comercial: vender cada um isolado, mas **fazer as escolas migrarem pro ERP onde tudo conecta**. O tracking existe principalmente pra deixar o ERP **perfeito pra quem compra a suíte completa** — não como produto-fim isolado.

Esta sessão fixou **4 decisões arquiteturais** que estavam implícitas.

---

## 2. Decisão 1 — Receita: ERP é fonte primária, webhook é complemento digital

**Contexto:** matrícula de escola/cursinho é majoritariamente **offline** (balcão, boleto, presencial). Só uma fração é checkout digital.

**Decisão:**
- A **fonte de verdade de receita é `erp.enrollments`** (+ valor via `erp.enrollment_payment_terms`).
- O webhook de checkout (Hotmart/Kiwify/Kirvano) cobre **apenas vendas digitais** — é complemento, não a fonte.
- **`tracking.conversions` é a CAMADA UNIFICADA de receita.** Ambas as fontes (matrícula ERP + checkout digital) escrevem nela. A view `analytics.roi_por_campanha` lê de `conversions`, agnóstica à origem (`source` distingue `'erp'` vs `'kiwify'`/`'hotmart'`/...).

**Consequência:** o ROAS real cruza custo de ads × receita de `conversions`, onde a maior parte da receita virá de matrículas do ERP. Nunca depender só do número (inflado) do Gerenciador de Anúncios.

**Valor da matrícula:** `Σ erp.enrollment_payment_terms.amount_cents` por `enrollment_id` (parcelas não-canceladas). `closed_amount_cents` quando negociado; senão `amount_cents`.

---

## 3. Decisão 2 — União do banco: DEPOIS do Comercial

**Contexto:** `cjtwrzlwfqvzukjinmjr` é literalmente o branch Supabase **`tracking-rebase`** cujo `parent_project_ref` é o ERP `apzakxgmmucutejhsjsa` (confirmado via `list_branches`). Vão convergir num único Postgres.

**Decisão: unir DEPOIS do módulo Comercial do ERP estabilizar.** Três razões factuais:

1. **Unir agora não acende ROAS nenhum.** As 243 matrículas atuais são **import em batch** (todas `enrolled_at = 2026-05-17`, status uniforme `active`; existe projeto "APP - DB - IMPORT - TO - ERP"). São base legada, não matrículas vindas de leads rastreados. O tracking tem 18 leads / 2 conversions. O overlap *"matrícula ↔ lead rastreado por ads"* hoje é **≈ 0** → o JOIN nativo ligaria dois conjuntos que não se cruzam.
2. **O Comercial vai remodelar a tabela da junção.** `erp.leads` tem **1 linha** — módulo em construção. É exatamente onde o tracking precisa casar origem×matrícula. Unir antes = integrar contra alvo móvel e refazer.
3. **Ambos branches estão `MIGRATIONS_FAILED`.** Merge nesse estado é dor garantida; o conserto acontece no ciclo do Comercial.

**Gatilho de união** (os três juntos): Comercial com schema estável + migrations verdes nos dois branches + primeiras matrículas nascendo de leads rastreados.

**Como não desperdiçar:** a atribuição é construída **antes** da união, via `tracking.conversions`. Interino = a app lê o ERP e materializa conversions atribuídas; pós-união = vira `JOIN` nativo / trigger. **O ativo permanente (tabela `conversions` + view `roi_por_campanha` + lógica de match) é idêntico nos dois mundos** — só a "fonte" da matrícula muda. Zero retrabalho no que importa.

---

## 4. Decisão 3 — Atribuição: match multi-estratégia ERP ↔ tracking

**Chave de join, em cascata de confiança:**

1. **Determinístico:** `erp.students.user_id = tracking.leads.mentoria_app_user_id` (quando o aluno tem conta no app).
2. **Email:** `tracking.hash_pii(erp.students.email) = tracking.leads.email_hash`.
3. **Phone:** `tracking.hash_pii(normalize(erp.students.phone)) = tracking.leads.phone_hash` (best-effort — normalização de telefone pode divergir; tratado como confiança menor).

`hash_pii(x) = sha256(lower(trim(x)))` em hex — **idêntico ao Advanced Matching do Meta/Google**, então a mesma função serve pro join interno E pro envio às plataformas (#72).

**Modelo de atribuição:** first-touch (`lead.first_campaign_id`) como default; last-touch disponível (`last_campaign_id`). Multi-touch data-driven = evolução futura (#76).

**Idempotência:** conversion de matrícula é única por `(source='erp', external_id=enrollment.id)`. Re-sync atualiza valor/status (active→cancelled vira `refunded`) sem duplicar.

---

## 5. Decisão 4 — Chatwoot headless (UI própria sobre backend KV8)

**Decisão:** reusar o **backend Chatwoot** que já roda no KV8 e construir uma **UI nova própria** sobre a API REST, desacoplada do frontend Rails/Vue do upstream.

**Razões:** (a) o frontend do Chatwoot muda muito e quebra a cada update — uma UI própria isola esse risco; (b) aproveitar o melhor das atualizações do backend upstream; (c) UI de atendimento integrada à suíte (ERP + tracking).

**Princípios de curadoria:**
- **Planejar quais funções importar** (conversations, contacts, messages, inboxes, agents, webhooks) — trazer só o que serve ao produto, sem lixo.
- **Evitar features enterprise/pagas** (licença comercial Chatwoot) **salvo desbloqueio explícito**.
- Mapear community vs enterprise antes de construir.

**Integração existente:** eventos Chatwoot já alimentam o tracking via `chatwoot_inbox_mappings` (consumer n8n, fora deste repo).

---

## 5b. Decisão 5 — Contas de anúncio multi-plataforma + boundary read-only

**Contexto:** a proposta inicial era "1 conta de ad = 1 tenant". Errado.

**Decisão:**
- **Tenant = escola. Uma escola tem N contas de anúncio**, em N plataformas (várias contas Meta + Google + TikTok...). O tracking puxa custo de **todas** e agrega sob a escola. Tabela `tracking.ad_accounts` (1:N, `UNIQUE(platform, external_account_id)`).
- A escola **escolhe quais conectar** (opcional, igual aos canais do #74).
- **O tracking é READ-ONLY sobre ad platforms.** Só usa ferramentas de leitura (`ads_get_ad_entities`, `ads_insights_*`). **NUNCA** cria/ativa/publica campanha (`ads_create_campaign`, `ads_activate_entity` — gastam dinheiro). Publicar/gerir anúncio é função do **app de postagens/gestão**, não daqui.

**Por que importa:** o boundary read-only não é só separação de produto — **alinha com a regra dura de não executar gastos/transações autônomas**. Ativar uma campanha gasta budget; isso nunca acontece a partir do tracking.

**Verificado (2026-05-30):** Meta Ads MCP acessível com o System User Token do Diego — 12 contas listadas, conta Colégio Mentoria (`567799847276186`) com 378 campanhas reais, spend histórico puxável. Confirma capacidade de popular `tracking.campaigns.cost_cents` sem ação manual.

## 6. Consequências e estado

**Positivas:**
- `tracking.conversions` vira o **ponto único de receita** (digital + matrícula) — qualquer consumidor (ROAS, closed-loop #77, CAPI offline) lê de um lugar só.
- A atribuição liga sozinha quando o dado fluir — sem reescrever na união.
- Decisões registradas sobrevivem a compactação de contexto.

**Bloqueios temporais do ROAS real** (não são bugs — são dependências de dado/timing):
- **Custo de ads:** depende do Meta System User Token (ação do Diego) + syncs Google/TikTok. Sem isso, `tracking.campaigns.cost_cents` fica vazio.
- **Receita atribuída:** depende do overlap matrícula↔lead-rastreado crescer (pós-instrumentação dos sites) ou da união.
- **JOIN nativo:** pós-Comercial.

**A infra (esta ADR + migration 0261) está pronta antes dos bloqueios — acende quando convergirem.**
