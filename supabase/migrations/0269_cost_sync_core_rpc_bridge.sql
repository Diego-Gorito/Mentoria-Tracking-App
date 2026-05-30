-- 0269_cost_sync_core_rpc_bridge.sql
-- @see docs/adr-0011 §5b — acesso ao cost-sync via RPC em core (schema exposto),
-- SEM expor o schema tracking ao PostgREST (menor superfície, dados de escola seguros).
--
-- O backend (supabase-js) só enxerga schemas expostos (core, analytics). tracking.*
-- NÃO é exposto. Estas funções core SECURITY DEFINER fazem a ponte pro cost-sync,
-- e são EXECUTÁVEIS SÓ POR service_role (revogadas de anon/authenticated) — crítico,
-- pois cost_sync_accounts retorna o token cifrado: um authenticated jamais pode chamar.

-- 1. Lista contas conectadas (todas, ou de 1 tenant) com o token cifrado.
CREATE OR REPLACE FUNCTION core.cost_sync_accounts(p_tenant uuid DEFAULT NULL)
RETURNS TABLE(tenant_id uuid, platform text, external_account_id text, brand_slug text, token_encrypted text)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT a.tenant_id, a.platform, a.external_account_id, a.brand_slug, a.token_encrypted
  FROM tracking.ad_accounts a
  WHERE a.status = 'connected'
    AND (p_tenant IS NULL OR a.tenant_id = p_tenant);
$$;

-- 2. Upsert idempotente de custo (escreve tracking.campaigns via a função existente).
CREATE OR REPLACE FUNCTION core.cost_sync_upsert_cost(
  p_tenant uuid, p_brand text, p_platform text, p_account_id text,
  p_external_campaign_id text, p_campaign_name text, p_cost_cents bigint, p_currency text DEFAULT 'BRL'
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT tracking.upsert_campaign_cost(
    p_tenant, p_brand, p_platform, p_account_id,
    p_external_campaign_id, p_campaign_name, p_cost_cents, p_currency
  );
$$;

-- 3. Marca last_synced_at de uma conta.
CREATE OR REPLACE FUNCTION core.cost_sync_mark_synced(p_tenant uuid, p_platform text, p_account_id text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  UPDATE tracking.ad_accounts SET last_synced_at = now()
  WHERE tenant_id = p_tenant AND platform = p_platform AND external_account_id = p_account_id;
$$;

-- 4. Grava auditoria de uma execução.
CREATE OR REPLACE FUNCTION core.cost_sync_log_run(
  p_started timestamptz, p_trigger text, p_tenants int, p_campaigns int,
  p_ok boolean, p_detail jsonb, p_error text
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  INSERT INTO tracking.cost_sync_runs (started_at, finished_at, trigger, tenants, campaigns_upserted, ok, detail, error)
  VALUES (p_started, now(), p_trigger, COALESCE(p_tenants,0), COALESCE(p_campaigns,0), COALESCE(p_ok,false), COALESCE(p_detail,'{}'::jsonb), p_error);
$$;

-- SEGURANÇA: revogar de todos e conceder SÓ a service_role (o backend).
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'core.cost_sync_accounts(uuid)',
    'core.cost_sync_upsert_cost(uuid,text,text,text,text,text,bigint,text)',
    'core.cost_sync_mark_synced(uuid,text,text)',
    'core.cost_sync_log_run(timestamptz,text,int,int,boolean,jsonb,text)'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
