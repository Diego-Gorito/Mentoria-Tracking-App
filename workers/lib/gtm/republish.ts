/**
 * `republish.ts` — Diff sync master vN → tenant container existente.
 *
 * ADR-0009 §3.4: preserva [CT-LOCAL] customizações + valores das vars [CT]
 * per-tenant (pixel IDs reais não viram PIXEL_NAO_DEFINIDO).
 *
 * Lógica:
 *   1. master tem entity name X, tenant tem X → UPDATE schema/type
 *      (mas preserva `value` em vars [CT] pra não perder pixel ID)
 *   2. master tem entity name X, tenant NÃO tem → CREATE em tenant
 *   3. tenant tem [CT-LOCAL] Y → SKIP (customização do cliente, intocável)
 *   4. tenant tem [CT] Z, master NÃO tem → LOG warning, NÃO deleta (safe-first)
 *      → Onda 2: opção dest="delete" no body request
 *
 * Sync order: templates → variables → triggers → clients → tags
 * (mesma ordem do copyContainerContents — refs precisam existir antes).
 *
 * @see ADR-0009 §3.4
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis as RedisClient } from 'ioredis';

import { GtmApiClient } from './client';
import type {
  GtmClient,
  GtmCustomTemplate,
  GtmTag,
  GtmTrigger,
  GtmVariable,
} from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepublishInput {
  tenant_id: string;
  tenant_slug: string;
  request_id?: string;
  /** Auto-publish version após sync (default true). */
  autoPublish?: boolean;
}

export interface RepublishResult {
  tenant_id: string;
  status: 'updated' | 'already_current' | 'no_changes';
  from_version: string;
  to_version: string;
  counts: {
    web: SyncCounts;
    server: SyncCounts;
  };
  warnings: string[];
}

export interface SyncCounts {
  templates: { created: number; updated: number; skipped: number };
  variables: { created: number; updated: number; preserved_value: number; skipped: number };
  triggers: { created: number; updated: number; skipped: number };
  clients: { created: number; updated: number; skipped: number };
  tags: { created: number; updated: number; skipped: number };
}

export interface RepublishDeps {
  gtmClient: GtmApiClient;
  supabase: SupabaseClient;
  redis: RedisClient;
  gtmAccountId?: string;
  lockTtlSec?: number;
}

