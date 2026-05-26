/**
 * RedisGtmStorage — implementação ioredis do port {@link IGtmStorage}.
 *
 * Source-of-truth:
 * - Key conventions: `docs/adr-0008a-mock-storage-mvp-addendum.md` §2.3 (linhas 56-77)
 * - Interface: `docs/adr-0008a-mock-storage-mvp-addendum.md` §2.5 (linhas 158-180)
 * - Idempotência: §3.10 ADR-0008 base + §2.3 (sha1 do site_domain)
 *
 * Convenções de key (NAMESPACE `gtm:*` — não tocar `metabase:*` nem `track:dedup:*`):
 * - `gtm:account:<id>`                  HASH  (campos do HostingAccount)
 * - `gtm:account:list`                  SET   (account_ids existentes)
 * - `gtm:account:by_tenant:<tenant_id>` SET   (account_ids do tenant)
 * - `gtm:install:<id>`                  HASH  (campos do GtmInstallation)
 * - `gtm:install:list`                  SET   (installation_ids existentes)
 * - `gtm:install:by_account:<id>`       SET   (installation_ids da conta)
 * - `gtm:install:by_site:<sha1(domain)>` STRING (installation_id — idempotency)
 * - `gtm:audit:<installation_id>`       LIST  (LPUSH + LTRIM 0 999 → max 1000)
 * - `gtm:audit:global`                  LIST  (max 5000)
 * - `gtm:lock:install:<id>`             STRING (SET NX EX 60)
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Redis as RedisClient } from 'ioredis';

import { getRedis } from '../redis';
import type { IGtmStorage } from './IStorage';
import type {
  AccountId,
  GtmInstallation,
  HostingAccount,
  InstallationAudit,
  InstallationId,
  ISO8601,
  TenantId,
} from './types';

// ---------- prefixes (Object.freeze pra prevenir mutação acidental) ----------

const PREFIXES = Object.freeze({
  accountHash: (id: AccountId | string) => `gtm:account:${id}`,
  accountList: 'gtm:account:list',
  accountByTenant: (tenantId: TenantId | string) => `gtm:account:by_tenant:${tenantId}`,

  installHash: (id: InstallationId | string) => `gtm:install:${id}`,
  installList: 'gtm:install:list',
  installByAccount: (accountId: AccountId | string) => `gtm:install:by_account:${accountId}`,
  installBySite: (domainSha1: string) => `gtm:install:by_site:${domainSha1}`,

  auditList: (installId: InstallationId | string) => `gtm:audit:${installId}`,
  auditGlobal: 'gtm:audit:global',

  lock: (installId: InstallationId | string) => `gtm:lock:install:${installId}`,
} as const);

const CONFIG = Object.freeze({
  auditMaxPerInstall: 1000,
  auditMaxGlobal: 5000,
} as const);

// ---------- helpers ----------

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function nowIso(): ISO8601 {
  return new Date().toISOString() as ISO8601;
}

/** Garante que apenas campos truthy/valor-definido entrem como string no HSET. */
function toHashFields(obj: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      out[k] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = String(v);
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

function parseAccountFromHash(raw: Record<string, string> | null): HostingAccount | null {
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    id: raw.id as AccountId,
    tenant_id: raw.tenant_id as TenantId,
    provider: raw.provider as 'hostinger',
    account_label: raw.account_label,
    token_encrypted: raw.token_encrypted,
    wp_admin_creds_encrypted: raw.wp_admin_creds_encrypted || undefined,
    account_email: raw.account_email || undefined,
    status: raw.status as HostingAccount['status'],
    last_validated_at: (raw.last_validated_at as ISO8601 | undefined) || undefined,
    created_at: raw.created_at as ISO8601,
    updated_at: raw.updated_at as ISO8601,
  };
}

function parseInstallationFromHash(
  raw: Record<string, string> | null,
): GtmInstallation | null {
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    id: raw.id as InstallationId,
    tenant_id: raw.tenant_id as TenantId,
    hosting_account_id: raw.hosting_account_id as AccountId,
    site_domain: raw.site_domain,
    brand_slug: raw.brand_slug as GtmInstallation['brand_slug'],
    gtm_container_id: raw.gtm_container_id,
    plugin_version: raw.plugin_version,
    status: raw.status as GtmInstallation['status'],
    upload_dir_name: raw.upload_dir_name || undefined,
    attempt_count: raw.attempt_count ? Number.parseInt(raw.attempt_count, 10) : 0,
    last_attempted_at: (raw.last_attempted_at as ISO8601 | undefined) || undefined,
    installed_at: (raw.installed_at as ISO8601 | undefined) || undefined,
    last_validation_at: (raw.last_validation_at as ISO8601 | undefined) || undefined,
    last_validation_result: raw.last_validation_result
      ? (JSON.parse(raw.last_validation_result) as GtmInstallation['last_validation_result'])
      : undefined,
    last_error: raw.last_error || undefined,
    created_by: raw.created_by || undefined,
    created_at: raw.created_at as ISO8601,
    updated_at: raw.updated_at as ISO8601,
  };
}

