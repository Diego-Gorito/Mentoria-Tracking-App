# GTM Master V2 — Merge Plan

**Data:** 2026-05-27
**Contexto:** Auditoria completa dos 4 containers GTM da conta `GTM | Colégio Mentoria` (ID `6059193756`) via Tag Manager API com SA `tracking-claude-sa@n8n-integrar-gmail-sheet-drive.iam.gserviceaccount.com`.

**Objetivo:** Consolidar o melhor de cada container existente + adicionar plataformas faltantes pra criar `GTM-MASTER-V2 | Mentoria SaaS` — o container que será CLONADO pra cada cliente novo do SaaS Mentoria Tracking.

---

## 1. Estado atual (4 containers, 138 tags totais)

| Container | Tipo | Public ID | Internal ID | Tags | Vars | Triggers | Templates |
|---|---|---|---|---:|---:|---:|---:|
| GTM - WEB \| Colégio Mentoria (master) | Web | `GTM-5J587HS3` | 209837259 | 28 | 53 | 14 | 7 |
| [WEB]ZeroHumRN | Web | `GTM-WVWQVMP` | 94799788 | 81 | 57 | 33 | 8 |
| GTM-WEB \| Mentoria App | Web | `GTM-KMK749ZW` | 247262309 | 18 | 19 | 9 | 0 |
| GTM - SERVER \| Colégio Mentoria | Server | `GTM-PPVPWNXG` | 183007179 | 11 | 26 | 9 | 6 |

**Exports salvos em** `docs/gtm-exports/{GTM-XXXXXX}.json` + agregado `_all.json`.

---

## 2. Matriz de cobertura (por plataforma)

Formato: `ATIVAS+PAUSADAS_p` (paused = tag existe mas desligada — historicamente testada).

| Plataforma | 5J587 master | WVWQ ZeroHum | KMK Mentoria App | PPVP server |
|---|:-:|:-:|:-:|:-:|
| GA4 | 9 | 5+13p | 7 | 2 |
| Meta Ads (Pixel + CAPI) | 9 | 0+19p | 9 | 2 |
| Google Ads | — | 0+7p | — | **6** ✅ |
| Microsoft Clarity | 1 | 0+1p | — | — |
| TikTok | (template) | 0+7p | — | (template Events API) |
| LinkedIn Insight 2.0 | (template) | — | — | — |
| Microsoft Bing UET | — | 0+13p | — | — |
| Taboola | — | 0+2p (template) | — | — |
| Outbrain | — | 0+1p (template) | — | — |
| Visitor API | 1 | 0+4p | — | — |
| Spotify | — | 0+1p | — | — |
| Stripe (webhook) | — | — | — | (template) |
| CF7 (Contact Form 7) | 2 | 1 | — | — |
| WhatsApp click | 1 | 1+6p | — | 1 |
| Consent LGPD | 3 | 1 | 1+1p | — |
| Cookie Primário | (53 vars) | — | — | — |

**Observações chave:**
- **Master atual (5J587)** é o mais organizado (numeração `00.*`/`02.*`/`03.*`) mas cobre apenas GA4+Meta+Clarity ativos.
- **ZeroHum (WVWQ)** é o mais EXPLORADO — tem tags paused de TODA plataforma testada (Taboola, Outbrain, Bing, TikTok via 3 abordagens, Spotify, etc). 81 tags total porque acumula histórico.
- **Mentoria App (KMK)** é a versão simplificada do master, Meta via HTML em vez de Custom Template, **suporte SPA** (`PageView | SPA Navigation`).
- **Server (PPVP)** é o sGTM com Meta CAPI server-side, Google Ads server-side, n8n forward, Stripe webhook, TikTok Events API Official.

---

## 3. Custom Templates já importados (17 distintos)

