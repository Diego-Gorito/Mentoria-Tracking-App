# Mentoria Tracking App

Frontend SaaS multi-tenant para o sistema de tracking server-side Mentoria.
Status: **MVP Scaffolding** — nao usar em producao.

## Stack

| Camada | Tech |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5.5 |
| Estilo | Tailwind CSS 3.4 + Design System Mentoria (tokens ERP 1:1) |
| Edge Functions | Cloudflare Workers + Hono |
| Deploy frontend | Cloudflare Pages |
| Deploy worker | Cloudflare Workers |
| Backend data | Postgres KV2 (Hostinger) + n8n + sGTM — repo Mentoria-Tracking |

## Quickstart

```bash
# 1. Instalar dependencias
cd ~/Dev/Mentoria-Tracking-App
npm install

# 2. Frontend (localhost:5173)
npm run dev

# 3. Worker API (localhost:8787) — em outro terminal
npm run dev:worker

# 4. Ambos ao mesmo tempo
npm run dev:all

# 5. Build producao
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
- ADR-006 Tracking SaaS: criado por Aria em paralelo (verificar `.aiox-core/development/decisions/`)
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
    api.ts       # Cliente fetch para Worker /api/*
    auth.ts      # JWT localStorage storage
    theme.tsx    # ThemeProvider dark/light
    utils.ts     # cn, formatCurrency, formatDate, maskToken
  hooks/
    useTenant.ts         # Tenant do JWT
    useTenantFromHostname.ts  # Resolve tenant pelo hostname (pre-login)
    useCredentials.ts    # Lista credenciais do tenant
    useAnalytics.ts      # KPIs do dashboard
workers/
  api/
    index.ts     # Hono router com stubs de todas as rotas
wrangler.toml    # Config Cloudflare Workers
```

## TODOs por sprint

### Sprint 1 — Auth
- [ ] `POST /api/auth/signup` — bcrypt + JWT HS256
- [ ] `POST /api/auth/login`
- [ ] `POST /api/auth/magic-link` + verify — Resend email
- [ ] Provisionar Hyperdrive (CF) -> Postgres KV2
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
- [ ] Router com history API (react-router ou TanStack Router)
- [ ] RLS Postgres real por tenant
- [ ] Custom domains por tenant
- [ ] Multi-usuario por tenant
- [ ] HttpOnly cookies pra JWT
