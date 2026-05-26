/**
 * CLI helper pra gerar UM keypair libsodium (uso 1x por ambiente).
 *
 * Output em formato copiável pra Easypanel → tracking-api → Env tab.
 *
 * Run: `npx tsx scripts/generate-libsodium-keypair.ts`
 *
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3.2
 */

// NOTE: libsodium-wrappers@0.7.16 ESM bundle quebrado (ver workers/lib/storage/crypto.ts).
// Workaround temporário via createRequire.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

async function main(): Promise<void> {
  await sodium.ready;

  const kp = sodium.crypto_box_keypair();
  const pub = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
  const sec = sodium.to_base64(
    kp.privateKey,
    sodium.base64_variants.ORIGINAL,
  );

  process.stdout.write(`STORAGE_ENCRYPTION_PUBLIC_KEY=${pub}\n`);
  process.stdout.write(`STORAGE_ENCRYPTION_SECRET_KEY=${sec}\n`);
  process.stdout.write(
    '\nCole essas 2 linhas no Easypanel → tracking-api → Env tab. NÃO commitar.\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Erro gerando keypair: ${String(err)}\n`);
  process.exit(1);
});
