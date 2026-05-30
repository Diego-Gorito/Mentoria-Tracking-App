-- 0270_cost_sync_accounts_safe.sql
-- Versão SEM token pra a UI (/api/cost-sync/platforms): todas as contas do tenant.
-- service_role only (o backend filtra por ctx.tenantId). @see docs/adr-0011 §5b.

CREATE OR REPLACE FUNCTION core.cost_sync_accounts_safe(p_tenant uuid)
RETURNS TABLE(platform text, external_account_id text, account_name text, status text, last_synced_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT a.platform, a.external_account_id, a.account_name, a.status, a.last_synced_at
  FROM tracking.ad_accounts a WHERE a.tenant_id = p_tenant;
$$;

REVOKE EXECUTE ON FUNCTION core.cost_sync_accounts_safe(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION core.cost_sync_accounts_safe(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION core.cost_sync_accounts_safe(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION core.cost_sync_accounts_safe(uuid) TO service_role;
