/**
 * Public API do módulo `workers/lib/gtm/`.
 *
 * Service Account auth + GTM API client + types + errors.
 *
 * @see ADR-0009 GTM Master Clone Architecture
 */

export {
  DEFAULT_GTM_SCOPES,
  getGtmAccessToken,
  getGtmAuth,
  getServiceAccountEmail,
  loadServiceAccountKey,
  _resetAuthCache,
} from './auth';

export { GtmApiClient, getGtmClient, _resetGtmClient } from './client';
export type { GtmApiClientOpts } from './client';

export {
  GtmApiError,
  GtmAuthError,
  GtmConflictError,
  GtmContainerLimitError,
  GtmNotFoundError,
  GtmQuotaExceededError,
  GtmRateLimitError,
  classifyGtmError,
} from './errors';

export type {
  CloneContainerInput,
  CloneResult,
  CloneStep,
  GtmClient,
  GtmContainer,
  GtmContainerVersion,
  GtmCustomTemplate,
  GtmParameter,
  GtmScope,
  GtmServiceAccountKey,
  GtmTag,
  GtmTrigger,
  GtmVariable,
  GtmWorkspace,
} from './types';

export { GTM_SCOPES } from './types';