// ---------- impl ----------

export interface RedisGtmStorageOptions {
  /** Cliente ioredis pré-existente (uso em testes com ioredis-mock). */
  client?: RedisClient;
  /** URL ignored if `client` is provided. */
  url?: string;
}

export class RedisGtmStorage implements IGtmStorage {
  private readonly redis: RedisClient;
  /** Valores de lock atualmente possuídos por esta instância (pra release seguro). */
  private readonly lockTokens = new Map<string, string>();

  constructor(options: RedisGtmStorageOptions = {}) {
    if (options.client) {
      this.redis = options.client;
    } else if (options.url) {
      this.redis = getRedis({ host: undefined });
      // Caso queira force URL diferente do default, basta passar via getRedis env.
      // Simplificação: confia no singleton já configurado por REDIS_URL.
    } else {
      this.redis = getRedis();
    }
  }

  // ===================== HOSTING ACCOUNTS =====================

  async createAccount(
    input: Omit<HostingAccount, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<HostingAccount> {
    const id = randomUUID() as AccountId;
    const now = nowIso();
    const account: HostingAccount = {
      ...input,
      id,
      created_at: now,
      updated_at: now,
    };

    const pipeline = this.redis.multi();
    pipeline.hset(PREFIXES.accountHash(id), toHashFields(account));
    pipeline.sadd(PREFIXES.accountList, id);
    pipeline.sadd(PREFIXES.accountByTenant(account.tenant_id), id);
    await pipeline.exec();

    return account;
  }

  async getAccount(id: AccountId): Promise<HostingAccount | null> {
    const raw = await this.redis.hgetall(PREFIXES.accountHash(id));
    return parseAccountFromHash(raw);
  }

  async listAccounts(filters?: { tenant_id?: TenantId }): Promise<HostingAccount[]> {
    const setKey = filters?.tenant_id
      ? PREFIXES.accountByTenant(filters.tenant_id)
      : PREFIXES.accountList;
    const ids = await this.redis.smembers(setKey);
    if (ids.length === 0) return [];

    const results = await Promise.all(
      ids.map((id) => this.getAccount(id as AccountId)),
    );
    return results.filter((acc): acc is HostingAccount => acc !== null);
  }

  async updateAccount(id: AccountId, patch: Partial<HostingAccount>): Promise<HostingAccount> {
    const current = await this.getAccount(id);
    if (!current) {
      throw new Error(`RedisGtmStorage.updateAccount: account ${id} not found`);
    }

    // Aplica patch preservando campos ausentes (AC-7 grupo 2).
    const merged: HostingAccount = {
      ...current,
      ...patch,
      id: current.id, // id é imutável
      created_at: current.created_at, // created_at é imutável
      updated_at: nowIso(),
    };

    // Se mudou tenant_id, precisa atualizar índice secundário.
    if (patch.tenant_id && patch.tenant_id !== current.tenant_id) {
      const pipeline = this.redis.multi();
      pipeline.srem(PREFIXES.accountByTenant(current.tenant_id), id);
      pipeline.sadd(PREFIXES.accountByTenant(merged.tenant_id), id);
      pipeline.hset(PREFIXES.accountHash(id), toHashFields(merged));
      await pipeline.exec();
    } else {
      await this.redis.hset(PREFIXES.accountHash(id), toHashFields(merged));
    }

    return merged;
  }

  async deleteAccount(id: AccountId): Promise<void> {
    const current = await this.getAccount(id);
    if (!current) return;

    const pipeline = this.redis.multi();
    pipeline.del(PREFIXES.accountHash(id));
    pipeline.srem(PREFIXES.accountList, id);
    pipeline.srem(PREFIXES.accountByTenant(current.tenant_id), id);
    await pipeline.exec();
  }

  // ===================== INSTALLATIONS =====================

  async createInstallation(
    input: Omit<GtmInstallation, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<GtmInstallation> {
    // AC-4 — idempotency por sha1(site_domain).
    // AC edge-5 — race condition mitigada via `SET NX` na by_site key (perdedor lê o vencedor).
    const domainKey = PREFIXES.installBySite(sha1(input.site_domain));

    // Reserva tentativa: tenta criar by_site key APENAS se ainda não existir.
    const candidateId = randomUUID() as InstallationId;
    const reserved = await this.redis.set(domainKey, candidateId, 'NX');

    if (reserved !== 'OK') {
      // Já existe — alguém ganhou a corrida. Retorna o installation existente.
      const existingId = await this.redis.get(domainKey);
      if (existingId) {
        const existing = await this.getInstallation(existingId as InstallationId);
        if (existing) return existing;
      }
      // Caso muito raro: key existia mas hash sumiu (corruption/race).
      // Sobrescreve com novo candidato pra recuperar.
      await this.redis.set(domainKey, candidateId);
    }

    const now = nowIso();
    const installation: GtmInstallation = {
      ...input,
      id: candidateId,
      created_at: now,
      updated_at: now,
    };

    const pipeline = this.redis.multi();
    pipeline.hset(PREFIXES.installHash(candidateId), toHashFields(installation));
    pipeline.sadd(PREFIXES.installList, candidateId);
    pipeline.sadd(PREFIXES.installByAccount(installation.hosting_account_id), candidateId);
    await pipeline.exec();

    return installation;
  }

  async getInstallation(id: InstallationId): Promise<GtmInstallation | null> {
    const raw = await this.redis.hgetall(PREFIXES.installHash(id));
    return parseInstallationFromHash(raw);
  }

  async getInstallationBySite(domain: string): Promise<GtmInstallation | null> {
    const id = await this.redis.get(PREFIXES.installBySite(sha1(domain)));
    if (!id) return null;
    return this.getInstallation(id as InstallationId);
  }

  async listInstallations(filters?: {
    account_id?: AccountId;
    status?: string;
  }): Promise<GtmInstallation[]> {
    const setKey = filters?.account_id
      ? PREFIXES.installByAccount(filters.account_id)
      : PREFIXES.installList;
    const ids = await this.redis.smembers(setKey);
    if (ids.length === 0) return [];

    const results = await Promise.all(
      ids.map((id) => this.getInstallation(id as InstallationId)),
    );
    const installations = results.filter(
      (inst): inst is GtmInstallation => inst !== null,
    );

    if (filters?.status) {
      return installations.filter((i) => i.status === filters.status);
    }
    return installations;
  }

  async updateInstallation(
    id: InstallationId,
    patch: Partial<GtmInstallation>,
  ): Promise<GtmInstallation> {
    const current = await this.getInstallation(id);
    if (!current) {
      throw new Error(`RedisGtmStorage.updateInstallation: installation ${id} not found`);
    }

    const merged: GtmInstallation = {
      ...current,
      ...patch,
      id: current.id,
      created_at: current.created_at,
      updated_at: nowIso(),
    };

    // Se o site_domain mudou, precisa atualizar índice secundário by_site.
    if (patch.site_domain && patch.site_domain !== current.site_domain) {
      const pipeline = this.redis.multi();
      pipeline.del(PREFIXES.installBySite(sha1(current.site_domain)));
      pipeline.set(PREFIXES.installBySite(sha1(merged.site_domain)), id);
      pipeline.hset(PREFIXES.installHash(id), toHashFields(merged));
      await pipeline.exec();
    } else {
      await this.redis.hset(PREFIXES.installHash(id), toHashFields(merged));
    }

    return merged;
  }

  // ===================== AUDIT (append-only LIST) =====================

  async appendAudit(input: Omit<InstallationAudit, 'id' | 'created_at'>): Promise<void> {
    const entry: InstallationAudit = {
      ...input,
      id: randomUUID(),
      created_at: nowIso(),
    };
    const serialized = JSON.stringify(entry);

    const pipeline = this.redis.multi();
    pipeline.lpush(PREFIXES.auditList(entry.installation_id), serialized);
    pipeline.ltrim(PREFIXES.auditList(entry.installation_id), 0, CONFIG.auditMaxPerInstall - 1);
    pipeline.lpush(PREFIXES.auditGlobal, serialized);
    pipeline.ltrim(PREFIXES.auditGlobal, 0, CONFIG.auditMaxGlobal - 1);
    await pipeline.exec();
  }

  async listAudit(
    installation_id: InstallationId,
    limit: number = 50,
  ): Promise<InstallationAudit[]> {
    const raw = await this.redis.lrange(
      PREFIXES.auditList(installation_id),
      0,
      Math.max(0, limit - 1),
    );
    return raw.map((entry) => JSON.parse(entry) as InstallationAudit);
  }

  // ===================== DISTRIBUTED LOCK =====================

  async acquireLock(installation_id: InstallationId, ttl_sec: number): Promise<boolean> {
    const key = PREFIXES.lock(installation_id);
    const token = randomUUID();
    // Atomic SET NX EX — Redis garante exclusão mútua.
    const result = await this.redis.set(key, token, 'EX', ttl_sec, 'NX');
    if (result === 'OK') {
      this.lockTokens.set(installation_id, token);
      return true;
    }
    return false;
  }

  async releaseLock(installation_id: InstallationId): Promise<void> {
    const key = PREFIXES.lock(installation_id);
    const expectedToken = this.lockTokens.get(installation_id);
    if (!expectedToken) {
      // Lock não foi adquirido por esta instância — no-op defensivo.
      return;
    }
    // Lua script atômico pra só deletar se o token bater (previne release de lock alheio).
    const luaScript = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(luaScript, 1, key, expectedToken);
    this.lockTokens.delete(installation_id);
  }
}
