# GTM API Scripts — Master V2

Scripts pra interagir com Tag Manager API via Service Account
`tracking-claude-sa@n8n-integrar-gmail-sheet-drive.iam.gserviceaccount.com`.

## Setup

1. SA JSON key: `/Volumes/SSD 2T/Dev/tracking-claude-sa.json` (FORA do repo)
2. Permissão: **Administrador** da conta `6059193756` (GTM | Colégio Mentoria)
3. Scopes mínimos:
   - `https://www.googleapis.com/auth/tagmanager.edit.containers`
   - `https://www.googleapis.com/auth/tagmanager.edit.containerversions`
   - `https://www.googleapis.com/auth/tagmanager.publish`
   - `https://www.googleapis.com/auth/tagmanager.readonly`

## Containers

| Container | Public ID | Internal | Workspace |
|---|---|---|---|
| Master Web V2 | `GTM-WLZ3H8VH` | 253664662 | 2 |
| Master Server V2 | `GTM-KLDMV2VH` | 253664663 | 2 |

## Scripts

### `create_v2_tags.py`
Cria batch inicial de tags base + eventos no WEB V2.
Cobertura: Bing UET (4), Quora extras (3), além de tentativa Twitter/Reddit/Pinterest/Snap
(que falhou na 1ª rodada por cvt_id errado — fix em `create_v2_tags_retry.py`).

### `create_v2_tags_retry.py`
Cria 15 tags com `cvt_{galleryTemplateId}` correto (não `cvt_{containerId}_{templateId}`):
- Twitter Base: `cvt_PBZB3`
- Twitter Event: `cvt_5D4TS`
- Reddit: `cvt_PBGZL`
- Pinterest: `cvt_NGMPN`
- Snap: `cvt_K4VXG`

**Regra descoberta:** templates Gallery puros (sem mod) usam `cvt_{galleryTemplateId}` como tag type. Templates customizados usam `cvt_{containerId}_{internalId}`.

## Triggers usados (existentes)

| ID | Nome | Tipo |
|---|---|---|
| 85 | DOM Ready \| Todas | domReady |
| 88 | Primeiro page_view | customEvent |
| 87 | Envio Form | customEvent |
| 65 | sign_up | customEvent |
| 80 | purchase | customEvent |
| 81 | begin_checkout | customEvent |
| 82 | view_content | customEvent |

## Vars per-tenant (placeholders)

Todas com valor inicial `PIXEL_NAO_DEFINIDO` — substituir no provision endpoint.

| Var | Container |
|---|---|
| `[CT] [Bing UET] Tag ID` | web |
| `[CT] [X Ads] Pixel ID` | web |
| `[CT] [Reddit] Pixel ID` | web |
| `[CT] [Pinterest] Tag ID` | web |
| `[CT] [Pinterest] Advertiser ID (server)` | web (futuro server) |
| `[CT] [Snap] Pixel ID` | web |
| `[CT] [Quora] Pixel ID` | web |
| `[CT] [Kiwify] Webhook Secret` | server |
| `[CT] [Kiwify] Endpoint URL` | server |
| `[CT] [Kirvano] Webhook Secret` | server |
| `[CT] [Kirvano] Endpoint URL` | server |

## Commands úteis

```bash
# Listar tags do WEB V2
python3 -c "
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
creds = service_account.Credentials.from_service_account_file(
    '/Volumes/SSD 2T/Dev/tracking-claude-sa.json',
    scopes=['https://www.googleapis.com/auth/tagmanager.readonly'])
sess = AuthorizedSession(creds)
r = sess.get('https://tagmanager.googleapis.com/tagmanager/v2/accounts/6059193756/containers/253664662/workspaces/2/tags').json()
for t in r.get('tag', []): print(t['name'])
"

# Criar version (snapshot) — requer scope edit.containerversions
python3 -c "
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
creds = service_account.Credentials.from_service_account_file(
    '/Volumes/SSD 2T/Dev/tracking-claude-sa.json',
    scopes=['https://www.googleapis.com/auth/tagmanager.edit.containerversions'])
sess = AuthorizedSession(creds)
r = sess.post(
    'https://tagmanager.googleapis.com/tagmanager/v2/accounts/6059193756/containers/253664662/workspaces/2:create_version',
    json={'name': 'v0.X — desc', 'notes': '...'})
print(r.json())
"
```