| Template | Owner | Usado em |
|---|---|---|
| Facebook Pixel | facebookarchive | 5J587 |
| Conversions API Tag | facebookincubator | PPVP |
| Facebook Conversion API | stape-io | PPVP |
| Facebook Leads API | stape-io | PPVP |
| TikTok Pixel | tiktok | 5J587 + WVWQ |
| TikTok Events API (Official) | tiktok | PPVP |
| LinkedIn InsightTag 2.0 | linkedin | 5J587 |
| Microsoft Clarity - Official | microsoft | 5J587 |
| Taboola Pixel | taboola | WVWQ |
| Outbrain Pixel | outbrain | WVWQ |
| VisitorAPI | visitorapi | 5J587 + WVWQ |
| Cookie Creator | gtm-templates-anto-hed | WVWQ |
| Unique Event ID | stape-io | 5J587 + WVWQ |
| Event Id | mbaersch | WVWQ |
| cyrb53 Hasher | mbaersch | 5J587 |
| Stripe Webhook Client | custom | PPVP |
| Mentoria — HMAC SHA-256 (n8n_key) | custom | PPVP |

---

## 4. Plataformas FALTANDO pra master v2 — detalhamento técnico (pesquisado 2026-05-27)

### Web (templates oficiais Community Gallery disponíveis)

