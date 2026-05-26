/**
 * Env var validation no boot do tracking-api.
 *
 * @see docs/adr-0008a-mock-storage-mvp-addendum.md §3.2 — geração do keypair libsodium
 */

/**
 * Valida que env vars críticos pra storage encryption estão presentes.
 * Lança error claro com referência ao ADR se algum ausente.
 *
 * Chamado no boot do tracking-api (antes de qualquer chamada a `sealEncrypt`).
 *
 * @throws Se `STORAGE_ENCRYPTION_PUBLIC_KEY` ou `STORAGE_ENCRYPTION_SECRET_KEY` ausente
 */
export function assertEnv(): void {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
  const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY;

  if (!pub || pub.trim().length === 0) {
    throw new Error(
      'STORAGE_ENCRYPTION_PUBLIC_KEY ausente — ver ADR-0008a §3.2 pra geração de keypair',
    );
  }

  if (!sec || sec.trim().length === 0) {
    throw new Error(
      'STORAGE_ENCRYPTION_SECRET_KEY ausente — ver ADR-0008a §3.2 pra geração de keypair',
    );
  }
}
