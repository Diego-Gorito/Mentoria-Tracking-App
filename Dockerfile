# =============================================================================
# Mentoria Tracking App — Frontend (Vite + nginx)
# =============================================================================
# Multi-stage build:
#   Stage 1 (builder): node:22-alpine compila Vite → /app/dist
#   Stage 2 (runtime): nginx:alpine serve SPA estática na porta 80
#
# Decisão 2026-05-18: migrado de Cloudflare Pages → Easypanel KV8
# Ver: infra/easypanel/tracking-app-compose.yml
# =============================================================================

# ---- Stage 1: build Vite ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copiar manifests antes do código (camadas Docker mais estáveis)
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: nginx serve dist ----
FROM nginx:alpine

# Adicionar wget pro HEALTHCHECK (não vem por default em nginx:alpine)
# Sem isso, healthcheck falha → Docker marca unhealthy → Traefik retorna 502.
RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