#### X (Twitter) Ads — Universal Website Tag
- **Template:** "Twitter Event Tag" na Community Template Gallery (oficial).
- **Arquitetura:** Base tag (pixel ID) em todas as páginas + Event tags por conversão.
- **Eventos:** PageView, AddToCart, Purchase, Lead, Sign-up — cada um precisa ter Event ID criado no painel X primeiro (não inventa client-side).
- **CAPI:** Twitter Conversions API existe como server-to-server (Stape template + Twitter docs) — pode ir no sGTM v2 server.
- **Per-tenant vars:** Pixel ID (X) + Event IDs (1 por evento).
- **Refs:** [business.x.com docs](https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites), [Stape sGTM template](https://stape.io/blog/twitter-conversion-api-tag-for-sgtm).

#### Reddit Pixel
- **Template:** Oficial em `reddit/reddit-gtm-template` ([GitHub](https://github.com/reddit/reddit-gtm-template)).
- **Eventos default:** page_view, add_to_cart, purchase + custom (signup, free_trial, form_submission).
- **Conversion ID** pra deduplicação automática.
- **Product data:** integração automática com data layer GA4 ecommerce.
- **Per-tenant vars:** Reddit Advertiser Pixel ID.
- **Refs:** [Reddit GitHub template](https://github.com/reddit/reddit-gtm-template).

#### Pinterest Tag + Conversions API
- **Templates:** 
  - Web container: Pinterest Tag (Community Gallery)
  - Server container: `pinterest/ss-gtm-template` ([GitHub](https://github.com/pinterest/ss-gtm-template)) — Pinterest Conversions API server-side
- **IMPORTANTE:** Web e Server usam IDs DIFERENTES:
  - Web GTM → Pinterest **Tag ID** da conta Pinterest Ads
  - Server GTM → Pinterest **Advertiser ID** (separado)
- **Benefício server-side:** bypass ad blocker + browser tracking limits.
- **Per-tenant vars:** Pinterest Tag ID (web) + Pinterest Advertiser ID (server).
- **Refs:** [Pinterest GitHub server template](https://github.com/pinterest/ss-gtm-template), [Stape Pinterest CAPI guide](https://stape.io/blog/pinterest-conversion-api).

#### Snap Pixel + Snapchat Conversions API
- **Templates:**
  - Web container: `Snapchat/snapchat-google-tag-manager` ([GitHub](https://github.com/Snapchat/snapchat-google-tag-manager)) — oficial
  - Server container: Snapchat Conversion API ServerSide template (Community Gallery)
- **Eventos:** PAGE_VIEW, VIEW_CONTENT, ADD_CART, PURCHASE, SIGN_UP, START_TRIAL.
- **Debug:** template loga eventos no console em preview mode (útil pra teste).
- **Conversions API Gateway:** Snap permite servir o pixel script do próprio first-party domain pra reduzir bloqueio.
- **Per-tenant vars:** Snap Pixel ID.
- **Refs:** [Snapchat GitHub template](https://github.com/Snapchat/snapchat-google-tag-manager).

#### Quora Pixel + Quora CAPI
- **Template:** Quora Pixel (Community Gallery — lançado oficialmente).
- **Eventos:** Generic Event, ViewContent, AddToCart, Purchase, GenerateLead, CompleteRegistration.
- **Conversion Value variable**: criar `{{Conversion Value}}` no GTM, popular via dataLayer programaticamente.
- **Server-side CAPI:** Quora Conversions API tag para sGTM (deduplica events).
- **Per-tenant vars:** Quora Pixel ID.
- **Refs:** [Quora install via GTM official](https://quoraadsupport.zendesk.com/hc/en-us/articles/360027248791-How-do-I-install-the-Quora-pixel-using-Google-Tag-Manager), [Stape Quora sGTM guide](https://stape.io/blog/set-up-quora-tag-using-server-gtm).

---

### Server-side (sGTM v2 — gateways BR via webhook → fan-out)

#### Kiwify
- **Setup:** `dashboard.kiwify.com.br/apps/webhooks/integrations` → Create Webhook → cola URL → seleciona eventos.
- **Eventos disponíveis:** `purchase_approved` (principal), `subscription_canceled`, `subscription_renewed`, `refund_requested`, etc.
- **Payload:** sale ID, product, buyer (email, phone, name), amount, dates, UTM parameters.
- **Signature:** webhook signature header (formato exato vai precisar confirmar na docs oficial [docs.kiwify.com.br](https://docs.kiwify.com.br/api-reference/webhooks/single)).
- **Arquitetura proposta:** Cliente configura webhook `https://gtm.colegiomentoria.com.br/track-kiwify` no painel Kiwify dele → sGTM tag custom recebe → valida signature → fan-out pra Meta CAPI, GA4 server, Google Ads server, TikTok Events API, etc.
- **Per-tenant vars:** Kiwify Webhook Secret (verificação) + mapping de produto Kiwify → conversion value GTM.
- **Refs:** [Kiwify webhook docs](https://docs.kiwify.com.br/api-reference/webhooks/single), [Kiwify integrations help](https://help.kiwify.com/en/category/integrations-pmcxd3/).

#### Kirvano
- **Setup:** Login Kirvano → Integrations sidebar → Webhook → New Webhook.
- **Eventos selecionáveis:** purchase, refund, chargeback, subscription events (cada um pode ser ativado/desativado individualmente).
- **Payload:** sale ID, product, buyer info, amounts, dates.
- **Signature:** secret key/token configurável pelo usuário (Kirvano envia em header pra verificação).
- **Retry strategy:** Kirvano retenta se endpoint não retornar 200 OK (built-in retry).
- **Arquitetura proposta:** mesma do Kiwify — cliente aponta webhook pra `https://gtm.colegiomentoria.com.br/track-kirvano` → sGTM tag custom valida + fan-out.
- **Per-tenant vars:** Kirvano Webhook Secret + product → conversion mapping.
- **Refs:** [Kirvano webhook config docs](https://help.kirvano.com/hc/central-de-ajuda/articles/1765394914-configuring-integration-via-webhook).

#### Hotmart (já existe via n8n — replicar no sGTM v2?)
- Atualmente passa por `n8n.colegiomentoria.com.br/webhook/track-hotmart` → workflow n8n → fan-out.
- Decisão: manter no n8n (não duplicar no sGTM v2) — n8n já tem signature validation + retry.

---

### Resumo: tags novas no master v2

| Plataforma | Tags web | Tags server | Per-tenant vars |
|---|:-:|:-:|:-:|
| X (Twitter) | 4-5 (Base + PageView + Lead + Purchase + ViewContent) | 1 (CAPI server) | Pixel ID + 4 Event IDs |
| Reddit | 4 (page_view + add_cart + purchase + lead) | — (template não-CAPI ainda) | Pixel ID |
| Pinterest | 4 (PageVisit + Lead + Checkout + Purchase) | 1 (Pinterest CAPI) | Tag ID web + Advertiser ID server |
| Snap | 4-5 (PageView + ViewContent + AddCart + Purchase + SignUp) | 1 (Snap CAPI) | Pixel ID |
| Quora | 3-4 (Generic + ViewContent + Purchase + Lead) | 1 (Quora CAPI) | Pixel ID |
| Kiwify | — | 1 webhook receiver + fan-out logic | Webhook Secret |
| Kirvano | — | 1 webhook receiver + fan-out logic | Webhook Secret |
| **TOTAL** | **~22-25 web** | **~6 server** | **~10 per-tenant vars novas** |

---

## 5. Master V2 — Estrutura proposta

### Container Web: `GTM-MASTER-V2 | Mentoria SaaS`

Numeração `XX.YY` (XX = plataforma, YY = ordem):

| Range | Plataforma | Tags |
|---|---|---|
| `00.*` | Utilities (consent, cookies, fbclid capture) | 5-7 |
| `01.*` | Microsoft Clarity + Visitor API | 2 |
| `02.*` | GA4 (Config + 7 eventos) | 8 |
| `03.*` | Meta Ads (Custom Template + 7 eventos + SPA) | 9 |
| `04.*` | Google Ads (Config + Remarketing + 4 conversões) | 6 |
| `05.*` | TikTok (Pixel + 5 eventos) | 6 |
| `06.*` | LinkedIn Insight 2.0 + conversões | 3-4 |
| `07.*` | Microsoft Bing UET (Base + conversões) | 5-6 |
| `08.*` | Taboola Pixel + conversões | 3 |
| `09.*` | Outbrain Pixel + conversões | 3 |
| `10.*` | **X (Twitter Ads)** NEW | 4-5 |
| `11.*` | **Reddit Pixel** NEW | 4 |
| `12.*` | **Pinterest Tag** NEW | 4 |
| `13.*` | **Snap Pixel** NEW | 4 |
| `14.*` | **Quora Pixel** NEW | 3 |

Total estimado: **~75-85 tags ativas**.

### Container Server: `GTM-MASTER-V2-SERVER | Mentoria SaaS`

Clone do PPVP existente + extensão:

| Tag | Status |
|---|---|
| GA4 API + events | ✅ herdado PPVP |
| Meta CAPI | ✅ herdado PPVP |
| Google Ads (Remarketing, Conversões, User Provided Data, Vinculador) | ✅ herdado PPVP |
| TikTok Events API Official | ✅ herdado PPVP |
| Facebook Leads API | ✅ herdado PPVP |
| n8n Forward — All Events | ✅ herdado PPVP |
| Stripe Webhook | ✅ herdado PPVP |
| **Kiwify Webhook → CAPI fan-out** | 🆕 |
| **Kirvano Webhook → CAPI fan-out** | 🆕 |

---

## 6. Variables per-tenant (parametrização no clone)

Ao clonar o master pra container do novo cliente, estes valores são substituídos:

| Variable | Tipo | Per-tenant? |
|---|---|:-:|
| `[CT] [VAR] source_brand` | constant | ✅ slug |
| `[CT] [Meta Ads] Pixel ID` | constant | ✅ |
| `[CT] [GA4] Fluxo de Dados \| ID da Métrica` | constant | ✅ |
| `[CT] [G Ads] ID da Tag` | constant | ✅ |
| `[CT] [G Ads] ID de Conversão` | constant | ✅ |
| `[CT] [G Ads] Rótulo Conversão - Botão WhatsApp` | constant | ✅ |
| `[CT] [G Ads] Rótulo Conversão - Envio Form` | constant | ✅ |
| `[CT] [Clarity] Project ID` | constant | ✅ |
| `[CT] [Visitor API] ID` | constant | ✅ |
| `[CT] [TikTok] Pixel ID` | constant | 🆕 ✅ |
| `[CT] [LinkedIn] Partner ID` | constant | 🆕 ✅ |
| `[CT] [Bing UET] Tag ID` | constant | 🆕 ✅ |
| `[CT] [Taboola] Account ID` | constant | 🆕 ✅ |
| `[CT] [Outbrain] Pixel ID` | constant | 🆕 ✅ |
| `[CT] [X Ads] Pixel ID` | constant | 🆕 ✅ |
| `[CT] [Reddit] Pixel ID` | constant | 🆕 ✅ |
| `[CT] [Pinterest] Tag ID` | constant | 🆕 ✅ |
| `[CT] [Snap] Pixel ID` | constant | 🆕 ✅ |
| `[CT] [Quora] Pixel ID` | constant | 🆕 ✅ |
| Cookie Primário (em, ph, fn, ln, ct, st, db, fbp, fbc) | k (cookie) | ❌ universal |
| User-Provided Data | gtes | ❌ universal |
| Visitor API (Cidade, Estado, Country) | v | ❌ universal |
| dataLayer variables (transaction_id, value, currency, etc.) | v | ❌ universal |

**Total: ~19 vars per-tenant + ~34 universais.**

---

## 7. Próximos passos

### Fase A — Sourcing (Diego)
- [ ] Confirmar pixel IDs / tag IDs de cada plataforma da Mentoria (ou marcar "pendente, criar no painel da plataforma quando ativar")
- [ ] Decidir se quer Spotify Pixel no v2 (ZeroHum tinha mas paused)
- [ ] Confirmar redireccionamento Kiwify/Kirvano: webhook URL preferida (`gtm.colegiomentoria.com.br/track-kiwify` ou n8n endpoint?)

### Fase B — Container Web V2 (eu, via API)
- [ ] Criar container `GTM-MASTER-V2 | Mentoria SaaS` na conta 6059193756
- [ ] Copiar 17 Custom Templates (importar Community Gallery: X Ads, Reddit, Pinterest, Snap, Quora)
- [ ] Copiar 53 variáveis do master atual + 10 novas per-tenant
- [ ] Copiar 14 triggers + 5-10 novos (per-plataforma)
- [ ] Criar 75-85 tags organizadas por range numérico
- [ ] Publicar v1 (sem ativar — cliente teste primeiro)

### Fase C — Container Server V2 (eu, via API)
- [ ] Criar container `GTM-MASTER-V2-SERVER | Mentoria SaaS`
- [ ] Clone do PPVP existente
- [ ] Adicionar tags Kiwify webhook + Kirvano webhook
- [ ] Smoke test com payload mock

### Fase D — Clone API (Mentoria-Tracking-App, Era 2)
- [ ] Schema `core.tenant_containers` (replace BRAND_GTM_MAP)
- [ ] Endpoint `POST /api/gtm/provision-container` que clona master v2 pra container novo + parametriza vars per-tenant + publica
- [ ] Plugin GTM4WP lookup dinâmico em vez de hardcoded
- [ ] Migration plan dos 4 brand existentes pro novo schema

---

## 8. Riscos / Open questions

1. **GTM API rate limits**: ~25 req/100s/user pra `containers.versions.create`. Clonar 75 tags = 75+ requests. Pode demorar.
2. **Google Tag Manager 500 containers/conta**: cabe muito cliente, mas ainda finito.
3. **Variáveis interconectadas**: algumas vars referem outras (ex: `Dados Fornecidos Pelos Usuários` usa `Email`, `Phone`, etc.). Ordem de criação importa.
4. **Custom Templates da Gallery**: precisam ser `Add to workspace` separadamente (não vem com container clonado). Pode precisar workflow especial.
5. **Kiwify/Kirvano**: webhook secret/HMAC config — precisa documentação dos painéis deles pra setar corretamente.
6. **Tags paused do ZeroHum**: muitas estão paused há tempo (legacy de A/B test). NÃO migrar pra v2 — só pegar IDs/configs como referência.

---

## 9. Decisões pendentes

- [ ] Manter Spotify Pixel no v2? (tava paused no ZeroHum, sem uso ativo)
- [ ] Adicionar Hotmart webhook server-side no PPVP-V2? (atualmente vai via n8n)
- [ ] Cookie consent: manter LGPD banner próprio ou migrar pra Consent Mode v2 Google?
- [ ] Versionamento: v2 substitui ou coexiste com containers atuais? (recomendado: coexistir até teste com 1 cliente)
