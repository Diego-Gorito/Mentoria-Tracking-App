/**
 * Storage types — branded IDs + entity interfaces.
 *
 * Source-of-truth: `docs/adr-0008a-mock-storage-mvp-addendum.md` §2.4
 * (linhas 86-150) — copiado LITERAL para prevenir drift entre código e ADR.
 *
 * Branded types previnem mistura acidental de IDs em compile-time
 * (AC-2 da story F-S01).
 */

// Branded types pra evitar mistura de IDs
export type AccountId = string & { readonly __brand: 'AccountId' };
export type InstallationId = string & { readonly __brand: 'InstallationId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type ISO8601 = string & { readonly __brand: 'ISO8601' };

export interface HostingAccount {
  id: AccountId; // uuid v4
  tenant_id: TenantId; // hardcoded "mentoria" UUID no MVP F
  provider: 'hostinger'; // só hostinger no MVP F
  account_label: string; // ex "Diego pessoal"
  token_encrypted: string; // libsodium sealed box base64
  wp_admin_creds_encrypted?: string; // opcional, sealed box base64
  account_email?: string; // metadata, não-PII
  status: 'active' | 'token_expired' | 'revoked';
  last_validated_at?: ISO8601;
  created_at: ISO8601;
  updated_at: ISO8601;
}

export interface GtmInstallation {
  id: InstallationId; // uuid v4
  tenant_id: TenantId;
  hosting_account_id: AccountId;
  site_domain: string; // ex "zerohum.com.br"
  brand_slug: 'mentoria' | 'mentoria-app' | 'zerohum' | 'ifrn';
  gtm_container_id: string; // snapshot ex "GTM-WVWQVMP"
  plugin_version: string; // ex "gtm4wp-1.18+bootstrap-v1"
  status:
    | 'draft'
    | 'uploading'
    | 'uploaded_pending_activation'
    | 'activating'
    | 'validating'
    | 'installed'
    | 'failed'
    | 'uninstalled';
  upload_dir_name?: string; // returned by MCP, ex "gtm4wp-mentoria-aB3kZ9pQ"
  attempt_count: number;
  last_attempted_at?: ISO8601;
  installed_at?: ISO8601;
  last_validation_at?: ISO8601;
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
  last_error?: string; // ≤500 chars
  created_by?: string; // user_id (Supabase auth.users.id)
  created_at: ISO8601;
  updated_at: ISO8601;
}

export interface InstallationAudit {
  id: string; // uuid v4
  installation_id: InstallationId;
  tenant_id: TenantId;
  action:
    | 'draft_created'
    | 'upload_started'
    | 'upload_complete'
    | 'upload_failed'
    | 'activation_started'
    | 'activation_complete'
    | 'activation_failed'
    | 'validation_passed'
    | 'validation_failed'
    | 'uninstalled'
    | 'token_refresh';
  payload: Record<string, unknown>; // LGPD-safe (ADR-0008 §3.7 mantido)
  actor_user_id?: string;
  actor_source: 'tracking-api' | 'cron-validator' | 'manual-cli';
  created_at: ISO8601;
}
