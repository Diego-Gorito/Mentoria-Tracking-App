-- 0255_gtm_master_v0_3_gallery_updates
-- Marca v0.2 como não-corrente + insere v0.3 capturando 5 Gallery templates updates.
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

UPDATE core.gtm_master_versions SET is_current = false WHERE version_name = 'v0.2';

INSERT INTO core.gtm_master_versions
(version_name, web_master_container_id, web_master_internal_id, web_master_version_id,
 server_master_container_id, server_master_internal_id, server_master_version_id,
 snapshot_at, notes, is_current)
VALUES (
  'v0.3',
  'GTM-WLZ3H8VH', '253664662', '2',
  'GTM-KLDMV2VH', '253664663', '2',
  now(),
  '5 Gallery templates atualizados: Meta Pixel (Facebook unofficial→Meta official 52 changes), cyrb53 Hasher (4), Microsoft Clarity Official (6), TikTok Pixel (19), Unique Event ID (4). Tags Meta Ads PageView validadas renderizando OK pós-update.',
  true
);
