# =============================================================================
# Mentoria Tracking API — Backend (Hono + Node.js)
# =============================================================================
# Adaptado de Cloudflare Worker → Node.js via @hono/node-server em 2026-05-18
# Runtime: tsx (executa TypeScript direto, sem step de compilação)
# MVP usa tsx por simplicidade; Era 2 migra pra tsc + node se performance exigir.
#
# Ver: infra/easypanel/tracking-api-compose.yml
# =============================================================================

FROM node:22-alpine
WORKDIR /app

# Copiar manifests antes do código (camadas Docker mais estáveis)
COPY package*.json ./

# Era 1: deps no root package.json (sem monorepo). workers/ não tem package.json próprio.
# Era 2: se virar monorepo, adicionar `COPY workers/package*.json ./workers/` ANTES de npm ci.
RUN npm ci

COPY workers ./workers

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENV PORT=3000 \
    NODE_ENV=production

# tsx executa TypeScript direto sem compilação — adequado pra MVP
CMD ["npx", "tsx", "workers/api/index.ts"]
