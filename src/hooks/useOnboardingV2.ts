/**
 * useOnboardingV2 — state machine do wizard install-first (4 steps).
 *
 * Diferenças vs `useOnboarding`:
 *  - Sem chamadas /api/onboarding/* (não persiste no Supabase).
 *  - State machine local com persistência em localStorage scoped por
 *    `user_id` + `tenant_id` (pra suportar multi-tenant + multi-conta no
 *    mesmo browser).
 *  - Recovery on reload: se user tem hosting_account mas sem installation,
 *    resume em Step 4 com account selecionado. Se installation existe em
 *    estado intermediário (draft/uploading/uploaded_pending_activation),
 *    pula direto pro polling/activation.
 *
 * Steps:
 *  1. welcome  — confirmar tenant
 *  2. gtm      — provisionar container (~8min)
 *  3. hosting  — conectar conta Hostinger + selecionar site
 *  4. install  — criar installation + deploy + activate + revalidate
 *
 * @see docs/stories/F-S26 (TODO) / refactor 2026-05-29
 */

import { useCallback, useEffect, useState } from 'react';
import { getUser } from '@/lib/auth';
import type { PlatformKey } from './useGtmContainer';
import type { BrandSlug } from '@/types/sites';

// ─── State machine ───────────────────────────────────────────────────────────

export type OnboardingV2Step = 1 | 2 | 3 | 4;

/**
 * Estado partial persistido em localStorage. Inclui apenas o que precisa
 * sobreviver reload — credenciais e tokens NUNCA vão pra cá (ficam em
 * `mentoria-tracking.session` + backend criptografado).
 */
export interface OnboardingV2State {
  /** Step atual (1-4). */
  step: OnboardingV2Step;
  /** Pixel IDs digitados no Step 2 (mantém pra retry se provision falhar). */
  pixel_ids: Partial<Record<PlatformKey, string>>;
  /** Hosting account selecionado pro Step 4. */
  hosting_account_id?: string;
  /** Site domain escolhido no Step 3 pra installação no Step 4. */
  selected_site_domain?: string;
  /** Brand slug do site escolhido — default tenant slug, fallback BRAND_GTM_MAP. */
  brand_slug?: BrandSlug;
  /** Installation ID criada no Step 4 (pra retomar polling pós-reload). */
  installation_id?: string;
  /** Marca user pulou Hostinger no Step 3 ("vou conectar depois"). */
  skipped_hosting?: boolean;
  /** Marca onboarding finalizado — UI não mostra wizard mais. */
  completed_at?: string;
}

const DEFAULT_STATE: OnboardingV2State = {
  step: 1,
  pixel_ids: {},
};

// ─── localStorage helpers ────────────────────────────────────────────────────

/**
 * Chave per user+tenant. Multi-tenant no mesmo browser não colide.
 * Ex: `mentoria-tracking.onboarding-v2.user-abc.tenant-xyz`.
 */
function storageKey(userId: string, tenantId: string | undefined): string {
  return `mentoria-tracking.onboarding-v2.user-${userId}.tenant-${tenantId ?? 'pending'}`;
}

function loadState(userId: string, tenantId: string | undefined): OnboardingV2State {
  try {
    const raw = localStorage.getItem(storageKey(userId, tenantId));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingV2State>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      // Defensive: garante step válido
      step: ([1, 2, 3, 4].includes(parsed.step as number)
        ? (parsed.step as OnboardingV2Step)
        : 1) as OnboardingV2Step,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(userId: string, tenantId: string | undefined, state: OnboardingV2State): void {
  try {
    localStorage.setItem(storageKey(userId, tenantId), JSON.stringify(state));
  } catch {
    // localStorage quota / private mode — silent
  }
}

function clearState(userId: string, tenantId: string | undefined): void {
  try {
    localStorage.removeItem(storageKey(userId, tenantId));
  } catch {
    // silent
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseOnboardingV2Result {
  state: OnboardingV2State;
  /** Avança 1 step (se < 4) — auto-persist em localStorage. */
  goNext: () => void;
  /** Volta 1 step (se > 1). */
  goBack: () => void;
  /** Pula direto pra um step (validações cabem ao caller). */
  goToStep: (step: OnboardingV2Step) => void;
  /** Patch parcial no state — merge raso. */
  patch: (delta: Partial<OnboardingV2State>) => void;
  /** Marca completed_at + redireciona via parent (caller decide). */
  complete: () => void;
  /** Reseta state pro DEFAULT — útil em dev/debug. */
  reset: () => void;
  /** Indica se há um user logado pra persistir (false antes do auth resolver). */
  ready: boolean;
}

export function useOnboardingV2(): UseOnboardingV2Result {
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [state, setState] = useState<OnboardingV2State>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  // Resolve user + tenant do JWT no mount.
  useEffect(() => {
    const user = getUser();
    if (!user) {
      setReady(true);
      return;
    }
    setUserId(user.id);
    setTenantId(user.tenantId);
    const loaded = loadState(user.id, user.tenantId);
    setState(loaded);
    setReady(true);
  }, []);

  // Persiste qualquer mudança (depois do mount inicial).
  useEffect(() => {
    if (!ready || !userId) return;
    saveState(userId, tenantId, state);
  }, [state, ready, userId, tenantId]);

  const goNext = useCallback(() => {
    setState((s) => ({ ...s, step: (Math.min(4, s.step + 1) as OnboardingV2Step) }));
  }, []);

  const goBack = useCallback(() => {
    setState((s) => ({ ...s, step: (Math.max(1, s.step - 1) as OnboardingV2Step) }));
  }, []);

  const goToStep = useCallback((step: OnboardingV2Step) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const patch = useCallback((delta: Partial<OnboardingV2State>) => {
    setState((s) => ({ ...s, ...delta }));
  }, []);

  const complete = useCallback(() => {
    setState((s) => ({ ...s, completed_at: new Date().toISOString() }));
  }, []);

  const reset = useCallback(() => {
    if (userId) clearState(userId, tenantId);
    setState({ ...DEFAULT_STATE });
  }, [userId, tenantId]);

  return { state, goNext, goBack, goToStep, patch, complete, reset, ready };
}

/**
 * Helper standalone — checa se user atual já completou onboarding V2.
 * Usado pelo App.tsx pra gate /onboarding-v2 (redireciona pra dashboard
 * se completed).
 */
export function isOnboardingV2Complete(): boolean {
  const user = getUser();
  if (!user) return false;
  const state = loadState(user.id, user.tenantId);
  return !!state.completed_at;
}

/**
 * Helper standalone — limpa state do user atual.
 * Usado por logout flow + dev tools.
 */
export function clearOnboardingV2State(): void {
  const user = getUser();
  if (!user) return;
  clearState(user.id, user.tenantId);
}
