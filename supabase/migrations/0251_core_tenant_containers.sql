-- 0251_core_tenant_containers
-- ADR-0009 §4.1 — Containers GTM per-tenant (web + server) na conta Diego.
-- UNIQUE(tenant_id) garante 1 par web+server por tenant. master_version_id
-- rastreia de qual snapshot foi clonado pra suportar diff sync.
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

CREATE TABLE core.tenant_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  gtm_account_id text NOT NULL,                              -- '6059193756'
  web_container_public_id text,                              -- 'GTM-XXXXXXX' (visível no snippet)
  web_container_internal_id text,                            -- '253XXXXXX'   (interno API)
  server_container_public_id text,
  server_container_internal_id text,
  master_version_id uuid REFERENCES core.gtm_master_versions(id),
  sgtm_url text,                                              -- 'https://sgtm.colegiomentoria.com.br/mentoria'
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cloning','linking','publishing','active','failed','archived')),
  failed_at_step text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

COMMENT ON TABLE core.tenant_containers IS
  'ADR-0009 §4.1: 1 par de containers GTM (web+server) por tenant. NA conta Diego (não cliente). status=active = ready pra produção. archived = tenant cancelou, containers deletados via janitor cron.';

CREATE INDEX idx_tc_status ON core.tenant_containers(status);
CREATE INDEX idx_tc_master_version ON core.tenant_containers(master_version_id);
CREATE INDEX idx_tc_account ON core.tenant_containers(gtm_account_id);

CREATE TRIGGER set_tenant_containers_updated_at
  BEFORE UPDATE ON core.tenant_containers
  FOR EACH ROW
  EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.tenant_containers ENABLE ROW LEVEL SECURITY;

-- RLS: tenant_users com vínculo ativo veem seus próprios containers
CREATE POLICY "tc_select_own_tenant" ON core.tenant_containers
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid()) AND status = 'active'
    )
  );

-- Write: só service_role (sem policy permissive = bloqueado pra demais)
GRANT SELECT ON core.tenant_containers TO authenticated;
