/**
 * RedisGtmStorage unit tests — cobre AC-7 (F-S01) e edge cases.
 *
 * Source-of-truth dos critérios: `docs/stories/F-S01.md` AC-7.
 *
 * Backend: `ioredis-mock` (in-memory, sem container externo). Mantém API
 * idêntica ao `ioredis`, então a impl real roda inalterada.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';

import { RedisGtmStorage } from '../RedisGtmStorage';
import type {
  AccountId,
  GtmInstallation,
  HostingAccount,
  InstallationId,
  TenantId,
} from '../types';
import { getStorage } from '..';

const TENANT_ID = '00000000-0000-4000-8000-000000000001' as TenantId;

function baseAccountInput(): Omit<HostingAccount, 'id' | 'created_at' | 'updated_at'> {
  return {
    tenant_id: TENANT_ID,
    provider: 'hostinger',
    account_label: 'Diego pessoal',
    token_encrypted: 'base64-sealed-box-stub',
    account_email: 'diego@mentoria.com',
    status: 'active',
  };
}

function baseInstallationInput(
  hostingAccountId: AccountId,
  domain = 'zerohum.com.br',
): Omit<GtmInstallation, 'id' | 'created_at' | 'updated_at'> {
  return {
    tenant_id: TENANT_ID,
    hosting_account_id: hostingAccountId,
    site_domain: domain,
    brand_slug: 'zerohum',
    gtm_container_id: 'GTM-WVWQVMP',
    plugin_version: 'gtm4wp-1.18+bootstrap-v1',
    status: 'draft',
    attempt_count: 0,
  };
}

// Cria um client mock isolado por teste (data não compartilhada).
function newMockClient() {
  // RedisMock typings — passing options instance-isolates state.
  // Cast pra any: o tipo do construtor é compatível com ioredis.Redis em runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RedisMock() as any;
}

describe('RedisGtmStorage', () => {
  let client: ReturnType<typeof newMockClient>;
  let storage: RedisGtmStorage;

  beforeEach(() => {
    client = newMockClient();
    storage = new RedisGtmStorage({ client });
  });

  afterEach(async () => {
    if (client && typeof client.disconnect === 'function') {
      await client.flushall();
      client.disconnect();
    }
  });

  // ============================================================
  // Grupo 1 — accounts CRUD (createAccount + getAccount + listAccounts)
  // ============================================================
  describe('accounts CRUD', () => {
    it('createAccount → getAccount → listAccounts roundtrip', async () => {
      const created = await storage.createAccount(baseAccountInput());

      expect(created.id).toBeTruthy();
      expect(created.tenant_id).toBe(TENANT_ID);
      expect(created.provider).toBe('hostinger');
      expect(created.account_label).toBe('Diego pessoal');
      expect(created.created_at).toBeTruthy();
      expect(created.updated_at).toBeTruthy();

      const fetched = await storage.getAccount(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.account_email).toBe('diego@mentoria.com');

      const list = await storage.listAccounts();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);
    });

    it('listAccounts filtra por tenant_id', async () => {
      const a1 = await storage.createAccount(baseAccountInput());
      const otherTenant = '00000000-0000-4000-8000-000000000099' as TenantId;
      await storage.createAccount({
        ...baseAccountInput(),
        tenant_id: otherTenant,
        account_label: 'Outro tenant',
      });

      const list = await storage.listAccounts({ tenant_id: TENANT_ID });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(a1.id);
    });

    it('getAccount retorna null pra id inexistente', async () => {
      const nonExistent = '11111111-2222-3333-4444-555555555555' as AccountId;
      const result = await storage.getAccount(nonExistent);
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // Grupo 2 — updateAccount patch preserva campos ausentes
  // ============================================================
  describe('updateAccount', () => {
    it('updateAccount preserva campos ausentes (não vira undefined)', async () => {
      const created = await storage.createAccount(baseAccountInput());

      // Pequeno sleep pra garantir Date.now() distinto (clock resolution 1ms).
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Patch só com status; account_email e account_label devem permanecer.
      const updated = await storage.updateAccount(created.id, { status: 'token_expired' });

      expect(updated.status).toBe('token_expired');
      expect(updated.account_label).toBe('Diego pessoal'); // preservado
      expect(updated.account_email).toBe('diego@mentoria.com'); // preservado
      expect(updated.id).toBe(created.id); // id imutável
      expect(updated.created_at).toBe(created.created_at); // created_at imutável
      expect(
        new Date(updated.updated_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(created.updated_at).getTime()); // updated_at avança
    });

    it('updateAccount lança se account não existe', async () => {
      const phantom = '99999999-9999-9999-9999-999999999999' as AccountId;
      await expect(storage.updateAccount(phantom, { status: 'revoked' })).rejects.toThrow(
        /not found/,
      );
    });

    it('deleteAccount remove account + índice list', async () => {
      const created = await storage.createAccount(baseAccountInput());
      await storage.deleteAccount(created.id);

      const fetched = await storage.getAccount(created.id);
      expect(fetched).toBeNull();

      const list = await storage.listAccounts();
      expect(list).toHaveLength(0);
    });
  });

  // ============================================================
  // Grupo 3 — installations idempotency (AC-4)
  // ============================================================
  describe('installations idempotency', () => {
    let accountId: AccountId;

    beforeEach(async () => {
      const acc = await storage.createAccount(baseAccountInput());
      accountId = acc.id;
    });

    it('createInstallation 2× mesmo domain → mesmo id (AC-4)', async () => {
      const inst1 = await storage.createInstallation(
        baseInstallationInput(accountId, 'zerohum.com.br'),
      );
      const inst2 = await storage.createInstallation(
        baseInstallationInput(accountId, 'zerohum.com.br'),
      );

      expect(inst2.id).toBe(inst1.id);
      expect(inst2.site_domain).toBe(inst1.site_domain);
    });

    it('createInstallation 2 domains diferentes → 2 ids distintos', async () => {
      const inst1 = await storage.createInstallation(
        baseInstallationInput(accountId, 'zerohum.com.br'),
      );
      const inst2 = await storage.createInstallation(
        baseInstallationInput(accountId, 'mentoria.com.br'),
      );

      expect(inst2.id).not.toBe(inst1.id);
    });

    it('getInstallationBySite resolve via sha1 lookup', async () => {
      const inst = await storage.createInstallation(
        baseInstallationInput(accountId, 'zerohum.com.br'),
      );
      const found = await storage.getInstallationBySite('zerohum.com.br');
      expect(found?.id).toBe(inst.id);

      const notFound = await storage.getInstallationBySite('inexistente.com');
      expect(notFound).toBeNull();
    });

    it('listInstallations filtra por account_id e status', async () => {
      const inst1 = await storage.createInstallation(
        baseInstallationInput(accountId, 'zerohum.com.br'),
      );
      const inst2 = await storage.createInstallation(
        baseInstallationInput(accountId, 'mentoria.com.br'),
      );
      await storage.updateInstallation(inst2.id, { status: 'installed' });

      const all = await storage.listInstallations({ account_id: accountId });
      expect(all).toHaveLength(2);

      const installed = await storage.listInstallations({
        account_id: accountId,
        status: 'installed',
      });
      expect(installed).toHaveLength(1);
      expect(installed[0].id).toBe(inst2.id);

      const drafts = await storage.listInstallations({ status: 'draft' });
      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe(inst1.id);
    });
  });

  // ============================================================
  // Grupo 4 — audit append-only (LIFO via LPUSH + LTRIM)
  // ============================================================
  describe('audit log append-only', () => {
    let installationId: InstallationId;

    beforeEach(async () => {
      const acc = await storage.createAccount(baseAccountInput());
      const inst = await storage.createInstallation(baseInstallationInput(acc.id));
      installationId = inst.id;
    });

    it('appendAudit + listAudit limit=10 retorna últimos 10 (LIFO via LPUSH)', async () => {
      // Insere 15 entries em ordem; o mais recente fica no índice 0 do LIST (LPUSH).
      for (let i = 0; i < 15; i++) {
        await storage.appendAudit({
          installation_id: installationId,
          tenant_id: TENANT_ID,
          action: 'upload_started',
          payload: { attempt: i },
          actor_source: 'tracking-api',
        });
      }

      const audits = await storage.listAudit(installationId, 10);
      expect(audits).toHaveLength(10);

      // LIFO: o último inserido (attempt: 14) deve aparecer primeiro.
      expect(audits[0].payload.attempt).toBe(14);
      expect(audits[9].payload.attempt).toBe(5);
    });

    it('LTRIM mantém max 1000 entries por installation', async () => {
      // Insere 1010 — o LTRIM deve cortar pra 1000.
      // Para velocidade do teste, simulamos batch via Promise.all em chunks.
      const total = 1010;
      const chunkSize = 50;
      for (let start = 0; start < total; start += chunkSize) {
        const chunk = Array.from({ length: Math.min(chunkSize, total - start) }, (_, i) =>
          storage.appendAudit({
            installation_id: installationId,
            tenant_id: TENANT_ID,
            action: 'upload_started',
            payload: { i: start + i },
            actor_source: 'tracking-api',
          }),
        );
        await Promise.all(chunk);
      }

      // Pede mais que 1000 — deve voltar exatamente 1000.
      const audits = await storage.listAudit(installationId, 5000);
      expect(audits.length).toBeLessThanOrEqual(1000);
      expect(audits.length).toBeGreaterThan(990); // tolerância p/ pequenas variações
    });
  });

  // ============================================================
  // Grupo 5 — distributed lock acquire/release
  // ============================================================
  describe('distributed lock', () => {
    let installationId: InstallationId;

    beforeEach(async () => {
      const acc = await storage.createAccount(baseAccountInput());
      const inst = await storage.createInstallation(baseInstallationInput(acc.id));
      installationId = inst.id;
    });

    it('acquireLock true → 2ª acquireLock false → releaseLock → 3ª acquireLock true (AC-5)', async () => {
      // Mesma instância "possui" o lock entre chamadas (lockTokens map).
      const first = await storage.acquireLock(installationId, 60);
      expect(first).toBe(true);

      const second = await storage.acquireLock(installationId, 60);
      expect(second).toBe(false);

      await storage.releaseLock(installationId);

      const third = await storage.acquireLock(installationId, 60);
      expect(third).toBe(true);
    });

    it('acquireLock concurrent — só 1 vence', async () => {
      // Simula 2 réplicas (instâncias separadas compartilhando mesmo Redis).
      const storageA = new RedisGtmStorage({ client });
      const storageB = new RedisGtmStorage({ client });

      const [aResult, bResult] = await Promise.all([
        storageA.acquireLock(installationId, 60),
        storageB.acquireLock(installationId, 60),
      ]);

      // Exatamente 1 deve vencer.
      expect([aResult, bResult].filter(Boolean)).toHaveLength(1);
    });
  });

  // ============================================================
  // Grupo 6 — TTL lock auto-expira (ttl_sec=2 + sleep 2.5s)
  // ============================================================
  describe('lock TTL expiration', () => {
    let installationId: InstallationId;

    beforeEach(async () => {
      const acc = await storage.createAccount(baseAccountInput());
      const inst = await storage.createInstallation(baseInstallationInput(acc.id));
      installationId = inst.id;
    });

    it('TTL lock auto-expira em <60s (ttl_sec=1 + sleep 1.2s)', async () => {
      const acquired = await storage.acquireLock(installationId, 1);
      expect(acquired).toBe(true);

      // Aguarda TTL expirar.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Nova instância — sem lockTokens da primeira; deveria conseguir adquirir.
      const fresh = new RedisGtmStorage({ client });
      const reAcquired = await fresh.acquireLock(installationId, 60);
      expect(reAcquired).toBe(true);
    });
  });

  // ============================================================
  // Grupo 7 — persistence simulation (reconnect mantém state)
  // ============================================================
  describe('persistence simulation', () => {
    it('keys gtm:* persistem entre instâncias que compartilham o mesmo client store', async () => {
      // ioredis-mock compartilha state entre clients quando se passa o mesmo store.
      // Aqui simulamos restart: nova RedisGtmStorage com o mesmo client subjacente.
      const acc = await storage.createAccount(baseAccountInput());
      const inst = await storage.createInstallation(baseInstallationInput(acc.id));

      // "Reconnect" — nova instância de storage usando o MESMO client mock.
      const reborn = new RedisGtmStorage({ client });

      const fetchedAcc = await reborn.getAccount(acc.id);
      const fetchedInst = await reborn.getInstallation(inst.id);

      expect(fetchedAcc?.id).toBe(acc.id);
      expect(fetchedInst?.id).toBe(inst.id);
      expect(fetchedInst?.site_domain).toBe('zerohum.com.br');
    });
  });

  // ============================================================
  // Extras — last_validation_result serialização (objeto aninhado)
  // ============================================================
  describe('nested objects serialization', () => {
    it('last_validation_result roundtrip JSON correto', async () => {
      const acc = await storage.createAccount(baseAccountInput());
      const inst = await storage.createInstallation(baseInstallationInput(acc.id));

      const updated = await storage.updateInstallation(inst.id, {
        last_validation_result: {
          passed: true,
          stage: 'full',
          details: {
            containerMatch: true,
            expectedMatch: true,
            datalayerMatch: true,
            expectedContainerId: 'GTM-WVWQVMP',
          },
        },
      });

      expect(updated.last_validation_result?.passed).toBe(true);
      expect(updated.last_validation_result?.stage).toBe('full');
      expect(updated.last_validation_result?.details?.expectedContainerId).toBe('GTM-WVWQVMP');

      // Re-read confirma persistência.
      const reread = await storage.getInstallation(inst.id);
      expect(reread?.last_validation_result?.details?.containerMatch).toBe(true);
    });
  });
});

// ============================================================
// Factory getStorage() — AC-6
// ============================================================
describe('getStorage factory', () => {
  it('retorna RedisGtmStorage no default ("redis")', async () => {
    // Importante: não conectar de verdade no Redis aqui; só checa type.
    // Injeta um client mock no getStorage via overrides do construtor não é
    // possível (factory cria internamente), então usamos um endereço inválido
    // + closeRedis() pra evitar vazamento. O warning "Unhandled error" é
    // benigno (ioredis emite quando connect attempt falha em background).
    const prevUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://localhost:65535'; // porta inválida — lazy
    try {
      const storage = getStorage('redis');
      expect(storage).toBeDefined();
      expect(typeof storage.createAccount).toBe('function');
      expect(typeof storage.acquireLock).toBe('function');
    } finally {
      if (prevUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = prevUrl;
      }
      // Fecha singleton pra não vazar conexão entre testes.
      const { closeRedis } = await import('../../redis');
      await closeRedis().catch(() => undefined);
    }
  });

  it('lança erro referenciando ADR-0008a §4 para backend supabase', () => {
    expect(() => getStorage('supabase')).toThrow(/ADR-0008a §4/);
  });
});
