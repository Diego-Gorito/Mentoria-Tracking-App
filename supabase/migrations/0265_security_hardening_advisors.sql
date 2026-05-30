-- 0265_security_hardening_advisors.sql
-- Hardening de segurança a partir do get_advisors(security) — dados das escolas
-- não podem correr risco (SaaS multi-tenant de alto padrão).
--
-- 1. Remove tabelas de RESULTADO de teste pgTAP que ficaram no schema public SEM
--    RLS, expostas via PostgREST (advisor ERROR rls_disabled_in_public). São lixo
--    de teste — não usadas em runtime.
DROP TABLE IF EXISTS public._pgtap_gaps_results;
DROP TABLE IF EXISTS public._pgtap_0230_results;

-- 2. Fecha a materialized view de leads pra acesso direto via Data API. MV não
--    suporta RLS — se selecionável por anon/authenticated, um JWT de qualquer
--    escola poderia ler leads de TODAS via /rest/v1 (vazamento cross-tenant).
--    O backend acessa via service_role (analytics.ts), que NÃO é afetado pelo
--    revoke. Defense-in-depth mesmo com PII já mascarada na MV.
--    (advisor WARN materialized_view_in_api)
REVOKE SELECT ON analytics.leads_quentes_safe_mv FROM anon, authenticated;
