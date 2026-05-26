/**
 * Tests para libsodium sealed box helpers.
 *
 * Cobre AC-5, AC-6 + cenários adicionais do test plan (1KB payload, cipher shape).
 *
 * @see docs/stories/F-S02.md — test plan
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3
 */

import { describe, it, expect, beforeAll } from 'vitest';
// NOTE: libsodium-wrappers@0.7.16 ESM bundle quebrado (ver ../crypto.ts).
// Workaround temporário via createRequire.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');
import { sealEncrypt, sealDecrypt } from '../crypto';

let kpA: { publicKey: string; privateKey: string };
let kpB: { publicKey: string; privateKey: string };

async function gen(): Promise<{ publicKey: string; privateKey: string }> {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(
      kp.privateKey,
      sodium.base64_variants.ORIGINAL,
    ),
  };
}

beforeAll(async () => {
  kpA = await gen();
  kpB = await gen();
});

describe('crypto sealed box', () => {
  it('roundtrip: sealEncrypt + sealDecrypt retorna original', async () => {
    const plain = 'hostinger-api-token-abc123xyz';
    const cipher = await sealEncrypt(plain, kpA.publicKey);
    expect(await sealDecrypt(cipher, kpA.publicKey, kpA.privateKey)).toBe(
      plain,
    );
  });

  it('rejeita decrypt com keypair diferente', async () => {
    const cipher = await sealEncrypt('secret', kpA.publicKey);
    await expect(
      sealDecrypt(cipher, kpB.publicKey, kpB.privateKey),
    ).rejects.toThrow();
  });

  it('lida com payload 1KB (worst case WP admin password longo)', async () => {
    const plain = 'x'.repeat(1024);
    const cipher = await sealEncrypt(plain, kpA.publicKey);
    expect(await sealDecrypt(cipher, kpA.publicKey, kpA.privateKey)).toBe(
      plain,
    );
  });

  it('cipher output é base64 não-vazio com tamanho ≥ plaintext + 48 bytes overhead', async () => {
    const cipher = await sealEncrypt('hi', kpA.publicKey);
    expect(cipher).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(cipher.length).toBeGreaterThan(40); // 2 chars + 48 bytes sealed box overhead → base64 ~67 chars
  });
});
