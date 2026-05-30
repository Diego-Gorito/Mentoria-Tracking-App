/**
 * `gtm-clone-janitor` — cron daily limpa containers GTM órfãos.
 *
 * ADR-0009 §6 R1, §2 #7 (rollback strategy).
 *
 * Containers órfãos surgem quando:
 *  - Clone parou no meio (failed_at_step) e linha core.tenant_containers
 *    nunca foi inserida → container existe no GTM mas não no nosso DB.
 *  - Tenant foi deletado e CASCADE removeu row core.tenant_containers,
 *    mas containers GTM permaneceram.
 *
 * Algorithm:
 *  1. List todos containers da conta GTM via API.
 *  2. List todos containers em core.tenant_containers.
 *  3. Diff: containers no GTM ausentes do nosso DB → órfãos.
 *  4. Pra cada órfão:
 *     - Se created_at < 24h atrás → skip (provisioning em andamento)
 *     - Else → deleteContainer + audit log
 *
 * Trigger: cron daily 03:00 BRT via Easypanel scheduler OR Supabase pg_cron.
 *
 * @see ADR-0009 §6
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GtmApiClient, GtmContainer } from '../lib/gtm';

export interface JanitorDeps {
  gtmClient: GtmApiClient;
  supabase: SupabaseClient;
  /** Conta GTM destino (default env). */
  gtmAccountId?: string;
  /** Idade mínima antes de considerar órfão (default 24h). */
  minAgeMs?: number;
  /** Dry run — não deleta, só lista (default false). */
  dryRun?: boolean;
  /** Logger (default console). */
  logger?: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export interface JanitorResult {
  scanned: number;
  orphansFound: number;
  orphansDeleted: number;
  skippedYoung: number;
  errors: { containerId: string; error: string }[];
}

const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOGGER = {

  info: (msg: string, meta?: unknown) => console.info(`[janitor] ${msg}`, meta ?? ''),

  error: (msg: string, meta?: unknown) => console.error(`[janitor] ${msg}`, meta ?? ''),
};

export async function runGtmCloneJanitor(deps: JanitorDeps): Promise<JanitorResult> {
  const accountId = deps.gtmAccountId ?? process.env.GTM_ACCOUNT_ID ?? '6059193756';
  const minAge = deps.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const logger = deps.logger ?? DEFAULT_LOGGER;
  const dryRun = deps.dryRun ?? false;

  const result: JanitorResult = {
    scanned: 0,
    orphansFound: 0,
    orphansDeleted: 0,
    skippedYoung: 0,
    errors: [],
  };

  // 1. List GTM containers via API
  // GTM API: GET /accounts/{a}/containers retorna paginado, mas em master
  // accounts < 500 containers, 1 página basta.
  logger.info('Listing GTM containers', { accountId });
  const gtmContainers = await deps.gtmClient.listContainers(accountId);
  result.scanned = gtmContainers.length;
  logger.info(`Found ${gtmContainers.length} containers in GTM account`);

  // 2. List containers tracked in our DB
  const { data: tracked, error } = await deps.supabase
    .schema('core')
    .from('tenant_containers')
    .select('web_container_internal_id, server_container_internal_id');
  if (error) {
    logger.error('Failed to list tracked containers', { error: error.message });
    throw error;
  }
  const trackedIds = new Set<string>();
  for (const t of tracked ?? []) {
    if (t.web_container_internal_id) trackedIds.add(t.web_container_internal_id);
    if (t.server_container_internal_id) trackedIds.add(t.server_container_internal_id);
  }
  logger.info(`Tracked containers: ${trackedIds.size}`);

  // 3. Identify orphans
  const now = Date.now();
  for (const container of gtmContainers) {
    if (trackedIds.has(container.containerId)) continue;
    result.orphansFound++;

    // Containers GTM API não retorna created_at, mas fingerprint é numérico
    // (timestamp UNIX ms). Usar como proxy de idade.
    const createdMs = container.fingerprint ? parseInt(container.fingerprint, 10) : 0;
    const age = now - createdMs;
    if (age < minAge) {
      result.skippedYoung++;
      logger.info(`Orphan but young (skip): ${container.publicId} (age ${Math.round(age / 1000)}s)`);
      continue;
    }

    // 4. Delete orphan
    if (dryRun) {
      logger.info(`[DRY-RUN] Would delete orphan: ${container.publicId} (${container.containerId})`);
      continue;
    }

    try {
      await deps.gtmClient.deleteContainer(accountId, container.containerId);
      result.orphansDeleted++;
      logger.info(`Deleted orphan: ${container.publicId} (${container.containerId})`);

      // Audit log
      await deps.supabase.schema('core').from('gtm_clone_audit').insert({
        action: 'delete',
        step: 'janitor_cleanup',
        status: 'success',
        metadata: {
          container_id: container.containerId,
          public_id: container.publicId,
          name: container.name,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete orphan ${container.containerId}`, { error: errMsg });
      result.errors.push({ containerId: container.containerId, error: errMsg });
    }
  }

  logger.info('Janitor complete', result);
  return result;
}

