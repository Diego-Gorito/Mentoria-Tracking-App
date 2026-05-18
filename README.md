# Mentoria Tracking App

Frontend SaaS multi-tenant para o sistema de tracking server-side Mentoria.
Status: **MVP Scaffolding** — nao usar em producao.

## Stack

| Camada | Tech |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5.5 |
| Estilo | Tailwind CSS 3.4 + Design System Mentoria (tokens ERP 1:1) |
| API Backend | Hono + Node.js (`@hono/node-server`) |
| Deploy frontend | Easypanel KV8 — nginx container |
| Deploy backend | Easypanel KV8 — Node.js container |
| Backend data | Postgres KV2 (Hostinger) + n8n + sGTM — repo Mentoria-Tracking |

## Quickstart

```bash
# 1. Instalar dependencias
cd ~/Dev/Mentoria-Tracking-App
npm install

# 2. Frontend (localhost:5173)
npm run dev

# 3. API Node.js local (localhost:3000)
PORT=3000 npx tsx workers/api/index.ts

# 4. Build producao (Vite)
npm run build
```

## Design tokens

Tokens copiados 1:1 do ERP-Mentoria (DESIGN.md v1.3).
Fonte de verdade para design system:
- `/Users/gorito/Dev/ERP-Mentoria/tailwind.config.ts`
- `/Users/gorito/Dev/ERP-Mentoria/src/styles/globals.css`
- `/Users/gorito/Dev/Mentoria-Tracking/docs/design-system-extract/` (Uma criando em paralelo)

## Links

- Plano produto: `/Users/gorito/.claude/plans/vai-ser-um-produto-logical-candy.md`
- ADR-006 Tracking SaaS: `.aiox-core/development/decisions/` (backend repo)
- Backend tracking: `/Users/gorito/Dev/Mentoria-Tracking/`
- ERP Mentoria (boilerplate source): `/Users/gorito/Dev/ERP-Mentoria/`

## Estrutura

```
src/
  components/
    ui/          # Button, KpiCard, StatusBadge, Toast, ConfirmDialog, EmptyState, Logo, ...
    layout/      # AppShell, Sidebar, Topbar, MobileSidebar
  routes/
    auth/        # Login, Signup, MagicLink
    onboarding/  # Wizard (5 steps)
    dashboard/   # Dashboard (6 KPIs + 3 charts + 2 tables)
    settings/    # Integrations (6 plataformas)
  lib/
    api.ts       # Cliente fetch para /api/*
    auth.ts      # JWT localStorage storage
    theme.tsx    # ThemeProvider dark/light
    utils.ts     # cn, formatCurrency, formatDate, maskToken
  hooks/
    useTenant.ts              # Tenant do JWT
    useTenantFromHostname.ts  # Resolve tenant pelo hostname (pre-login)
    useCredentials.ts         # Lista credenciais do tenant
    useAnalytics.ts           # KPIs do dashboard
workers/
  api/
    index.ts     # Hono router com stubs de todas as rotas (Node.js via @hono/node-server)
  Dockerfile     # Container backend (node:22-alpine + tsx)
Dockerfile       # Container frontend (node:22-alpine builder + nginx:alpine serve)
nginx.conf       # nginx SPA config + proxy /api/ → tracking-api:3000
```

## Deploy — Easypanel KV8

Compose YAMLs em `/Users/gorito/Dev/Mentoria-Tracking/infra/easypanel/`:

| Compose | Servico Easypanel | Porta | Dominio |
|---|---|---|---|
| `tracking-app-compose.yml` | tracking-app | 80 (nginx) | a definir |
| `tracking-api-compose.yml` | tracking-api | 3000 (Node.js) | sem dominio publico (proxy interno) |

### Sequencia de deploy (Pax via tRPC API Easypanel)

```bash
# Pax cria servicos via curl tRPC — nao clicar UI manualmente
# Ver .aiox-core/development/tasks/ pra task formal de deploy
```

### Secrets (via aba Environment do Easypanel — nao commitar)

```
DATABASE_URL_OWNER  — postgres://tracking_writer:<pass>@69.62.102.49:6543/mentoria-tracking
JWT_SECRET          — 32+ chars random
VAULT_KEY           — pgcrypto master key
RESEND_API_KEY      — Resend API key pra magic-link emails
INTERNAL_API_KEY    — shared secret /api/internal/creds (n8n → API)
```

## CI

GitHub Actions em `.github/workflows/ci.yml`:
- Roda em todo push/PR em `main`
- Jobs: `npm ci` + `npm run build` (Vite)

## TODOs por sprint

### Sprint 1 — Auth
- [ ] `POST /api/auth/signup` — bcrypt + JWT HS256
- [ ] `POST /api/auth/login`
- [ ] `POST /api/auth/magic-link` + verify — Resend email
- [ ] Conexao real Postgres KV2 (pg/postgres.js)
- [ ] `GET /api/tenants/resolve` — query real

### Sprint 2 — Credentials + Integrations
- [ ] `GET/POST /api/credentials/:tenantId` — pgcrypto vault
- [ ] `POST /api/test/:platform` — test connection pra 6 plataformas
- [ ] Modal de configuracao por plataforma no frontend
- [ ] Onboarding wizard steps 1-5 reais

### Sprint 3 — Dashboard
- [ ] `POST /api/query/kpi_summary` — query analytics.* views
- [ ] Integrar Recharts/Nivo pra 3 charts
- [ ] Tabela leads recentes (PII mascarada)
- [ ] Tabela dead-letter dispatches

### Era 2+
- [ ] Router com history API (TanStack Router)
- [ ] RLS Postgres real por tenant
- [ ] Custom domains por tenant
- [ ] Multi-usuario por tenant
- [ ] HttpOnly cookies pra JWT
- [ ] Avaliar retorno ao CDN edge (Cloudflare/Bunny) se latencia KV8 insuficiente
