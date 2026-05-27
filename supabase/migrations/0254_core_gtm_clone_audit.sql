-- 0254_core_gtm_clone_audit
-- ADR-0009 §4.5 — Audit log de provision/republish/rollback/delete.
-- step trackeia onde clone parou em caso de falha (suporta resume).
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

CREATE TABLE core.gtm_clone_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES core.tenants(id),                -- nullable: pode falhar antes de associar tenant
  master_version_id uuid REFERENCES core.gtm_master_versions(id),
  action text NOT NULL CHECK (action IN ('provision', 'republish', 'rollback', 'delete', 'resume')),
  step text,                                                  -- 'init','clone_web','clone_server','parametrize','link','publish_web','publish_server','persist','complete'
  status text NOT NULL CHECK (status IN ('success', 'failed', 'retrying', 'in_progress')),
  request_id text,                                            -- correlation com /api/* requestId
  duration_ms integer,
  error jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,                         -- payload arbitrário (web_container_id criado, qual var falhou, etc)
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.gtm_clone_audit IS
  'ADR-0009 §4.5: log append-only de ações no clone GTM. Permite: (1) resume de clones interrompidos via último step com status=success, (2) janitor identificar containers órfãos, (3) debugging produção.';

CREATE INDEX idx_gca_tenant ON core.gtm_clone_audit(tenant_id, created_at DESC);
CREATE INDEX idx_gca_status ON core.gtm_clone_audit(status, created_at DESC);
CREATE INDEX idx_gca_request ON core.gtm_clone_audit(request_id) WHERE request_id IS NOT NULL;

ALTER TABLE core.gtm_clone_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gca_select_own_tenant_admin" ON core.gtm_clone_audit
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid())
        AND status = 'active'
        AND role IN ('gestor', 'app_admin')
    )
  );
-- Write: só service_role
GRANT SELECT ON core.gtm_clone_audit TO authenticated;
