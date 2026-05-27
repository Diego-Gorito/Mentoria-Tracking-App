# Session Handoff — 2026-05-27 (continuation, evening → late night)

**Início:** Diego retoma após handoff anterior, queria F-S14 smoke E2E real.
**Fim:** ~9h depois, Diego entrou no app + master v2 GTM construído + 7 plataformas mapeadas.

**Estado git:** working tree dirty (docs novos), HEAD `762eb97` (push pra origin/main feito).

---

## TL;DR ULTRA-CURTO

1. **Login produção FUNCIONA** — Diego logou em `https://tracking.colegiomentoria.com.br` com `gorito.fx@gmail.com`. Tenant `mentoria` ligado via INSERT em `core.tenant_users`.
2. **4 bugs login corrigidos** — edge function `accepted_at` → `joined_at`, hook cold-start warm, build config nixpacks→Dockerfile, Topbar.email guard.
3. **GTM-MASTER-V2 + V2-SERVER criados** via API com 173 elementos clonados/criados (14 templates web).
4. **5 templates Community Gallery importados** via Chrome MCP UI: Twitter Base/Event, Reddit, Pinterest, Snap.
5. **Doc estratégico** `docs/gtm-master-v2-merge-plan.md` com mapping completo de plataformas + per-tenant vars.

---

## Bugs corrigidos (login)

| Bug | Local | Fix | Commit |
|---|---|---|---|
| `accepted_at` coluna não existe | edge `custom-access-token` | Trocou pra `joined_at` + colapsou 2 queries em 1 | Deploy v16 |
| Hook timeout 5s cold-start | Deno cold init ~5s | Ping warmup manual (cron permanente fica pendente) | n/a |
| tracking-app build mode | Easypanel `build.type=nixpacks` servia `vite dev` | Trocou pra `dockerfile` + redeploy | tRPC API |
| `n.email.charAt` TypeError | `src/components/layout/Topbar.tsx:146` | Optional chaining `user.email?.charAt(0)?.toUpperCase() ?? '?'` | `762eb97` |

---

## Tenant insert manual (Diego)

```sql
INSERT INTO core.tenant_users (tenant_id, user_id, role, status, joined_at, created_at, updated_at)
VALUES (
  '93031821-455e-490b-92c9-1ccbebf1b30f'::uuid,  -- tenant mentoria
  '198b5bfe-045d-4b8a-8aac-20b32396a0df'::uuid,  -- gorito.fx@gmail.com
  'app_admin', 'active', now(), now(), now()
);
-- id retornado: 9c955cce-324c-415d-9818-0502527b8f04
```

Schema constraint role: `gestor | secretaria | comercial | financeiro | pedagogico | professor | aluno | responsavel | app_admin`. Não aceita `owner`.

---

## GTM Master V2

**Containers novos na conta `6059193756 = GTM | Colégio Mentoria`:**

| Container | Public ID | Internal ID | Templates | Vars | Triggers | Tags |
|---|---|---|---:|---:|---:|---:|
| Web v2 | `GTM-WLZ3H8VH` | 253664662 | 14 | 60 | 14 | 29 |
| Server v2 | `GTM-KLDMV2VH` | 253664663 | 6 | 30 | 9 | 11 |

**Templates Gallery importados (5 novos via Chrome MCP UI):**
- Twitter Base Pixel (owner=twitter)
- Twitter Event Pixel (owner=twitter)
- Reddit Pixel (owner=reddit)
- Pinterest Pixel Tag (owner=pinterest)
- Snap Pixel (owner=Snapchat)

**Templates copiados via API do ZeroHum:**
- Taboola Pixel (owner=taboola)
- Outbrain Pixel (owner=outbrain)

**Custom Templates herdados do master atual (7):**
- VisitorAPI, TikTok Pixel, Unique Event ID, Facebook Pixel, cyrb53 Hasher, LinkedIn InsightTag 2.0, Microsoft Clarity Official

**Quora**: criada tag HTML manual paused (`14.00 [CT] [Quora] Pixel Base`) — sem template Community Gallery oficial.

**Tags base + eventos NÃO criadas ainda** (próxima sessão). Templates instalados mas precisa criar tags que usam eles.

**Vars per-tenant (10 placeholders criados, valor `PIXEL_NAO_DEFINIDO`):**

| Variable | Container | Função |
|---|---|---|
| `[CT] [Bing UET] Tag ID` | web | UET Tag ID Bing Ads |
| `[CT] [X Ads] Pixel ID` | web | Twitter (X) Pixel ID |
| `[CT] [Reddit] Pixel ID` | web | Reddit Advertiser Pixel ID |
| `[CT] [Pinterest] Tag ID` | web | Pinterest Web Tag ID |
| `[CT] [Pinterest] Advertiser ID (server)` | web (futuro server) | Pinterest CAPI |
| `[CT] [Snap] Pixel ID` | web | Snap Pixel ID |
| `[CT] [Quora] Pixel ID` | web | Quora Pixel ID |
| `[CT] [Kiwify] Webhook Secret` | server | HMAC validation Kiwify |
| `[CT] [Kiwify] Endpoint URL` | server | `gtm.colegiomentoria.com.br/track-kiwify` |
| `[CT] [Kirvano] Webhook Secret` | server | HMAC validation Kirvano |
| `[CT] [Kirvano] Endpoint URL` | server | `gtm.colegiomentoria.com.br/track-kirvano` |

