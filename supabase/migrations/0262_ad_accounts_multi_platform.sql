-- 0262_ad_accounts_multi_platform.sql
-- @see docs/adr-0011 — Decisão 5 (contas de anúncio multi-plataforma, boundary read-only)
--
-- Modelo: TENANT (escola) 1:N AD_ACCOUNTS. Uma escola pode ter várias contas de
-- anúncio, em várias plataformas (N contas Meta + Google + TikTok + ...). O tracking
-- agrega o custo de TODAS sob a escola. A escola escolhe quais conectar (opcional,
-- igual aos canais do #74).
--
-- BOUNDARY DE SEGURANÇA: o tracking é READ-ONLY sobre ad platforms — só puxa
-- custo/insights (get_ad_entities, insights_*). NUNCA cria/ativa/publica campanha
-- (isso GASTA dinheiro e é função do app de postagens/gestão). Alinha com a regra
-- dura de não executar gastos/transações autônomas.

CREATE TABLE IF NOT EXISTS tracking.ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  brand_slug          text,
  platform            text NOT NULL,            -- 'meta','google','tiktok','pinterest','bing',...
  external_account_id text NOT NULL,            -- ID da conta na plataforma (ex Meta act id)
  account_name        text,
  currency            text NOT NULL DEFAULT 'BRL',
  status              text NOT NULL DEFAULT 'connected',  -- connected | paused | disconnected
  connected_at        timestamptz NOT NULL DEFAULT now(),
  last_synced_at      timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- uma conta pertence a UM tenant (não compartilhada entre escolas)
  CONSTRAINT ad_accounts_platform_ext_uq UNIQUE (platform, external_account_id)
);

CREATE INDEX IF NOT EXISTS ad_accounts_tenant_idx ON tracking.ad_accounts (tenant_id);

ALTER TABLE tracking.ad_accounts ENABLE ROW LEVEL SECURITY;

-- RLS replicando o padrão das outras tabelas tracking (core.current_tenant_id()).
-- service_role bypassa RLS (sync roda como service_role).
CREATE POLICY tenant_isolation_select ON tracking.ad_accounts
  FOR SELECT USING (tenant_id = core.current_tenant_id());
CREATE POLICY tenant_isolation_insert ON tracking.ad_accounts
  FOR INSERT WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY tenant_isolation_update ON tracking.ad_accounts
  FOR UPDATE USING (tenant_id = core.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON tracking.ad_accounts TO authenticated;
GRANT ALL ON tracking.ad_accounts TO service_role;

-- Idempotência do sync de custo: 1 linha de campanha por (platform, campaign_external_id).
-- Permite UPSERT do spend sem duplicar campanhas a cada sync.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_platform_external_uq
  ON tracking.campaigns (platform, campaign_external_id)
  WHERE campaign_external_id IS NOT NULL;

COMMENT ON TABLE tracking.ad_accounts IS
  'Contas de anúncio de cada escola (tenant 1:N, multi-plataforma). Tracking é READ-ONLY: só puxa custo/insights, nunca publica. @see docs/adr-0011 Decisao 5.';
