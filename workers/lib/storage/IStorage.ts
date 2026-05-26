/**
 * IGtmStorage — port pattern interface (espelha ADR-0008 §3.3 provider adapter).
 *
 * Source-of-truth: `docs/adr-0008a-mock-storage-mvp-addendum.md` §2.5
 * (linhas 158-180) — copiado LITERAL para garantir alinhamento com ADR.
 *
 * 2 implementations previstas:
 * - MVP F: `RedisGtmStorage` (workers/lib/storage/RedisGtmStorage.ts)
 * - Onda 1.5: `SupabaseGtmStorage` (workers/lib/storage/SupabaseGtmStorage.ts)
 *
 * Factory: `workers/lib/storage/index.ts` → `getStorage(env.STORAGE_BACKEND ?? 'redis')`
 *
 * Port pattern permite swap-in da impl SQL no Onda 1.5 sem tocar callers
 * (endpoints, validator, audit helper).
 */

import type {
  AccountId,
  HostingAccount,
  GtmInstallation,
  InstallationId,
  InstallationAudit,
  TenantId,
} from './types';

export interface IGtmStorage {
  // hosting_accounts
  createAccount(
    input: Omit<HostingAccount, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<HostingAccount>;
  getAccount(id: AccountId): Promise<HostingAccount | null>;
  listAccounts(filters?: { tenant_id?: TenantId }): Promise<HostingAccount[]>;
  updateAccount(id: AccountId, patch: Partial<HostingAccount>): Promise<HostingAccount>;
  deleteAccount(id: AccountId): Promise<void>;

  // installations
  createInstallation(
    input: Omit<GtmInstallation, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<GtmInstallation>;
  getInstallation(id: InstallationId): Promise<GtmInstallation | null>;
  getInstallationBySite(domain: string): Promise<GtmInstallation | null>; // idempotency lookup
  listInstallations(filters?: {
    account_id?: AccountId;
    status?: string;
  }): Promise<GtmInstallation[]>;
  updateInstallation(
    id: InstallationId,
    patch: Partial<GtmInstallation>,
  ): Promise<GtmInstallation>;

  // audit (append-only)
  appendAudit(input: Omit<InstallationAudit, 'id' | 'created_at'>): Promise<void>;
  listAudit(installation_id: InstallationId, limit?: number): Promise<InstallationAudit[]>;

  // distributed lock pra prevenir 2 deploys concurrent na mesma installation
  acquireLock(installation_id: InstallationId, ttl_sec: number): Promise<boolean>;
  releaseLock(installation_id: InstallationId): Promise<void>;
}
