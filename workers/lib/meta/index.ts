/**
 * Public API do módulo `workers/lib/meta/`.
 *
 * Conector Meta Ads (System User Token paste, MVP sem OAuth): client Graph API
 * v21.0 + helper de gravação do pixel na var [CT] do container GTM + erros.
 */

export { MetaClient, getMetaClient } from './client';
export type {
  MetaClientOpts,
  MetaAdAccount,
  MetaPixel,
  MetaTokenInfo,
} from './client';

export {
  MetaApiError,
  MetaTokenInvalidError,
  MetaRateLimitError,
  MetaPermissionError,
} from './errors';

export { updateTenantMetaPixel, META_PIXEL_VAR_NAME } from './pixelVar';
export type { UpdateMetaPixelInput, UpdateMetaPixelResult } from './pixelVar';
