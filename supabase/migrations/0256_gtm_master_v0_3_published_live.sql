-- 0256_gtm_master_v0_3_published_live
-- v0.3 PUBLICADO live em GTM-WLZ3H8VH version 2 em 2026-05-28 16:31.
-- Inclui Gallery updates + 22 tags base + built-in Click vars habilitadas
-- (fix validation errors).
-- Aplicada em cjtwrzlwfqvzukjinmjr 2026-05-28.

UPDATE core.gtm_master_versions
SET snapshot_at = '2026-05-28 16:31:00+00',
    notes = '5 Gallery templates atualizados: Meta Pixel (Facebook unofficial→Meta official 52 changes), cyrb53 Hasher (4), Microsoft Clarity Official (6), TikTok Pixel (19), Unique Event ID (4). + 22 tags base PAUSED nas plataformas X/Reddit/Pinterest/Snap/Bing UET/Quora extras. + Built-in Click vars habilitadas (Click Element/Classes/ID/URL/Text). PUBLICADO live 2026-05-28 16:31 — version_id=2 no GTM-WLZ3H8VH (51 tags / 14 triggers / 70 vars).',
    web_master_version_id = '2'
WHERE version_name = 'v0.3';
