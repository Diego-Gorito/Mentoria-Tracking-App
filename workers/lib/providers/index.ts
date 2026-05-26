/**
 * Public API do módulo `providers/`. Re-exporta interface, types, errors,
 * adapter real (Hostinger) e factory `getProvider()`.
 *
 * NOTA: `MockProvider` deliberadamente NÃO é re-exportado — é interno e só
 * consumido por `__tests__/` via import direto (`./MockProvider`).
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §4.3
 */

import { HostingerAdapter } from './HostingerAdapter';
import type { IHostingProvider, ProviderType } from './IHostingProvider';

export type {
  DeployPluginOpts,
  DeployResult,
  IHostingProvider,
  ProviderType,
  Site,
} from './IHostingProvider';

export {
  DomainNotOwnedError,
  ProviderError,
  RateLimitError,
  TokenInvalidError,
} from './errors';

export { HostingerAdapter } from './HostingerAdapter';

export function getProvider(
  type: ProviderType,
  credentials: { token: string; wpAdminPassword?: string },
): IHostingProvider {
  if (type === 'hostinger') return new HostingerAdapter(credentials);
  if (type === 'wp_rest') {
    throw new Error("Provider 'wp_rest' is Onda 2 — not implemented in MVP F");
  }
  throw new Error(`Unknown provider type: ${String(type)}`);
}
