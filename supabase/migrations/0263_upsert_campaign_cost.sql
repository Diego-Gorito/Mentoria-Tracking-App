-- 0263_upsert_campaign_cost.sql
-- @see docs/adr-0011 §5b — sync de custo multi-plataforma (READ-ONLY).
--
-- Upsert idempotente de custo de campanha (1 linha por platform+campaign_external_id).
-- Encapsula o ON CONFLICT no índice parcial campaigns_platform_external_uq (que o
-- PostgREST não infere sozinho). Chamada pelo orquestrador via supabase.rpc.

CREATE OR REPLACE FUNCTION tracking.upsert_campaign_cost(
  p_tenant               uuid,
  p_brand                text,
  p_platform             text,
  p_account_id           text,
  p_external_campaign_id text,
  p_campaign_name        text,
  p_cost_cents           bigint,
  p_currency             text DEFAULT 'BRL'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO tracking.campaigns (
    tenant_id, brand_slug, platform, account_id, campaign_external_id,
    utm_source, utm_campaign, cost_cents, cost_currency, cost_synced_at
  ) VALUES (
    p_tenant, p_brand, p_platform, p_account_id, p_external_campaign_id,
    p_platform, p_campaign_name, p_cost_cents, p_currency, now()
  )
  ON CONFLICT (platform, campaign_external_id) WHERE campaign_external_id IS NOT NULL
  DO UPDATE SET
    cost_cents     = EXCLUDED.cost_cents,
    cost_currency  = EXCLUDED.cost_currency,
    cost_synced_at = now(),
    utm_campaign   = EXCLUDED.utm_campaign,
    last_seen_at   = now()
  RETURNING campaign_id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION tracking.upsert_campaign_cost(
  uuid, text, text, text, text, text, bigint, text
) TO service_role;

COMMENT ON FUNCTION tracking.upsert_campaign_cost IS
  'Upsert idempotente de custo de campanha (platform+campaign_external_id). Chamado pelo cost-sync. @see docs/adr-0011 §5b.';
