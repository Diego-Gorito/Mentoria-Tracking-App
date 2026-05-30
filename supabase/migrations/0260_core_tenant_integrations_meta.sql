-- 0260_core_tenant_integrations_meta
-- Conector Meta (Facebook) Ads via "System User Token paste" (MVP sem OAuth).
-- Guarda a conexão Meta per-tenant: token cifrado (libsodium sealed_box),
-- ad account + pixel selecionados. UNIQUE(tenant_id) = 1 conexão Meta por tenant.
--
-- token_encrypted NUNCA fica em plaintext — cifrado com sealEncrypt() (mesma
-- crypto do Hostinger PAT, workers/lib/storage/crypto.ts). Pixel ID resultante
-- é escrito na var [CT] [Meta Ads] Pixel ID do container GTM via republish.
--
-- RLS + grants espelham core.tenant_containers (0251) + core.tenant_pixel_secrets
-- (0252): authenticated SELECT scoped ao próprio tenant via subquery em
-- core.tenant_users; writes só service_role (backend usa supabaseAdmin).
--
-- Rodar via apply_migration no project cjtwrzlwfqvzukjinmjr.

CREATE TABLE core.tenant_integrations_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  token_encrypted text NOT NULL,            -- libsodium sealed System User token (NUNCA plaintext)
  business_id text,                         -- Meta Business Manager ID
  ad_account_id text,                       -- ad account selecionada (act_XXXXXXXX)
  pixel_id text,                            -- pixel selecionado (= var [CT] [Meta Ads] Pixel ID)
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'invalid', 'revoked')),
  connected_by uuid,                        -- auth.users.id que conectou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

COMMENT ON TABLE core.tenant_integrations_meta IS
  'Conexão Meta Ads per-tenant via System User Token paste (MVP sem OAuth). token_encrypted = libsodium sealed_box. status=connected ready; invalid = token rejeitado (190); revoked = desconectado pelo cliente.';

CREATE INDEX idx_tim_tenant ON core.tenant_integrations_meta(tenant_id);
CREATE INDEX idx_tim_status ON core.tenant_integrations_meta(status);

CREATE TRIGGER set_tenant_integrations_meta_updated_at
  BEFORE UPDATE ON core.tenant_integrations_meta
  FOR EACH ROW
  EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.tenant_integrations_meta ENABLE ROW LEVEL SECURITY;

-- RLS SELECT: tenant_users com vínculo ativo veem a conexão do próprio tenant.
-- (Mesmo predicado de tc_select_own_tenant em 0251.) Note que o token_encrypted
-- ainda aparece pra quem tem SELECT — o backend NUNCA o retorna pro client, mas
-- defense-in-depth: writes são service_role-only e o frontend só fala via API.
CREATE POLICY "tim_select_own_tenant" ON core.tenant_integrations_meta
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM core.tenant_users
      WHERE user_id = (SELECT auth.uid()) AND status = 'active'
    )
  );

-- Write: sem policy permissive pra authenticated = bloqueado. Apenas service_role
-- (que bypassa RLS) faz INSERT/UPDATE/DELETE via supabaseAdmin no backend.
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tenant_integrations_meta TO service_role;
GRANT SELECT ON core.tenant_integrations_meta TO authenticated;

-- Sequence grant (lição da migration 0259): a PK usa gen_random_uuid(), então
-- não há sequence dedicada hoje. Mantido por consistência/futuro-proofing caso
-- alguma coluna serial seja adicionada — no-op se não houver sequences.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO service_role;
