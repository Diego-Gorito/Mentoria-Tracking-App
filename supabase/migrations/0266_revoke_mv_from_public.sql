-- 0266_revoke_mv_from_public.sql
-- Complementa 0265: o REVOKE de authenticated não bastou porque o SELECT na MV
-- vinha de um grant a PUBLIC (todo role herda). Revoga de PUBLIC e re-garante o
-- acesso só ao backend (service_role). Fecha o vetor cross-tenant via /rest/v1.

REVOKE SELECT ON analytics.leads_quentes_safe_mv FROM PUBLIC;
GRANT SELECT ON analytics.leads_quentes_safe_mv TO service_role;
