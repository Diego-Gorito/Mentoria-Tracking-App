// types/hosting.ts — F-S11
// Mirror narrower de tipos backend (`workers/lib/storage/types.ts` + `workers/lib/validator.ts`)
// usado pelos hooks F-S11. Frontend NUNCA recebe token_encrypted/wp_admin_creds_encrypted —
// o handler `publicAccountView` em `workers/api/hosting-accounts.ts` strippa antes do JSON.
//
// Mantemos cópia narrow no client pra evitar import workers/ no bundle frontend
// (mesma estratégia de `src/types/sites.ts`).

import type { BrandSlug } from './sites';

/**
 * HostingAccount visível ao client (sem campos criptografados).
 * Mirror de `workers/lib/storage/types.ts` HostingAccount minus token_encrypted/wp_admin_creds_encrypted.
 */
export interface HostingAccount {
  id: string;
  provider: 'hostinger';
  account_label: string;
  account_email?: string;
  status: 'active' | 'token_expired' | 'revoked';
  last_validated_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mirror de `workers/lib/storage/types.ts` GtmInstallation.
 * Frontend usa status granular do backend; o helper de bucket pros 5 buckets
 * visíveis (SiteStatus) vive separadamente em F-S10 mapping (se necessário).
 */
export type GtmInstallationStatus =
  | 'draft'
  | 'uploading'
  | 'uploaded_pending_activation'
  | 'activating'
  | 'validating'
  | 'installed'
  | 'failed'
  | 'uninstalled';

export interface GtmInstallation {
  id: string;
  tenant_id: string;
  hosting_account_id: string;
  site_domain: string;
  brand_slug: BrandSlug;
  gtm_container_id: string;
  plugin_version: string;
  status: GtmInstallationStatus;
  upload_dir_name?: string;
  attempt_count: number;
  last_attempted_at?: string;
  installed_at?: string;
  last_validation_at?: string;
  last_validation_result?: {
    passed: boolean;
    stage: 'head' | 'full';
    details?: {
      containerMatch: boolean;
      expectedMatch: boolean;
      datalayerMatch: boolean;
      expectedContainerId: string;
    };
    reason?: string;
  };
  last_error?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mirror de `workers/lib/validator.ts` ValidationResult.
 * useInstallTracking usa em `result` final.
 */
export interface ValidationResult {
  passed: boolean;
  stage: 'head' | 'full';
  details?: {
    containerMatch: boolean;
    expectedMatch: boolean;
    datalayerMatch: boolean;
    expectedContainerId: string;
  };
  reason?: string;
}
