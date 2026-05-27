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
const DEFAULT_THROTTLE_MS = 100;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

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
    const r = await this.request<{ containerVersion?: GtmContainerVersion }>(
      'POST',
      `/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}:create_version`,
      { name, notes },
    );
    if (!r.containerVersion) {
      throw new GtmApiError('createVersion: missing containerVersion in response', 500);
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
    let vCount = 0;
    for (const v of variables) {
      const remapped = remapVariableType(v, idMap.templates);
      const cleaned = stripIds(remapped, 'variableId');
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
    }
    progress('copy_variables', `${vCount}`);

    // 3. Triggers
    progress('copy_triggers');
    const triggers = await this.listTriggers(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    let trgCount = 0;
    for (const t of triggers) {
      const cleaned = stripIds(t, 'triggerId') as GtmTrigger;
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
    }
    progress('copy_triggers', `${trgCount}`);

    // 4. Clients (server-side containers)
    progress('copy_clients');
    const clients = await this.listClients(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    let cCount = 0;
    for (const c of clients) {
      const remapped = remapClientType(c, idMap.templates);
      const cleaned = stripIds(remapped, 'clientId') as GtmClient;
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
    }
    progress('copy_clients', `${cCount}`);

    // 5. Tags (referenciam triggers + templates → remap)
    progress('copy_tags');
    const tags = await this.listTags(
      sourceAccountId,
      sourceContainerId,
      sourceWorkspaceId,
    );
    let tagCount = 0;
    for (const t of tags) {
      const remapped = remapTagRefs(t, idMap);
      const cleaned = stripIds(remapped, 'tagId') as GtmTag;
      await this.createTag(
        targetAccountId,
        targetContainerId,
        targetWorkspaceId,
        cleaned,
      );
      tagCount++;
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
 * template. Quando clonamos pra novo container, esse type fica inválido.
 * Reescreve pra `cvt_{newContainerId}_{newTemplateId}` se mapping existe.
 */
function remapVariableType(v: GtmVariable, templateMap: Map<string, string>): GtmVariable {
  if (!v.type.startsWith('cvt_')) return v;
  const parts = v.type.split('_');
  // formato esperado: cvt_{containerId}_{templateId} OR cvt_{galleryId} (gallery)
  if (parts.length !== 3) return v; // gallery template, mesmo type funciona em qq container
  const sourceTemplateId = parts[2];
  const targetTemplateId = templateMap.get(sourceTemplateId);
  if (!targetTemplateId) return v;
  // parts[1] é containerId — substituímos pelo target. Caller passa containerId mas
  // como type é só string, deixamos o caller corrigir via post-process se necessário.
  // MVP: assume mesmo formato; remap só templateId.
  return { ...v, type: `${parts[0]}_${parts[1]}_${targetTemplateId}` };
}

function remapClientType(c: GtmClient, templateMap: Map<string, string>): GtmClient {
  if (!c.type.startsWith('cvt_')) return c;
  const parts = c.type.split('_');
  if (parts.length !== 3) return c;
  const sourceTemplateId = parts[2];
  const targetTemplateId = templateMap.get(sourceTemplateId);
  if (!targetTemplateId) return c;
  return { ...c, type: `${parts[0]}_${parts[1]}_${targetTemplateId}` };
}

/**
 * Tag refs:
 *  - firingTriggerId (string[])
 *  - blockingTriggerId (string[])
 *  - type (cvt_X se custom template)
 *  - parameter[] pode ter `tagReference` apontando outras tags (não tratado no MVP)
 */
function remapTagRefs(t: GtmTag, idMap: CloneResult['idMap']): GtmTag {
  const remapTriggerIds = (arr?: string[]) =>
    arr?.map((id) => idMap.triggers.get(id) ?? id);

  let type = t.type;
  if (type.startsWith('cvt_')) {
    const parts = type.split('_');
    if (parts.length === 3) {
      const target = idMap.templates.get(parts[2]);
      if (target) type = `${parts[0]}_${parts[1]}_${target}`;
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
