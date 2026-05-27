/**
 * libsodium sealed box helpers — token/password encryption sem Vault no MVP F.
 *
 * Usado pra cifrar Hostinger API tokens + WP Application Passwords antes de
 * gravar no Redis (mock storage MVP). Sealed box = `crypto_box_seal` —
 * anonymous sender, recipient-only decrypt. Backend tem ambas as keys
 * (public + secret) em env vars.
 *
 * Onda 1.5 swap: criar EncryptCryptoVault que chama vault.create_secret +
 * retorna vault.secrets.id. Backfill script descrito em ADR-0008a §3.3.
 *
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3
 */

// NOTE: libsodium-wrappers@0.7.16 ships a broken ESM bundle (relative import
// `./libsodium.mjs` que não resolve em Node ESM — ver libsodium.js#393).
// Workaround: força CJS via createRequire pra contornar o exports.import quebrado.
// Quando upstream consertar (ou trocarmos a dep), reverter pra `import sodium from 'libsodium-wrappers'`.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

let initialized = false;

async function init(): Promise<void> {
  if (!initialized) {
    await sodium.ready;
    initialized = true;
  }
}

/**
 * Cifra `plaintext` com a public key (sealed box anônimo).
 *
 * @param plaintext - String UTF-8 a cifrar (token Hostinger, WP password, etc.)
 * @param publicKeyBase64 - 32-byte public key em base64 (ORIGINAL variant)
 * @returns Cipher em base64 (~plaintext + 48 bytes de overhead sealed box)
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3.2
 */
export async function sealEncrypt(
  plaintext: string,
  publicKeyBase64: string,
): Promise<string> {
  await init();
  const pubKey = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const cipher = sodium.crypto_box_seal(plaintext, pubKey);
  return sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL);
}

/**
 * Decifra `cipherBase64` produzido por `sealEncrypt`. Requer ambas as keys
 * (public + secret) — libsodium semantic do sealed box.
 *
 * Lança se a secret key não corresponde à public key usada na cifração
 * (NaCl MAC detecta tampering ou key mismatch).
 *
 * @param cipherBase64 - Output prévio de `sealEncrypt` em base64
 * @param publicKeyBase64 - Mesma public key usada em `sealEncrypt`
 * @param secretKeyBase64 - 32-byte secret key correspondente em base64
 * @returns Plaintext original UTF-8
 * @throws Se cipher tampered ou key errada
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3.2
 */
export async function sealDecrypt(
  cipherBase64: string,
  publicKeyBase64: string,
  secretKeyBase64: string,
): Promise<string> {
  await init();
  const cipher = sodium.from_base64(
    cipherBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const pubKey = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const secKey = sodium.from_base64(
    secretKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const plain = sodium.crypto_box_seal_open(cipher, pubKey, secKey);
  return sodium.to_string(plain);
}
