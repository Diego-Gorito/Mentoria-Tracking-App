// jwt.ts — DESCARTADO (Fase 3 — ADR-0007 v1.2 Supabase rebase)
//
// Supabase Auth emite e valida JWTs via JWKS endpoint.
// Verificacao agora em middleware.ts via supabase.auth.getUser(token).
// Este arquivo mantido como stub vazio para nao quebrar imports legados
// que possam existir; os imports reais foram migrados para middleware.ts.
//
// IMPORTANTE: nao usar signToken() nem verifyToken() — estao removidos.
// Auth agora e 100% Supabase Auth SDK.

export {}
