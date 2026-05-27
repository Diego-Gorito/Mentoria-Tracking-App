# GTM Master V2 — Status

> Atualizado: 2026-05-28

## Snapshot

| Container | Public ID | Tags | Vars | Triggers | Templates | Versão atual |
|---|---|---:|---:|---:|---:|---|
| Master Web V2 | `GTM-WLZ3H8VH` | 51 | 60 | 14 | 14 | **v0.2** (ID 2) |
| Master Server V2 | `GTM-KLDMV2VH` | 11 | 30 | 9 | 6 | **v0.1** (ID 2) |

## Tags por plataforma (WEB V2)

| Plataforma | Total | Active | Paused | Notas |
|---|---:|---:|---:|---|
| GA4 | 9 | 9 | 0 | config + 8 eventos |
| Meta Ads | 8 | 8 | 0 | Padrão completo |
| HTML | 8 | 8 | 0 | Cookies, DataLayer, CF7 helpers |
| **X (Twitter)** | **5** | 0 | 5 | Base + Lead+Purchase+InitiateCheckout+CompleteReg |
| **Snap** | **4** | 0 | 4 | Base + SignUp+AddCart+Purchase |
| **Bing UET** | **4** | 0 | 4 | Base + Lead+Purchase+Contact |
| **Quora** | **4** | 0 | 4 | Base + Lead+Purchase+ViewContent |
| **Reddit** | **3** | 0 | 3 | Base + Lead+Purchase |
| **Pinterest** | **3** | 0 | 3 | Base + Lead+Checkout |
| Clarity | 1 | 1 | 0 | Microsoft Clarity Official |
| Visitor API | 1 | 1 | 0 | VisitorAPI Geo |
| CF7 | 1 | 1 | 0 | Listener Contact Form 7 |

**22 tags novas** criadas em 2026-05-28 (todas paused aguardando parametrização real
dos pixel IDs por tenant).

## Tags SERVER V2 (11)

- `n8n Forward — All Events` (http_request)
- Meta Ads: API + Conversão purchase (2)
- Google Ads: Remarketing, Conversão Form, Conversão WhatsApp, Conversão purchase,
  Vinculador, Dados de Usuários (6)
- GA4: API + Evento purchase (2)

## Pendências críticas

### #1 — Pixel IDs reais
Todas as 22 tags novas usam vars com placeholder `PIXEL_NAO_DEFINIDO`.
Diego precisa:
1. Confirmar quais plataformas ativar de fato (algumas podem ficar paused permanente)
2. Fornecer Pixel ID real OU instruir "criar conta na plataforma quando ativar"

### #2 — Kiwify / Kirvano (SERVER V2)
Decisão arquitetural pendente:

| Opção | Vantagens | Desvantagens |
|---|---|---|
| **A. Backend Hono receiver** | Full controle, logging, retry, per-tenant secrets DB | Mais código próprio |
| **B. GTM Server Custom Client** | Stack puro GTM, versionado no container | Custom Client TS via API é trabalho substancial |

**Recomendação: A** (mais robusto, escalável, integra com infra existente).

Webhook endpoints:
- `POST /api/webhooks/kiwify/:tenant_slug` → valida HMAC `X-Kiwify-Signature`
- `POST /api/webhooks/kirvano/:tenant_slug` → valida HMAC `X-Kirvano-Signature`
- Forward eventos pra Meta CAPI + GA4 Measurement Protocol + GTM server (opcional)

### #3 — Publicar versão Live
Atualmente versões v0.2 (web) e v0.1 (server) são **snapshots**, NÃO live.
Quando estiver pronto:
```
POST /accounts/6059193756/containers/{cid}/versions/{vid}:publish
```

### #4 — Event Coverage Audit (pós-WordPress install)
Quando container for clonado pra um tenant e WordPress instalado, validar:
- Todos os triggers (form submit, button click, purchase) realmente disparam
- Pixel events chegam nas plataformas (Pixel Helper, Event Manager, etc.)
- DataLayer push correto

Tracker: ADR-0010.

## Comandos de retomada

```bash
# Audit rápido WEB V2
python3 scripts/gtm/audit.py  # TODO criar este script

# Export atualizado
python3 -c "
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
import json
creds = service_account.Credentials.from_service_account_file(
    '/Volumes/SSD 2T/Dev/tracking-claude-sa.json',
    scopes=['https://www.googleapis.com/auth/tagmanager.readonly'])
sess = AuthorizedSession(creds)
for cid, public in [('253664662','GTM-WLZ3H8VH'),('253664663','GTM-KLDMV2VH')]:
    base = f'https://tagmanager.googleapis.com/tagmanager/v2/accounts/6059193756/containers/{cid}/workspaces/2'
    data = {k: sess.get(f'{base}/{k}').json().get(k[:-1], []) for k in ['tags','variables','triggers','templates']}
    with open(f'docs/gtm-exports/{public}.json','w') as f: json.dump(data,f,indent=2)
    print(f'{public}: tags={len(data[\"tags\"])}')"
```
