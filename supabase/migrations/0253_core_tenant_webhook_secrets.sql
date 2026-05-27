-- 0253_core_tenant_webhook_secrets
-- ADR-0009 §3.6 — Webhook secrets (HMAC) per-tenant pra Kiwify/Kirvano/Stripe.
-- DIFERENTE de pixel_secrets: estes SÃO secretos. Vão pra Supabase Vault.
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

CREATE TABLE core.tenant_webhook_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('kiwify', 'kirvano', 'stripe', 'hotmart', 'eduzz')),
  secret_vault_id uuid NOT NULL REFERENCES vault.secrets(id) ON DELETE RESTRICT,
  webhook_url text,                                          -- URL final no sGTM, ex: 'https://sgtm.colegiomentoria.com.br/mentoria/kiwify'
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

COMMENT ON TABLE core.tenant_webhook_secrets IS
  'ADR-0009 §3.6: HMAC secrets pra validar webhooks Kiwify/Kirvano/Stripe. Secret vai pra vault.secrets, aqui só FK. webhook_url é a URL configurada na plataforma de checkout.';

CREATE INDEX idx_tws_tenant ON core.tenant_webhook_secrets(tenant_id);

CREATE TRIGGER set_tenant_webhook_secrets_updated_at
  BEFORE UPDATE ON core.tenant_webhook_secrets
  FOR EACH ROW
  EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.tenant_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tws_select_own_tenant_admin" ON core.tenant_webhook_secrets
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid())
        AND status = 'active'
        AND role IN ('gestor', 'app_admin')
    )
  );
-- Write: só service_role
GRANT SELECT ON core.tenant_webhook_secrets TO authenticated;