---

## Service Account GTM (importante!)

**Email:** `tracking-claude-sa@n8n-integrar-gmail-sheet-drive.iam.gserviceaccount.com`

**JSON key:** `/Volumes/SSD 2T/Dev/tracking-claude-sa.json` (criada via REST IAM API com ADC do Diego — projeto `n8n-integrar-gmail-sheet-drive`)

**Permission:** Administrador da conta `6059193756 = GTM | Colégio Mentoria` (promovida via UI durante esta sessão pra criar containers)

**Diego access:** Publish nos 4 containers existentes + 2 v2 (atualizado via API após criação).

**Scopes necessários:**
- `https://www.googleapis.com/auth/tagmanager.readonly` (audit)
- `https://www.googleapis.com/auth/tagmanager.edit.containers` (criar/copiar)
- `https://www.googleapis.com/auth/tagmanager.manage.users` (gerenciar perms)
- `https://www.googleapis.com/auth/tagmanager.publish` (publicar versão)

---

## Docs novos

- `docs/gtm-master-v2-merge-plan.md` — plano consolidado completo + matriz cobertura + pesquisa técnica de cada plataforma com URLs Gallery
- `docs/gtm-exports/_all.json` — agregado JSON dos 4 containers (138 tags / 155 vars / 65 triggers / 21 templates)
- `docs/gtm-exports/GTM-5J587HS3.json` — master atual Mentoria
- `docs/gtm-exports/GTM-WVWQVMP.json` — ZeroHumRN (81 tags incluindo 70+ paused)
- `docs/gtm-exports/GTM-KMK749ZW.json` — Mentoria App
- `docs/gtm-exports/GTM-PPVPWNXG.json` — server sGTM master
- `docs/gtm-master-export.json` — export do GTM-5J587HS3 (gerado early na sessão)

---

## Followups (chips spawned)

1. **ADR-0009 GTM Master Clone arch** — arquitetura correta (containers na conta Diego, clone do master v2 pra cliente)
2. **ADR-0010 Event Coverage Audit pós-install** — crawler/auditor pra validar cobertura no WP do cliente

---

## Próximos passos concretos

### Imediato (próxima sessão):
1. **Criar tags base + eventos pra plataformas novas** (Twitter PageView+Lead+Purchase+CompleteReg+InitiateCheckout; Reddit page_view+conversion; Pinterest PageVisit+Lead+Checkout+Purchase; Snap PAGE_VIEW+VIEW_CONTENT+ADD_CART+PURCHASE+SIGN_UP; Quora Generic+ViewContent+Purchase+Lead). **Templates já instalados**, vars placeholders prontas. Via API ~20-30 tags em batch.
2. **Bing UET base tag** — corrigir parameter `uetqName` missing.
3. **Tags webhook Kiwify + Kirvano no server v2** — definir payload format + criar receiver tag custom (com HMAC sig validation).
4. **Validar pixel IDs reais** — Diego confirma os IDs por plataforma (ou marca "criar conta na plataforma quando ativar").
5. **Publicar v2 versão inicial** — review + Submit no GTM UI.

### Curto prazo (Era 2):
6. **F-S20**: Schema `core.tenant_containers(tenant_id, gtm_container_id, gtm_account_id, master_version_clonado, created_at)`.
7. **F-S21**: Service account GTM auth + lista de master tags pra clonar (já temos via SA + export JSON).
8. **F-S22**: Endpoint `POST /api/gtm/provision-container` que clona master v2 → container novo + parametriza vars per-tenant + publica.
9. **F-S23**: deployJob lookup dinâmico (substitui BRAND_GTM_MAP hardcoded).
10. **F-S24**: UI no app — tela "Containers GTM" + botão "Republish from master".

### Médio prazo:
11. **F-S30 a F-S35**: Event Coverage Audit (ADR-0010) — Playwright crawler + DOM detector + GTM gap analyzer.

---

## Risco / open questions ativos

- **Cold start edge function** `custom-access-token`: 4-5s warm, mas 5+s cold = timeout 422. Solução: cron warmer ou reescrever sem JSR import.
- **SMTP magic link**: backend retorna 200 mas email não chega (Supabase SMTP grátis com rate limit baixo). Configurar SMTP custom (Resend/SendGrid) pendente.
- **Diego não pode editar GTM v2 via UI até logout/login** — permission propagation Google. Workaround documentado.
- **Tags paused do ZeroHum (70+)**: legacy A/B testing — NÃO migrar pra v2.
- **Quora**: HTML manual (sem template Gallery oficial). Diego decide se vale ou descarta.
