/**
 * `pixelVar.ts` — escreve o Meta Pixel ID selecionado na var
 * `[CT] [Meta Ads] Pixel ID` do container WEB do tenant + publica nova versão.
 *
 * MECANISMO ESCOLHIDO (targeted var update, NÃO republish):
 *   republishTenantContainer faz diff-sync do master e PRESERVA o `value` das
 *   vars [CT] (a var está em PRESERVE_VALUE_VARS), justamente pra não sobrescrever
 *   o pixel do tenant. Logo republish NÃO conseguiria *gravar* um pixel novo.
 *   Em vez disso fazemos um update cirúrgico da única variable, espelhando o que
 *   `updateWebPixelVars` faz em provision.ts (mesma lógica de PUT no parameter
 *   `value`), e publicamos uma versão web isolada. Barato (1 var + 1 publish) e
 *   idempotente.
 *
 * @see workers/lib/gtm/provision.ts (updateWebPixelVars — fonte do padrão)
 */

import type { GtmApiClient } from '../gtm/client';
import type { GtmVariable } from '../gtm/types';

/** Nome canônico da variable de pixel Meta no master/clone (ADR-0009 §3.6). */
export const META_PIXEL_VAR_NAME = '[CT] [Meta Ads] Pixel ID';

export interface UpdateMetaPixelInput {
  /** ID interno (numérico) do container WEB do tenant. */
  webContainerInternalId: string;
  /** Pixel ID a gravar na var. */
  pixelId: string;
  /** GTM account ID (default env GTM_ACCOUNT_ID). */
  gtmAccountId?: string;
  /** request_id pra rastrear na nota da versão. */
  requestId?: string;
  /** Publica a versão após o update (default true). */
  autoPublish?: boolean;
}

export interface UpdateMetaPixelResult {
  updated: boolean;
  /** ID da versão criada (se autoPublish). */
  versionId?: string;
  /** Motivo quando updated=false (ex: var não existe no container). */
  reason?: string;
}

/**
 * Atualiza a var [CT] [Meta Ads] Pixel ID do container web e publica.
 * Retorna `updated:false` (sem throw) se a var não existir — container pode ter
 * sido provisionado de um master antigo sem a var; caller loga e segue.
 */
export async function updateTenantMetaPixel(
  client: GtmApiClient,
  input: UpdateMetaPixelInput,
): Promise<UpdateMetaPixelResult> {
  const accountId = input.gtmAccountId ?? process.env.GTM_ACCOUNT_ID ?? '6059193756';
  const containerId = input.webContainerInternalId;

  const workspaceId = await client.getDefaultWorkspaceId(accountId, containerId);
  const allVars = await client.listVariables(accountId, containerId, workspaceId);
  const v = allVars.find((x) => x.name === META_PIXEL_VAR_NAME);

  if (!v || !v.variableId) {
    return { updated: false, reason: `Variable "${META_PIXEL_VAR_NAME}" não existe no container ${containerId}` };
  }

  // Update value (var é tipo 'c' = constant com parameter[0].key='value').
  const updated: Partial<GtmVariable> = {
    name: v.name,
    type: v.type,
    parameter: v.parameter?.map((p) =>
      p.key === 'value' ? { ...p, value: input.pixelId } : p,
    ),
    notes: v.notes,
  };
  await client.updateVariable(accountId, containerId, workspaceId, v.variableId, updated);

  if (input.autoPublish === false) {
    return { updated: true };
  }

  const ver = await client.createVersion(
    accountId,
    containerId,
    workspaceId,
    `Meta Pixel ID update`,
    `Conector Meta Ads gravou pixel na var ${META_PIXEL_VAR_NAME} | req=${input.requestId ?? 'n/a'}`,
  );
  await client.publishVersion(accountId, containerId, ver.containerVersionId);

  return { updated: true, versionId: ver.containerVersionId };
}
