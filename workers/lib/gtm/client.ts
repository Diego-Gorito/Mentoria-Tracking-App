/**
 * `GtmApiClient` — wrapper sobre Google Tag Manager API v2.
 *
 * Endpoints + métodos necessários pro fluxo de provision (ADR-0009 §5):
 *  - `getCurrentMasterVersion()` — consulta core.gtm_master_versions
 *  - `createContainer(name, usageContext)` — POST /accounts/{a}/containers
 *  - `listEntities(container, workspace, kind)` — GET vars/triggers/tags/templates/clients
 *  - `createEntity(container, workspace, kind, payload)` — POST individual
 *  - `updateVariableValue(...)` — PUT vars com novo value (parametrização)
 *  - `createVersion(container, workspace, name)` — snapshot
 *  - `publishVersion(container, version)` — go live
 *  - `copyContainerContents(input)` — orquestra clone master → tenant
 *
 * Rate limit: p-limit({ concurrency: 1 }) + 100ms delay entre calls (~50 calls/5s).
 * Retry: 429 + 5xx via exponential backoff [1s, 2s, 4s].
 *
 * @see ADR-0009 §5.2 (pseudocódigo provision)
 * @see workers/lib/gtm/auth.ts
 */

import pLimit from 'p-limit';
import { getGtmAccessToken } from './auth';
import {
  GtmApiError,
  GtmAuthError,
  GtmConflictError,
  GtmRateLimitError,
  classifyGtmError,
} from './errors';
import type {
  CloneContainerInput,
  CloneResult,
  CloneStep,
  GtmClient,
  GtmContainer,
  GtmContainerVersion,
  GtmCustomTemplate,
  GtmTag,
  GtmTrigger,
  GtmVariable,
} from './types';

const GTM_API_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2';
/**
 * Throttle default 500ms = ~120 req/min.
 * GTM API limit observado em smoke E2E 2026-05-28: "Queries per minute per user"
 * trip em ~60-120 req/min. Master web V2 tem ~140 entities, então 100ms estourava
 * o limit ANTES de copy_tags terminar. 500ms é folga generosa pra batches grandes.
 */
const DEFAULT_THROTTLE_MS = 500;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;
/**
 * Backoff longo porque rate limit "per minute" precisa esperar > 60s pra reset.
 * [1s, 5s, 15s, 60s] = total até 81s antes de falhar definitivo.
 */
const RETRY_DELAYS_MS = [1000, 5000, 15000, 60000];

export interface GtmApiClientOpts {
  /** Throttle entre requests (default 100ms = ~10 req/s). */
  throttleMs?: number;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Custom auth token getter (testing). */
  getAccessToken?: () => Promise<string>;
}

export class GtmApiClient {
  private readonly limiter = pLimit(1);
  private readonly throttleMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenGetter: () => Promise<string>;
  private lastRequestAt = 0;

  constructor(opts: GtmApiClientOpts = {}) {
    this.throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.tokenGetter = opts.getAccessToken ?? getGtmAccessToken;
  }

