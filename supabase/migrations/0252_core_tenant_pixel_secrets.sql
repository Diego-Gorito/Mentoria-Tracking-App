-- 0252_core_tenant_pixel_secrets
-- ADR-0009 §3.6 — Pixel IDs per-tenant. NÃO usam Vault (são públicos no DOM).
-- Substituem placeholders PIXEL_NAO_DEFINIDO nas vars [CT] do container clonado.
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

CREATE TABLE core.tenant_pixel_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN (
    'meta',
    'ga4_web', 'ga4_server',
    'bing',
    'x', 'reddit', 'pinterest', 'snap', 'quora',
    'clarity', 'tiktok', 'linkedin', 'taboola', 'outbrain',
    'google_ads_conversion', 'google_ads_remarketing'
  )),
  pixel_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, platform)
);

COMMENT ON TABLE core.tenant_pixel_secrets IS
  'ADR-0009 §3.6: pixel IDs per-tenant pra parametrizar vars [CT] do container GTM clonado. enabled=false marca plataforma desativada (não substitui placeholder).';

CREATE INDEX idx_tps_tenant ON core.tenant_pixel_secrets(tenant_id);

CREATE TRIGGER set_tenant_pixel_secrets_updated_at
  BEFORE UPDATE ON core.tenant_pixel_secrets
  FOR EACH ROW
  EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.tenant_pixel_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tps_select_own_tenant" ON core.tenant_pixel_secrets
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "tps_modify_own_tenant_admin" ON core.tenant_pixel_secrets
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid())
        AND status = 'active'
        AND role IN ('gestor', 'app_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid())
        AND status = 'active'
        AND role IN ('gestor', 'app_admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON core.tenant_pixel_secrets TO authenticated;
