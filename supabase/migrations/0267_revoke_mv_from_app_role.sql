-- 0267_revoke_mv_from_app_role.sql
-- Fecha definitivamente o acesso de `authenticated` à MV de leads. Diagnóstico:
-- `authenticated` HERDA de `mentoria_tracking_role` (role de aplicação), e era ela
-- que tinha SELECT na MV no ACL — por isso 0265 (authenticated) e 0266 (PUBLIC) não
-- bastaram. service_role tem grant próprio no ACL e mantém acesso (backend OK).
-- Resultado esperado: has_table_privilege('authenticated', mv, 'SELECT') = false.

REVOKE SELECT ON analytics.leads_quentes_safe_mv FROM mentoria_tracking_role;
