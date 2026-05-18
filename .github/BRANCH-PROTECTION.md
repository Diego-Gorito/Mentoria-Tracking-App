# Branch Protection — Diego TODO (manual via UI)

Configurar em: https://github.com/Diego-Gorito/Mentoria-Tracking-App/settings/branches

## Regra para `main`

| Setting | Valor recomendado |
|---|---|
| Require a pull request before merging | ON |
| Required approvals | 0 (solo dev, sem bloqueio) |
| Require status checks to pass | ON |
| Required status checks | `build` (job do ci.yml) |
| Require branches to be up to date | ON |
| Allow force pushes | OFF |
| Allow deletions | OFF |

## Quando ativar

Ativar assim que o primeiro CI rodar verde (apos wrangler login + primeiro push CI).
Durante Era 1 solo: opcional — mas protege de push acidental em main.

## GitHub Actions secrets necessarios (para CI completo)

Quando quiser CI com wrangler deploy real (nao apenas dry-run):
- `CLOUDFLARE_API_TOKEN` — token com permissao `Workers Scripts:Edit`
- `CLOUDFLARE_ACCOUNT_ID` — `02642f60012f1a8d7779ca6d89815f39`

Adicionar em: Settings -> Secrets and variables -> Actions -> New repository secret
