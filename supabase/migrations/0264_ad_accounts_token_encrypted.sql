-- 0264_ad_accounts_token_encrypted.sql
-- @see docs/adr-0011 §5b — token de ad platform cifrado por conta (SaaS alto padrão).
--
-- Cada conta de anúncio guarda seu token CIFRADO (libsodium sealed_box) — nunca
-- plaintext, nunca token global em env. Decifrado on-demand pelo cost-sync com as
-- keys do servidor (STORAGE_ENCRYPTION_PUBLIC_KEY / _SECRET_KEY). Isolamento por
-- tenant garantido pela RLS já existente em ad_accounts: o sync de um tenant só
-- lê as contas dele, e cada conta só carrega o próprio token.

ALTER TABLE tracking.ad_accounts ADD COLUMN IF NOT EXISTS token_encrypted text;

COMMENT ON COLUMN tracking.ad_accounts.token_encrypted IS
  'Token da plataforma cifrado (libsodium sealed_box, base64). NUNCA plaintext. Decifrado on-demand pelo cost-sync. @see docs/adr-0011 5b.';
