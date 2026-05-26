/**
 * Storage module — public surface + factory.
 *
 * Source-of-truth: `docs/adr-0008a-mock-storage-mvp-addendum.md` §2.5 (factory pattern).
 *
 * AC-6 (F-S01): `getStorage(env.STORAGE_BACKEND ?? 'redis')` retorna
 * `RedisGtmStorage` no MVP F; chamada com `'supabase'` lança erro referenciando
 * o ADR-0008a §4 (migração futura documentada lá).
 */

import type { IGtmStorage } from './IStorage';
import { RedisGtmStorage } from './RedisGtmStorage';

export type StorageBackend = 'redis' | 'supabase';

export function getStorage(backend: StorageBackend = 'redis'): IGtmStorage {
  if (backend === 'redis') {
    return new RedisGtmStorage();
  }
  if (backend === 'supabase') {
    throw new Error(
      'Supabase storage backend not implemented in MVP F — see ADR-0008a §4',
    );
  }
  // Exhaustiveness check em compile-time.
  const _exhaustive: never = backend;
  throw new Error(`Unknown storage backend: ${String(_exhaustive)}`);
}

// Re-exports públicos pra consumers (endpoints, validator, audit helper).
export type { IGtmStorage } from './IStorage';
export { RedisGtmStorage } from './RedisGtmStorage';
export type {
  AccountId,
  HostingAccount,
  GtmInstallation,
  InstallationAudit,
  InstallationId,
  ISO8601,
  TenantId,
} from './types';