export class RepublishLockError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Republish em andamento pra tenant ${tenantId}`);
    this.name = 'RepublishLockError';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CT_PREFIX = '[CT]';
const CT_LOCAL_PREFIX = '[CT-LOCAL]';
const DEFAULT_LOCK_TTL = 600;

// Vars cujo `value` NÃO deve ser sobrescrito (preservar config do tenant)
const PRESERVE_VALUE_VARS = new Set([
  '[CT] [Meta Ads] Pixel ID',
  '[CT] [GA4] Fluxo de Dados | ID da Métrica',
  '[CT] [GA4] Setup de Eventos',
  '[CT] [Bing UET] Tag ID',
  '[CT] [X Ads] Pixel ID',
  '[CT] [Reddit] Pixel ID',
  '[CT] [Pinterest] Tag ID',
  '[CT] [Pinterest] Advertiser ID (server)',
  '[CT] [Snap] Pixel ID',
  '[CT] [Quora] Pixel ID',
  '[CT] [Clarity] Project ID',
  '[CT] [TikTok] Pixel ID',
  '[CT] [LinkedIn] Insight Tag ID',
  '[CT] [Taboola] Pixel ID',
  '[CT] [Outbrain] Pixel ID',
  '[CT] [G Ads] ID de Conversão',
  '[CT] [G Ads] ID da Tag',
  '[CT] [GTM] Server URL',
]);

// ─── Main orchestrator ───────────────────────────────────────────────────────

export async function republishTenantContainer(
  input: RepublishInput,
  deps: RepublishDeps,
): Promise<RepublishResult> {
  const requestId = input.request_id ?? `rpb-${Date.now()}`;
  const lockKey = `gtm:republish:${input.tenant_id}`;
  const lockTtl = deps.lockTtlSec ?? DEFAULT_LOCK_TTL;
  const gtmAccountId =
    deps.gtmAccountId ?? process.env.GTM_ACCOUNT_ID ?? '6059193756';
  const warnings: string[] = [];

  const ok = await deps.redis.set(lockKey, requestId, 'EX', lockTtl, 'NX');
  if (ok !== 'OK') throw new RepublishLockError(input.tenant_id);

  // F-S14 #5 (2026-05-28 — task #64): logs granulares por step + por entity.
  // Smoke A+D revelou que republish silenciosamente NÃO sincronizou 6 tags
  // novas (Google Ads + TikTok + LinkedIn) sem warnings óbvios. Logs perdidos
  // entre deploys + redis lock orphan. Agora cada step e cada warning logado.
  const log = (msg: string) =>
    console.log(`[republish] tenant=${input.tenant_id} req=${requestId} ${msg}`);

  log('lock_acquired');

  try {
    // 1. Get tenant container + current master version
    log('step=1_fetch_tenant_container');
    const { data: tc, error: tcErr } = await deps.supabase
      .schema('core')
      .from('tenant_containers')
      .select(
        'id, web_container_internal_id, server_container_internal_id, master_version_id',
      )
      .eq('tenant_id', input.tenant_id)
      .maybeSingle();
    if (tcErr || !tc) {
      throw new Error(`Tenant ${input.tenant_id} sem container provisionado`);
    }
    log(`tenant_container_id=${tc.id} current_master_version_id=${tc.master_version_id}`);

    log('step=1_fetch_master');
    const { data: master, error: masterErr } = await deps.supabase
      .schema('core')
      .from('gtm_master_versions')
      .select(
        'id, version_name, web_master_internal_id, web_master_workspace_id, server_master_internal_id, server_master_workspace_id',
      )
      .eq('is_current', true)
      .maybeSingle();
    if (masterErr || !master) {
      throw new Error('No current master version');
    }
    log(`master_version=${master.version_name} master_version_id=${master.id}`);

    if (tc.master_version_id === master.id) {
      log('already_current — skipping sync');
      const { data: prevMaster } = await deps.supabase
        .schema('core')
        .from('gtm_master_versions')
        .select('version_name')
        .eq('id', tc.master_version_id)
        .maybeSingle();
      return {
        tenant_id: input.tenant_id,
        status: 'already_current',
        from_version: prevMaster?.version_name ?? '?',
        to_version: master.version_name,
        counts: { web: emptyCounts(), server: emptyCounts() },
        warnings: [`Tenant já está em ${master.version_name} — nada a fazer`],
      };
    }

    // 2. Resolve target workspaces (default workspace of each tenant container)
    log('step=2_fetch_workspaces');
    const webWs = await deps.gtmClient.getDefaultWorkspaceId(
      gtmAccountId,
      tc.web_container_internal_id,
    );
    const serverWs = await deps.gtmClient.getDefaultWorkspaceId(
      gtmAccountId,
      tc.server_container_internal_id,
    );
    log(`web_ws=${webWs} server_ws=${serverWs}`);

    // 3. Diff sync web
    log('step=3_sync_web start');
    const webCounts = await syncContainer({
      client: deps.gtmClient,
      accountId: gtmAccountId,
      sourceContainerId: master.web_master_internal_id,
      sourceWorkspaceId: master.web_master_workspace_id,
      targetContainerId: tc.web_container_internal_id,
      targetWorkspaceId: webWs,
      warnings,
    });
    log(
      `step=3_sync_web done tags={c:${webCounts.tags.created},u:${webCounts.tags.updated},s:${webCounts.tags.skipped}} ` +
        `vars={c:${webCounts.variables.created},u:${webCounts.variables.updated},s:${webCounts.variables.skipped}} ` +
        `tpl={c:${webCounts.templates.created},s:${webCounts.templates.skipped}}`,
    );

    // 4. Diff sync server
    log('step=4_sync_server start');
    const serverCounts = await syncContainer({
      client: deps.gtmClient,
      accountId: gtmAccountId,
      sourceContainerId: master.server_master_internal_id,
      sourceWorkspaceId: master.server_master_workspace_id,
      targetContainerId: tc.server_container_internal_id,
      targetWorkspaceId: serverWs,
      warnings,
    });
    log(
      `step=4_sync_server done tags={c:${serverCounts.tags.created},u:${serverCounts.tags.updated},s:${serverCounts.tags.skipped}}`,
    );
    log(`current_warnings_count=${warnings.length}`);
    if (warnings.length > 0) {
      // Log primeiros 5 warnings pra visibilidade (resto fica no return body)
      warnings.slice(0, 5).forEach((w, i) => log(`  warning[${i}]=${w.slice(0, 200)}`));
    }

    // 5. Publish if requested
    if (input.autoPublish !== false) {
      log('step=5_publish start');
      const webVer = await deps.gtmClient.createVersion(
        gtmAccountId,
        tc.web_container_internal_id,
        webWs,
        `republish ${master.version_name}`,
        `Diff sync from previous master to ${master.version_name} | req=${requestId}`,
      );
      await deps.gtmClient.publishVersion(
        gtmAccountId,
        tc.web_container_internal_id,
        webVer.containerVersionId,
      );
      const serverVer = await deps.gtmClient.createVersion(
        gtmAccountId,
        tc.server_container_internal_id,
        serverWs,
        `republish ${master.version_name}`,
        `Diff sync from previous master to ${master.version_name} | req=${requestId}`,
      );
      await deps.gtmClient.publishVersion(
        gtmAccountId,
        tc.server_container_internal_id,
        serverVer.containerVersionId,
      );
      log(`step=5_publish done web_ver=${webVer.containerVersionId} server_ver=${serverVer.containerVersionId}`);
    } else {
      log('step=5_publish skipped (autoPublish=false)');
    }

    // 6. Update tenant_containers
    log('step=6_update_tenant_container');
    await deps.supabase
      .schema('core')
      .from('tenant_containers')
      .update({
        master_version_id: master.id,
        last_published_at: new Date().toISOString(),
      })
      .eq('id', tc.id);

    // 7. Compute from_version
    const { data: prevMaster } = await deps.supabase
      .schema('core')
      .from('gtm_master_versions')
      .select('version_name')
      .eq('id', tc.master_version_id ?? '')
      .maybeSingle();

    return {
      tenant_id: input.tenant_id,
      status: 'updated',
      from_version: prevMaster?.version_name ?? 'unknown',
      to_version: master.version_name,
      counts: { web: webCounts, server: serverCounts },
      warnings,
    };
  } finally {
    await deps.redis.del(lockKey);
  }
}

// ─── Per-container diff sync ─────────────────────────────────────────────────

interface SyncContainerInput {
  client: GtmApiClient;
  accountId: string;
  sourceContainerId: string;
  sourceWorkspaceId: string;
  targetContainerId: string;
  targetWorkspaceId: string;
  warnings: string[];
}

async function syncContainer(opts: SyncContainerInput): Promise<SyncCounts> {
  const counts: SyncCounts = emptyCounts();

  // 1. Templates
  await syncTemplates(opts, counts);

  // After templates, listar IDs novos pra remap cvt_ types
  const targetTemplates = await opts.client.listTemplates(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const sourceTemplates = await opts.client.listTemplates(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const templateNameMap = new Map<string, string>(); // sourceTemplateId → targetTemplateId
  for (const st of sourceTemplates) {
    const tt = targetTemplates.find((t) => t.name === st.name);
    if (st.templateId && tt?.templateId) {
      templateNameMap.set(st.templateId, tt.templateId);
    }
  }

  // Helper: remap cvt_ type for new container
  const remapCvtType = (type: string): string => {
    if (!type.startsWith('cvt_')) return type;
    const parts = type.split('_');
    if (parts.length !== 3) return type;
    const targetTpl = templateNameMap.get(parts[2]);
    if (!targetTpl) return type;
    return `cvt_${opts.targetContainerId}_${targetTpl}`;
  };

  // 2. Variables (preserva value pra PRESERVE_VALUE_VARS)
  await syncVariables(opts, counts, remapCvtType);

  // 3. Triggers
  await syncTriggers(opts, counts);

  // 4. Clients (server-side)
  await syncClients(opts, counts, remapCvtType);

  // 5. Tags — precisa remap firingTriggerId via trigger name map
  const targetTriggers = await opts.client.listTriggers(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const sourceTriggers = await opts.client.listTriggers(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const triggerNameMap = new Map<string, string>();
  for (const st of sourceTriggers) {
    const tt = targetTriggers.find((t) => t.name === st.name);
    if (st.triggerId && tt?.triggerId) {
      triggerNameMap.set(st.triggerId, tt.triggerId);
    }
  }
  await syncTags(opts, counts, remapCvtType, triggerNameMap);

  return counts;
}

// ─── Templates ────────────────────────────────────────────────────────────────

async function syncTemplates(
  opts: SyncContainerInput,
  counts: SyncCounts,
): Promise<void> {
  const source = await opts.client.listTemplates(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const target = await opts.client.listTemplates(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const targetByName = new Map(target.map((t) => [t.name, t] as const));

  for (const s of source) {
    if (!shouldSync(s.name)) {
      counts.templates.skipped++;
      continue;
    }
    const existing = targetByName.get(s.name);
    if (existing) {
      // Verifica galleryReference.version → se mudou, update templateData
      const srcVer = s.galleryReference?.version;
      const tgtVer = existing.galleryReference?.version;
      if (srcVer && srcVer !== tgtVer) {
        // Update via createTemplate retorna conflict — em GTM API templates só
        // criam (conflict) ou requerem PUT específico. MVP: log warning + skip
        // (gallery updates via UI prompt já é o caminho).
        opts.warnings.push(
          `Template "${s.name}" gallery v=${tgtVer?.slice(0, 8)} → v=${srcVer.slice(0, 8)} (sync manual via UI)`,
        );
        counts.templates.updated++;
      } else {
        counts.templates.skipped++;
      }
    } else {
      // Create
      try {
        await opts.client.createTemplate(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          {
            name: s.name,
            templateData: s.templateData,
            galleryReference: s.galleryReference,
          },
        );
        counts.templates.created++;
      } catch (err) {
        opts.warnings.push(`Template create failed "${s.name}": ${(err as Error).message}`);
      }
    }
  }
}

// ─── Variables (preserve value) ──────────────────────────────────────────────

async function syncVariables(
  opts: SyncContainerInput,
  counts: SyncCounts,
  remapCvtType: (t: string) => string,
): Promise<void> {
  const source = await opts.client.listVariables(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const target = await opts.client.listVariables(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const targetByName = new Map(target.map((v) => [v.name, v] as const));

  for (const s of source) {
    if (!shouldSync(s.name)) {
      counts.variables.skipped++;
      continue;
    }
    const existing = targetByName.get(s.name);
    if (existing) {
      // Update — preserva value se está em PRESERVE_VALUE_VARS
      const preserveValue = PRESERVE_VALUE_VARS.has(s.name);
      const newParams = s.parameter?.map((p) => {
        if (
          preserveValue &&
          p.key === 'value' &&
          existing.parameter?.find((ep) => ep.key === 'value')
        ) {
          const existingValue = existing.parameter.find((ep) => ep.key === 'value');
          return { ...p, value: existingValue?.value ?? p.value };
        }
        return p;
      });
      try {
        await opts.client.updateVariable(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          existing.variableId!,
          {
            name: s.name,
            type: remapCvtType(s.type),
            parameter: newParams,
            notes: s.notes,
          },
        );
        if (preserveValue) counts.variables.preserved_value++;
        else counts.variables.updated++;
      } catch (err) {
        opts.warnings.push(`Variable update failed "${s.name}": ${(err as Error).message}`);
      }
    } else {
      // Create
      try {
        await opts.client.createVariable(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          {
            name: s.name,
            type: remapCvtType(s.type),
            parameter: s.parameter,
            notes: s.notes,
          } as GtmVariable,
        );
        counts.variables.created++;
      } catch (err) {
        opts.warnings.push(`Variable create failed "${s.name}": ${(err as Error).message}`);
      }
    }
  }
}

// ─── Triggers ────────────────────────────────────────────────────────────────

async function syncTriggers(
  opts: SyncContainerInput,
  counts: SyncCounts,
): Promise<void> {
  const source = await opts.client.listTriggers(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const target = await opts.client.listTriggers(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const targetByName = new Map(target.map((t) => [t.name, t] as const));

  for (const s of source) {
    if (!shouldSync(s.name)) {
      counts.triggers.skipped++;
      continue;
    }
    const existing = targetByName.get(s.name);
    if (existing) {
      // Trigger update via API requires full body — skip pra MVP (raro mudar trigger)
      counts.triggers.skipped++;
    } else {
      try {
        const { triggerId: _, ...body } = s;
        await opts.client.createTrigger(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          body as GtmTrigger,
        );
        counts.triggers.created++;
      } catch (err) {
        opts.warnings.push(`Trigger create failed "${s.name}": ${(err as Error).message}`);
      }
    }
  }
}

// ─── Clients (server) ────────────────────────────────────────────────────────

async function syncClients(
  opts: SyncContainerInput,
  counts: SyncCounts,
  remapCvtType: (t: string) => string,
): Promise<void> {
  const source = await opts.client.listClients(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const target = await opts.client.listClients(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const targetByName = new Map(target.map((c) => [c.name, c] as const));

  for (const s of source) {
    if (!shouldSync(s.name)) {
      counts.clients.skipped++;
      continue;
    }
    const existing = targetByName.get(s.name);
    if (existing) {
      counts.clients.skipped++;
    } else {
      try {
        const { clientId: _, ...body } = s;
        await opts.client.createClient(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          { ...body, type: remapCvtType(s.type) } as GtmClient,
        );
        counts.clients.created++;
      } catch (err) {
        opts.warnings.push(`Client create failed "${s.name}": ${(err as Error).message}`);
      }
    }
  }
}

// ─── Tags ────────────────────────────────────────────────────────────────────

async function syncTags(
  opts: SyncContainerInput,
  counts: SyncCounts,
  remapCvtType: (t: string) => string,
  triggerNameMap: Map<string, string>,
): Promise<void> {
  const source = await opts.client.listTags(
    opts.accountId,
    opts.sourceContainerId,
    opts.sourceWorkspaceId,
  );
  const target = await opts.client.listTags(
    opts.accountId,
    opts.targetContainerId,
    opts.targetWorkspaceId,
  );
  const targetByName = new Map(target.map((t) => [t.name, t] as const));

  for (const s of source) {
    if (!shouldSync(s.name)) {
      counts.tags.skipped++;
      continue;
    }
    const remappedTriggers = s.firingTriggerId?.map(
      (id) => triggerNameMap.get(id) ?? id,
    );
    const existing = targetByName.get(s.name);
    if (existing) {
      // Skip MVP — tag update preserva paused state, etc. Complexo.
      counts.tags.skipped++;
    } else {
      try {
        const { tagId: _, ...body } = s;
        await opts.client.createTag(
          opts.accountId,
          opts.targetContainerId,
          opts.targetWorkspaceId,
          {
            ...body,
            type: remapCvtType(s.type),
            firingTriggerId: remappedTriggers,
          } as GtmTag,
        );
        counts.tags.created++;
      } catch (err) {
        opts.warnings.push(`Tag create failed "${s.name}": ${(err as Error).message}`);
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tags/vars/triggers que NÃO devem ser sincronizados (out-of-scope master). */
function shouldSync(name: string): boolean {
  if (name.startsWith(CT_LOCAL_PREFIX)) return false; // customização do cliente
  // Built-in vars (Page URL, Event, etc.) começam sem prefix [CT]
  // Master também não tem essas. Só syncing [CT]*
  if (!name.startsWith(CT_PREFIX)) {
    // Names sem [CT] no MASTER são tools internos (não sync)
    return false;
  }
  return true;
}

function emptyCounts(): SyncCounts {
  return {
    templates: { created: 0, updated: 0, skipped: 0 },
    variables: { created: 0, updated: 0, preserved_value: 0, skipped: 0 },
    triggers: { created: 0, updated: 0, skipped: 0 },
    clients: { created: 0, updated: 0, skipped: 0 },
    tags: { created: 0, updated: 0, skipped: 0 },
  };
}