  // ─── Generic HTTP wrapper ────────────────────────────────────────────────

  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.limiter(async () => {
      const wait = Math.max(0, this.throttleMs - (Date.now() - this.lastRequestAt));
      if (wait > 0) await sleep(wait);

      let attempt = 0;
      while (true) {
        attempt++;
        const token = await this.tokenGetter();
        const url = `${GTM_API_BASE}${path}`;
        try {
          const res = await this.fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          this.lastRequestAt = Date.now();

          if (res.ok) {
            // 204 No Content (DELETE) → return empty
            if (res.status === 204) return undefined as T;
            return (await res.json()) as T;
          }

          // Erro: parse + classify
          const errBody = await safeJson(res);
          const classified = classifyGtmError(res.status, errBody);

          // Retry: 429 ou 5xx
          if (
            (classified instanceof GtmRateLimitError ||
              (res.status >= 500 && res.status < 600)) &&
            attempt < MAX_RETRIES
          ) {
            const delay = RETRY_DELAYS_MS[attempt - 1] ?? 4000;
            await sleep(delay);
            continue;
          }
          throw classified;
        } catch (err) {
          // Network errors / timeouts → retry se ainda houver tentativa
          if (
            err instanceof TypeError ||
            (err as Error)?.name === 'TimeoutError' ||
            (err as Error)?.name === 'AbortError'
          ) {
            if (attempt < MAX_RETRIES) {
              const delay = RETRY_DELAYS_MS[attempt - 1] ?? 4000;
              await sleep(delay);
              continue;
            }
          }
          throw err;
        }
      }
    });
  }

  // ─── Container ops ───────────────────────────────────────────────────────

  async getContainer(accountId: string, containerId: string): Promise<GtmContainer> {
    return this.request<GtmContainer>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}`,
    );
  }

  async createContainer(
    accountId: string,
    name: string,
    usageContext: ('web' | 'server')[],
  ): Promise<GtmContainer> {
    return this.request<GtmContainer>('POST', `/accounts/${accountId}/containers`, {
      name,
      usageContext,
    });
  }

  async deleteContainer(accountId: string, containerId: string): Promise<void> {
    await this.request('DELETE', `/accounts/${accountId}/containers/${containerId}`);
  }

  async listContainers(accountId: string): Promise<GtmContainer[]> {
    const r = await this.request<{ container?: GtmContainer[] }>(
      'GET',
      `/accounts/${accountId}/containers`,
    );
    return r.container ?? [];
  }

  // ─── List entities ───────────────────────────────────────────────────────

  async listVariables(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<GtmVariable[]> {
    const r = await this.request<{ variable?: GtmVariable[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`,
    );
    return r.variable ?? [];
  }

  async listTriggers(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<GtmTrigger[]> {
    const r = await this.request<{ trigger?: GtmTrigger[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`,
    );
    return r.trigger ?? [];
  }

  async listTags(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<GtmTag[]> {
    const r = await this.request<{ tag?: GtmTag[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`,
    );
    return r.tag ?? [];
  }

  async listTemplates(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<GtmCustomTemplate[]> {
    const r = await this.request<{ template?: GtmCustomTemplate[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates`,
    );
    return r.template ?? [];
  }

  async listClients(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<GtmClient[]> {
    const r = await this.request<{ client?: GtmClient[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/clients`,
    );
    return r.client ?? [];
  }

  // ─── Create entities (raw — preserva fingerprint mas omite IDs/path) ─────

  async createVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    body: Omit<GtmVariable, 'path' | 'accountId' | 'containerId' | 'workspaceId' | 'variableId' | 'fingerprint'>,
  ): Promise<GtmVariable> {
    return this.request<GtmVariable>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`,
      body,
    );
  }

  async updateVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    variableId: string,
    body: Partial<GtmVariable>,
  ): Promise<GtmVariable> {
    return this.request<GtmVariable>(
      'PUT',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${variableId}`,
      body,
    );
  }

  async createTrigger(
    accountId: string,
    containerId: string,
    workspaceId: string,
    body: Omit<GtmTrigger, 'path' | 'accountId' | 'containerId' | 'workspaceId' | 'triggerId' | 'fingerprint'>,
  ): Promise<GtmTrigger> {
    return this.request<GtmTrigger>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`,
      body,
    );
  }

  async createTag(
    accountId: string,
    containerId: string,
    workspaceId: string,
    body: Omit<GtmTag, 'path' | 'accountId' | 'containerId' | 'workspaceId' | 'tagId' | 'fingerprint'>,
  ): Promise<GtmTag> {
    return this.request<GtmTag>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`,
      body,
    );
  }

  async createTemplate(
    accountId: string,
    containerId: string,
    workspaceId: string,
    body: Pick<GtmCustomTemplate, 'name' | 'templateData' | 'galleryReference'>,
  ): Promise<GtmCustomTemplate> {
    return this.request<GtmCustomTemplate>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates`,
      body,
    );
  }

  async createClient(
    accountId: string,
    containerId: string,
    workspaceId: string,
    body: Omit<GtmClient, 'path' | 'accountId' | 'containerId' | 'workspaceId' | 'clientId' | 'fingerprint'>,
  ): Promise<GtmClient> {
    return this.request<GtmClient>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/clients`,
      body,
    );
  }

  // ─── Version + Publish ───────────────────────────────────────────────────

  async getDefaultWorkspaceId(
    accountId: string,
    containerId: string,
  ): Promise<string> {
    const r = await this.request<{ workspace?: { workspaceId: string; name: string }[] }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces`,
    );
    if (!r.workspace || r.workspace.length === 0) {
      throw new GtmApiError('No workspaces found for container', 500);
    }
    return r.workspace[0].workspaceId;
  }

  async createVersion(
    accountId: string,
    containerId: string,
    workspaceId: string,
    name: string,
    notes?: string,
  ): Promise<GtmContainerVersion> {
    const r = await this.request<{
      containerVersion?: GtmContainerVersion;
      compilerError?: boolean;
    }>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}:create_version`,
      { name, notes },
    );
    if (!r.containerVersion) {
      throw new GtmApiError('createVersion: missing containerVersion in response', 500);
    }
    // F-S14 #3 (2026-05-28): GTM API retorna HTTP 200 com compilerError:true
    // quando workspace tem refs broken (var/trigger/template não resolvido).
    // O containerVersion retornado tem ID fake (não persistido) e publishVersion
    // bate 404 com "Not found or permission denied". Falhamos cedo com erro
    // descritivo em vez de blindly seguir.
    if (r.compilerError === true) {
      throw new GtmApiError(
        `createVersion: workspace has compilerError (broken refs in entities). ` +
          `Run quick_preview to inspect. Container: ${containerId}, Workspace: ${workspaceId}`,
        500,
      );
    }
    return r.containerVersion;
  }

  async publishVersion(
    accountId: string,
    containerId: string,
    versionId: string,
  ): Promise<void> {
    await this.request(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`,
    );
  }

  // ─── Built-in variables ─────────────────────────────────────────────────
  //
  // Built-in vars (Page URL, Click ID, Form Element, etc.) NÃO são clonadas
  // pelo copyContainerContents do tracking-api. Container novo começa com
  // apenas 5 built-ins ativados (Page URL/Hostname/Path, Referrer, Event).
  // Master GTM-WLZ3H8VH tem 10 ativados (+ Click *) — tags/triggers do clone
  // que referenciem {{Click URL}} batem compilerError porque a built-in
  // não está ativada no workspace alvo.
  //
  // F-S14 #3 fix (2026-05-28): copyContainerContents passa a chamar
  // listBuiltInVariables(source) → enableBuiltInVariables(target, missingTypes)
  // antes de copiar tags/triggers/vars.

  /** Lista built-in variables ATIVADAS no workspace. */
  async listBuiltInVariables(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<Array<{ type: string; name: string }>> {
    const r = await this.request<{
      builtInVariable?: Array<{ type: string; name: string }>;
    }>(
      'GET',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/built_in_variables`,
    );
    return r.builtInVariable ?? [];
  }

  /**
   * Ativa um conjunto de built-in vars no workspace. Endpoint aceita múltiplos
   * `type=X` na query string em uma só chamada.
   *
   * @param types array de tipos GTM oficiais ex: ['clickClasses','clickElement']
   *   Lista canônica: https://developers.google.com/tag-platform/tag-manager/api/v2/reference/accounts/containers/workspaces/built_in_variables#BuiltInVariable.Type
   */
  async enableBuiltInVariables(
    accountId: string,
    containerId: string,
    workspaceId: string,
    types: string[],
  ): Promise<void> {
    if (types.length === 0) return;
    const qs = types.map((t) => `type=${encodeURIComponent(t)}`).join('&');
    await this.request(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/built_in_variables?${qs}`,
    );
  }

  // ─── Clone orchestration ─────────────────────────────────────────────────

  /**
   * Copia o conteúdo COMPLETO de um workspace source → workspace target.
   * Ordem matters: variables/triggers/templates/clients ANTES de tags
   * (tags referenciam outras entities).
   *
   * Remap de references: como IDs no target diferem do source, mantemos idMap
   * pra reescrever `firingTriggerId`, `enablingTriggerId`, etc., antes do
   * POST de cada tag.
   *
   * ADR-0009 §5.2 step "clone web container".
   */
  async copyContainerContents(input: CloneContainerInput): Promise<CloneResult> {
    const {
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
      targetAccountId,
      targetContainerId,
      targetWorkspaceId,
      onProgress,
    } = input;
    const progress = (step: CloneStep, detail?: string) =>
      onProgress?.(step, detail);

    progress('init');

    const idMap: CloneResult['idMap'] = {
      variables: new Map(),
      triggers: new Map(),
      templates: new Map(),
      clients: new Map(),
      tags: new Map(),
    };

    // 0. Built-in variables — ativar TODAS que master tem ativadas no target.
    //
    // F-S14 #3 fix (2026-05-28): sem isso, tags/triggers referenciando
    // {{Click URL}}, {{Click Classes}}, {{Form ID}}, etc. batem compilerError
    // no workspace alvo → createVersion retorna ID fake → publishVersion 404.
    try {
      const srcBuiltins = await this.listBuiltInVariables(
        sourceAccountId,
        sourceContainerId,
        sourceWorkspaceId,
      );
      const tgtBuiltins = await this.listBuiltInVariables(
        targetAccountId,
        targetContainerId,
        targetWorkspaceId,
      );
      const tgtTypes = new Set(tgtBuiltins.map((b) => b.type));
      const missing = srcBuiltins
        .map((b) => b.type)
        .filter((t) => !tgtTypes.has(t));
      if (missing.length > 0) {
        await this.enableBuiltInVariables(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          missing,
        );
      }
      progress(
        'init',
        `built_in_vars: ${srcBuiltins.length} src, ${tgtBuiltins.length} tgt, ${missing.length} ativadas`,
      );
    } catch (err) {
      // Don't fail entire clone se built-in copy falhar — workspace pode
      // ter algumas tags inutilizáveis mas resto funciona. Audit logging
      // do tracking-api captura. Log warn pra debug.
      console.warn(
        '[gtm.copyContainerContents] built_in_variables copy failed:',
        err instanceof Error ? err.message : String(err),
      );
    }

    // 1. Templates first (referenciados por type cvt_X)
    progress('copy_templates');
    const templates = await this.listTemplates(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    let tCount = 0;
    for (const t of templates) {
      const cleaned = {
        name: t.name,
        templateData: t.templateData,
        galleryReference: t.galleryReference,
      };
      try {
        const created = await this.createTemplate(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          cleaned,
        );
        if (t.templateId && created.templateId) {
          idMap.templates.set(t.templateId, created.templateId);
        }
        tCount++;
      } catch (err) {
        if (err instanceof GtmConflictError) {
          // Template já existe (ex: gallery template puro com mesmo galleryTemplateId)
          // Continua — não bloqueia clone
          continue;
        }
        throw err;
      }
    }
    progress('copy_templates', `${tCount}/${templates.length} copiados`);

    // 2. Variables (sem refs a triggers ainda → safe primeiro)
    progress('copy_variables');
    const variables = await this.listVariables(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    const existingTargetVariables = await this.listVariables(
      targetAccountId,
      targetContainerId,
      targetWorkspaceId,
    );
    const existingVariableNames = new Set(
      existingTargetVariables.map((v) => v.name),
    );
    let vCount = 0;
    for (const v of variables) {
      if (existingVariableNames.has(v.name)) continue;
      const remapped = remapVariableType(v, idMap.templates, targetContainerId);
      const cleaned = stripIds(remapped, 'variableId');
      try {
        const created = await this.createVariable(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          cleaned as GtmVariable,
        );
        if (v.variableId && created.variableId) {
          idMap.variables.set(v.variableId, created.variableId);
        }
        vCount++;
      } catch (err) {
        if (err instanceof GtmConflictError) continue;
        throw err;
      }
    }
    progress('copy_variables', `${vCount}`);

    // 3. Triggers (pre-list pra skip auto-criados)
    progress('copy_triggers');
    const triggers = await this.listTriggers(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    const existingTargetTriggers = await this.listTriggers(
      targetAccountId,
      targetContainerId,
      targetWorkspaceId,
    );
    const existingTriggerNames = new Set(
      existingTargetTriggers.map((t) => t.name),
    );
    let trgCount = 0;
    for (const t of triggers) {
      if (existingTriggerNames.has(t.name)) continue;
      const cleaned = stripIds(t, 'triggerId') as GtmTrigger;
      try {
        const created = await this.createTrigger(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          cleaned,
        );
        if (t.triggerId && created.triggerId) {
          idMap.triggers.set(t.triggerId, created.triggerId);
        }
        trgCount++;
      } catch (err) {
        if (err instanceof GtmConflictError) continue;
        throw err;
      }
    }
    progress('copy_triggers', `${trgCount}`);

    // 4. Clients (server-side containers)
    // FIX 2026-05-28: GTM auto-cria "GA4" Client default em novos containers
    // server. Pre-list target → skip duplicates por name pra evitar 400 conflict.
    progress('copy_clients');
    const clients = await this.listClients(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    const existingTargetClients = await this.listClients(
      targetAccountId,
      targetContainerId,
      targetWorkspaceId,
    );
    const existingClientNames = new Set(existingTargetClients.map((c) => c.name));
    let cCount = 0;
    for (const c of clients) {
      if (existingClientNames.has(c.name)) {
        // Já existe (ex: GA4 default) — pula
        continue;
      }
      const remapped = remapClientType(c, idMap.templates, targetContainerId);
      const cleaned = stripIds(remapped, 'clientId') as GtmClient;
      try {
        const created = await this.createClient(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          cleaned,
        );
        if (c.clientId && created.clientId) {
          idMap.clients.set(c.clientId, created.clientId);
        }
        cCount++;
      } catch (err) {
        if (err instanceof GtmConflictError) continue;
        throw err;
      }
    }
    progress('copy_clients', `${cCount}`);

    // 5. Tags (referenciam triggers + templates → remap)
    progress('copy_tags');
    const tags = await this.listTags(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    const existingTargetTags = await this.listTags(
      targetAccountId,
      targetContainerId,
      targetWorkspaceId,
    );
    const existingTagNames = new Set(existingTargetTags.map((t) => t.name));
    let tagCount = 0;
    for (const t of tags) {
      if (existingTagNames.has(t.name)) continue; // skip duplicates (auto-criados)
      const remapped = remapTagRefs(t, idMap, targetContainerId);
      const cleaned = stripIds(remapped, 'tagId') as GtmTag;
      try {
        await this.createTag(
          targetAccountId,
          targetContainerId,
          targetWorkspaceId,
          cleaned,
        );
        tagCount++;
      } catch (err) {
        if (err instanceof GtmConflictError) continue;
        throw err;
      }
    }
    progress('copy_tags', `${tagCount}`);

    progress('complete');

    return {
      copiedCounts: {
        templates: tCount,
        variables: vCount,
        triggers: trgCount,
        clients: cCount,
        tags: tagCount,
      },
      idMap,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return await res.text();
  }
}

/** Remove IDs auto-generated antes de POST pra evitar conflict. */
function stripIds<T extends object>(entity: T, ...idFields: (keyof T | string)[]): Partial<T> {
  const cleaned: Partial<T> = { ...entity };
  delete (cleaned as Record<string, unknown>).path;
  delete (cleaned as Record<string, unknown>).accountId;
  delete (cleaned as Record<string, unknown>).containerId;
  delete (cleaned as Record<string, unknown>).workspaceId;
  delete (cleaned as Record<string, unknown>).fingerprint;
  delete (cleaned as Record<string, unknown>).tagManagerUrl;
  for (const f of idFields) {
    delete (cleaned as Record<string, unknown>)[f as string];
  }
  return cleaned;
}

/**
 * Variable type pode ser `cvt_{containerId}_{templateId}` referenciando custom
 * template. Quando clonamos pra novo container, esse type fica inválido pois
 * GTM rejeita "Unknown entity type" — o cvt_ precisa apontar pro NOVO container.
 *
 * Reescreve pra `cvt_{targetContainerId}_{newTemplateId}` se mapping existe.
 * Gallery templates (formato `cvt_GALLERYID` sem container) ficam intactos.
 *
 * FIX 2026-05-28: antes mantinha parts[1] (source containerId), GTM 400.
 */
function remapVariableType(
  v: GtmVariable,
  templateMap: Map<string, string>,
  targetContainerId: string,
): GtmVariable {
  if (!v.type.startsWith('cvt_')) return v;
  const parts = v.type.split('_');
  // formato esperado: cvt_{containerId}_{templateId} OR cvt_{galleryId} (gallery)
  if (parts.length !== 3) return v; // gallery template, mesmo type funciona em qq container
  const sourceTemplateId = parts[2];
  const targetTemplateId = templateMap.get(sourceTemplateId);
  if (!targetTemplateId) return v;
  return { ...v, type: `cvt_${targetContainerId}_${targetTemplateId}` };
}

function remapClientType(
  c: GtmClient,
  templateMap: Map<string, string>,
  targetContainerId: string,
): GtmClient {
  if (!c.type.startsWith('cvt_')) return c;
  const parts = c.type.split('_');
  if (parts.length !== 3) return c;
  const sourceTemplateId = parts[2];
  const targetTemplateId = templateMap.get(sourceTemplateId);
  if (!targetTemplateId) return c;
  return { ...c, type: `cvt_${targetContainerId}_${targetTemplateId}` };
}

/**
 * Tag refs:
 *  - firingTriggerId (string[])
 *  - blockingTriggerId (string[])
 *  - type (cvt_X se custom template)
 *  - parameter[] pode ter `tagReference` apontando outras tags (não tratado no MVP)
 */
function remapTagRefs(
  t: GtmTag,
  idMap: CloneResult['idMap'],
  targetContainerId: string,
): GtmTag {
  const remapTriggerIds = (arr?: string[]) =>
    arr?.map((id) => idMap.triggers.get(id) ?? id);

  let type = t.type;
  if (type.startsWith('cvt_')) {
    const parts = type.split('_');
    if (parts.length === 3) {
      const target = idMap.templates.get(parts[2]);
      if (target) type = `cvt_${targetContainerId}_${target}`;
    }
  }

  return {
    ...t,
    type,
    firingTriggerId: remapTriggerIds(t.firingTriggerId),
    blockingTriggerId: remapTriggerIds(t.blockingTriggerId),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let cachedClient: GtmApiClient | null = null;

/** Singleton client. Default opts. */
export function getGtmClient(opts?: GtmApiClientOpts): GtmApiClient {
  if (!cachedClient || opts) {
    cachedClient = new GtmApiClient(opts);
  }
  return cachedClient;
}

/** Test only — reset cache. */
export function _resetGtmClient(): void {
  cachedClient = null;
}
