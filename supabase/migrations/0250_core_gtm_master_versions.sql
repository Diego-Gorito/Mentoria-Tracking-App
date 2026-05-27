-- 0250_core_gtm_master_versions
-- ADR-0009 §4.2 — Track de master snapshots do GTM Master V2.
-- Cada create_version no master (web/server) vira row aqui.
-- is_current = true marca a versão alvo de novos provisions.
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

CREATE TABLE core.gtm_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL UNIQUE,                          -- 'v0.2'
  web_master_container_id text NOT NULL,                      -- 'GTM-WLZ3H8VH'
  web_master_internal_id text NOT NULL,                       -- '253664662'
  web_master_workspace_id text NOT NULL DEFAULT '2',
  web_master_version_id text NOT NULL,                        -- GTM version ID (ex: '2')
  server_master_container_id text NOT NULL,                   -- 'GTM-KLDMV2VH'
  server_master_internal_id text NOT NULL,                    -- '253664663'
  server_master_workspace_id text NOT NULL DEFAULT '2',
  server_master_version_id text NOT NULL,
  snapshot_at timestamptz NOT NULL,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.gtm_master_versions IS
  'ADR-0009 §4.2: versionamento de master containers GTM. Cada row = snapshot via API create_version. is_current=true alvo de provisions. Append-only (não DELETE).';

CREATE INDEX idx_gmv_current ON core.gtm_master_versions(is_current) WHERE is_current = true;
CREATE UNIQUE INDEX idx_gmv_only_one_current ON core.gtm_master_versions((1)) WHERE is_current = true;

-- Bootstrap row pra estado atual (v0.2 web + v0.2 server)
INSERT INTO core.gtm_master_versions
(version_name, web_master_container_id, web_master_internal_id, web_master_version_id,
 server_master_container_id, server_master_internal_id, server_master_version_id,
 snapshot_at, notes, is_current)
VALUES (
  'v0.2',
  'GTM-WLZ3H8VH', '253664662', '2',
  'GTM-KLDMV2VH', '253664663', '2',
  '2026-05-28 14:00:00+00',
  '+22 tags base 5 plataformas Gallery (X/Reddit/Pinterest/Snap + Bing UET) + 2 Custom Clients Kiwify/Kirvano MVP',
  true
);

GRANT SELECT ON core.gtm_master_versions TO authenticated;
ALTER TABLE core.gtm_master_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmv_select_all_authenticated" ON core.gtm_master_versions
  FOR SELECT TO authenticated
  USING (true);
-- Write: só service_role (sem policy = bloqueado pra demais)
