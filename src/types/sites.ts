// types/sites.ts — F-S09
// Source-of-truth backend: `workers/api/sites.ts` EnrichedSite + `workers/lib/storage/types.ts`
// InstallationAudit. Mantemos cópia narrow no frontend pra evitar import workers/ no client bundle.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 3 + §10.2.

/**
 * Brand slugs hardcoded MVP (UX-010 + CLAUDE.md tabela).
 * Cada brand = 1 container GTM-* fixo backend-side.
 */
export type BrandSlug = 'mentoria' | 'mentoria-app' | 'zerohum' | 'ifrn';

/**
 * Status visível ao usuário no card. Mapa per UX §4.2.
 * Backend `EnrichedSite.status` é mais granular (uploading/activating/validating/
 * uploaded_pending_activation) — colapsamos pros 6 buckets visíveis na lista.
 *
 * Codex adversarial #4 (2026-05-27): `uploaded_pending_activation` virou bucket
 * VISÍVEL próprio porque é o estado terminal do deploy MVP (plugin no servidor,
 * aguarda ativação manual no wp-admin). UI mostra CTA "Revalidar" que dispara
 * `POST /api/installations/:id/revalidate` (validator F-S06 roda → installed).
 */
export type SiteStatus =
  | 'installed'
  | 'draft'
  | 'failed'
  | 'drift_detected'
  | 'uploaded_pending_activation'
  | 'not_installed';

/**
 * Mirror frontend de `workers/api/sites.ts` EnrichedSite.
 * Backend pode retornar status mais granular — UI colapsa via helper opcional.
 */
export interface EnrichedSite {
  domain: string;
  wp_version?: string;
  php_version?: string;
  ttfb_ms?: number;
  is_wordpress: boolean;
  status?: SiteStatus;
  brand_slug?: BrandSlug;
  container_id?: string;
  last_install_at?: string;
  installation_id?: string;
  hosting_account_id?: string;
}

/**
 * Mirror frontend de `workers/lib/storage/types.ts` InstallationAudit.
 * `payload` é generic Record (LGPD-safe — sem PII).
 */
export type AuditAction =
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

export interface InstallationAudit {
  id: string;
  installation_id: string;
  tenant_id: string;
  action: AuditAction;
  payload: Record<string, unknown>;
  actor_user_id?: string;
  actor_source: 'tracking-api' | 'cron-validator' | 'manual-cli';
  created_at: string;
}

/**
 * Step do InstallProgressModal (4 fixos per UX §3 Tela 5).
 */
export interface InstallStep {
  label: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  durationMs?: number;
}
