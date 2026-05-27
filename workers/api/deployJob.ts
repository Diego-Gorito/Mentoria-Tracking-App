/**
 * deployJob — worker assíncrono pra deploy de plugin GTM4WP.
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-6 (pipeline state machine).
 *
 * Pipeline ATUAL (Codex adversarial #4 fix, 2026-05-27):
 *   draft → uploading → uploaded_pending_activation [TERMINAL deploy]
 *
 * Depois da ativação manual no wp-admin pelo usuário, o frontend chama
 * `POST /api/installations/:id/revalidate` que roda o validator F-S06 e
 * transiciona pra `installed | failed` baseado no resultado.
 *
 * RATIONALE: o plugin gtm4wp-mentoria só configura GTM no
 * `register_activation_hook` (PHP). Validar HEAD/GET ANTES da ativação
 * marca install válido como `failed` (Codex review #4 finding [high]).
 * Fix: separar `deploy` (upload + idempotência) de `activate+validate`
 * (revalidate endpoint). Activation HTTP automática (fallback C ADR-0008
 * §3.4 — login wp-admin com app password) fica Sprint 4.
 *
 * Steps:
 *   1. mark uploading + attempt_count++
 *   2. buildPlugin(installation) (F-S13)
 *   3. provider.deployPlugin(...) (F-S04) com AbortSignal 50s/attempt
 *   4. mark uploaded_pending_activation + upload_dir_name + emit terminal
 *   5. releaseLock(id) no finally
 *
 * Erros capturados → updateInstallation status='failed' + appendAudit
 * 'upload_failed' + release lock. Worker NUNCA throw (executado via
 * setImmediate, sem caller pra capturar).
 *
 * Todos os audit appends usam `appendAuditWithSanitization` (F-S07) — payload
 * passa por whitelist/blacklist antes de gravar (LGPD-safe by default).
 */

import type { Redis as RedisClient } from 'ioredis';

import type { IGtmStorage } from '../lib/storage';
import type { GtmInstallation, ISO8601, InstallationId } from '../lib/storage/types';
import type { IHostingProvider } from '../lib/providers';
import { TokenInvalidError, RateLimitError, DomainNotOwnedError } from '../lib/providers/errors';
import { appendAuditWithSanitization } from '../lib/audit';
import { publishEvent, type SseEvent } from '../lib/sseBus';
import {
  buildPlugin as runBuildPlugin,
  type BuildPluginInput,
  type BuildPluginResult,
} from '../../scripts/build-plugin';

export interface DeployJobDeps {
  storage: IGtmStorage;
  /** Factory que retorna o provider apropriado pra installation alvo. */
  getProvider: (installation: GtmInstallation) => Promise<IHostingProvider>;
  /**
   * Build do plugin GTM4WP customizado pra instalação (F-S13 AC-2 + AC-7).
   *
   * Default: `runBuildPlugin` (scripts/build-plugin.ts) — copia
   * `plugins/gtm4wp-mentoria/` pra /tmp + renderiza mentoria-config.json.
   * Tests podem injetar versão mock pra evitar I/O em filesystem.
   * Sempre invocado com cleanup() no `finally` do pipeline (AC-7).
   */
  buildPlugin?: (input: BuildPluginInput) => Promise<BuildPluginResult>;
  /**
   * Client Redis usado pra publicar SSE events (F-S12 AC-2).
   *
   * Quando ausente, publish é no-op (não bloqueia o pipeline e mantém compat
   * com tests legacy de F-S05 que não setam Redis client). Em produção, é
   * injetado pelo `installations` router a partir do storage Redis singleton.
   */
  redisClient?: RedisClient;
}

function nowIso(): ISO8601 {
  return new Date().toISOString() as ISO8601;
}

/**
 * Executa pipeline completo do deploy. NUNCA throw — captura tudo e marca
 * `status='failed'` se algo deu errado. Sempre libera o lock no finally.
 */
export async function deployJob(
  installationId: InstallationId,
  deps: DeployJobDeps,
): Promise<void> {
  const { storage, getProvider, buildPlugin, redisClient } = deps;
  const buildFn = buildPlugin ?? runBuildPlugin;

  /**
   * Helper local — publica em Redis LIST `gtm:events:<id>` (F-S12 AC-2).
   * No-op se `redisClient` não setado (compat com tests legacy F-S05).
   * Captura erros internamente (`publishEvent` já é best-effort).
   *
   * Source UX: `docs/ux-auto-provisioner-gtm-flow.md` §3 Tela 5 (real-time).
   */
  const emit = async (event: SseEvent): Promise<void> => {
    if (!redisClient) return;
    await publishEvent(redisClient, installationId, event);
  };

  let installation: GtmInstallation | null = null;
  // F-S13 AC-7: cleanup do temp dir do plugin é guardado fora do try
  // pra rodar no finally — mesmo se deploy falha.
  let pluginCleanup: (() => Promise<void>) | null = null;
  // Timings pra incluir em `timing_ms` no evento (F-S12 AC-2 shape JSON).
  const tStart = Date.now();

  try {
    installation = await storage.getInstallation(installationId);
    if (!installation) {
      console.error(`[deployJob] installation_not_found id=${installationId}`);
      return; // lock será liberado no finally
    }

    // Step 1 — mark uploading
    await emit({ step: 'upload_started', status: 'in_progress' });

    installation = await storage.updateInstallation(installationId, {
      status: 'uploading',
      attempt_count: installation.attempt_count + 1,
      last_attempted_at: nowIso(),
    });

    await appendAuditWithSanitization(storage, {
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: 'upload_started',
      rawPayload: { retry_attempt: installation.attempt_count },
      actor_source: 'tracking-api',
    });

    // Step 2 — build plugin (F-S13 AC-2 + AC-6: copia plugins/gtm4wp-mentoria/
    // pra /tmp/, renderiza mentoria-config.json com container_id + brand_slug).
    const { pluginPath, cleanup } = await buildFn({
      container_id: installation.gtm_container_id,
      brand_slug: installation.brand_slug,
      plugin_version: installation.plugin_version,
    });
    pluginCleanup = cleanup;

    // Step 3 — provider.deployPlugin
    const provider = await getProvider(installation);
    const tUpload = Date.now();
    const deployResult = await provider.deployPlugin({
      domain: installation.site_domain,
      slug: `gtm4wp-${installation.brand_slug}`,
      pluginPath,
    });

    if (deployResult.status === 'failed') {
      throw new Error(
        `deployPlugin returned status=failed: ${deployResult.errorSummary ?? 'no detail'}`,
      );
    }

    // Step 4 — uploaded_pending_activation [TERMINAL pra deploy]
    //
    // Codex adversarial review #4 (2026-05-27): antes este job continuava
    // pra `activating` + `validate` + `installed|failed`, mas o plugin
    // gtm4wp-mentoria SÓ configura GTM no `register_activation_hook` (PHP),
    // o que exige ativação manual no wp-admin OU fallback C (HTTP login,
    // ADR-0008 §3.4 — Sprint 4). Validar HEAD/GET antes da ativação marcava
    // install válido como `failed`. Pipeline agora termina aqui; frontend
    // mostra CTA "Ative o plugin no wp-admin → Revalidar" que dispara
    // `POST /api/installations/:id/revalidate` (F-S06 validator).
    installation = await storage.updateInstallation(installationId, {
      status: 'uploaded_pending_activation',
      upload_dir_name: deployResult.uploadDirName,
    });

    await emit({
      step: 'upload_complete',
      status: 'done',
      timing_ms: Date.now() - tUpload,
    });

    await appendAuditWithSanitization(storage, {
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: 'upload_complete',
      rawPayload: {
        upload_dir_name: deployResult.uploadDirName,
        file_count: deployResult.summary?.successful,
      },
      actor_source: 'tracking-api',
    });

    // Step 5 — emit terminal `pending_activation` event (UX §3 Tela 5
    // encerra modal progress e mostra CTA "Ative no wp-admin → Revalidar").
    // Frontend (useInstallTracking) trata como step terminal pra fechar SSE.
    await emit({
      step: 'pending_activation',
      status: 'done',
      timing_ms: Date.now() - tStart,
    });

    console.log(
      `[deployJob] uploaded_pending_activation id=${installationId} ` +
        `dir=${deployResult.uploadDirName ?? 'unknown'}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const truncated = message.slice(0, 500);
    let code = 'UPLOAD_FAILED';

    if (err instanceof TokenInvalidError) code = 'INVALID_TOKEN';
    else if (err instanceof RateLimitError) code = 'RATE_LIMITED';
    else if (err instanceof DomainNotOwnedError) code = 'DOMAIN_NOT_OWNED';

    console.error(`[deployJob] failed id=${installationId} code=${code} msg=${truncated}`);

    // F-S12 AC-2: publica upload_failed + terminal `failed` pra SSE consumer
    // saber que o pipeline encerrou em erro. Best-effort (publishEvent swallows).
    await emit({
      step: 'upload_failed',
      status: 'failed',
      error: truncated,
    });
    await emit({
      step: 'failed',
      status: 'failed',
      timing_ms: Date.now() - tStart,
      error: truncated,
    });

    try {
      const current = installation ?? (await storage.getInstallation(installationId));
      if (current) {
        await storage.updateInstallation(installationId, {
          status: 'failed',
          last_error: truncated,
        });
        await appendAuditWithSanitization(storage, {
          installation_id: installationId,
          tenant_id: current.tenant_id,
          action: 'upload_failed',
          rawPayload: { error_summary: truncated },
          actor_source: 'tracking-api',
        });
      }
    } catch (auditErr) {
      console.error(
        `[deployJob] audit_failed id=${installationId} msg=${(auditErr as Error).message}`,
      );
    }
  } finally {
    // F-S13 AC-7: cleanup do temp dir do plugin sempre roda (mesmo se deploy
    // falha). Idempotente (rm -rf com force) — não throw se já foi limpo.
    if (pluginCleanup) {
      try {
        await pluginCleanup();
      } catch (cleanupErr) {
        console.error(
          `[deployJob] plugin_cleanup_failed id=${installationId} msg=${(cleanupErr as Error).message}`,
        );
      }
    }
    try {
      await storage.releaseLock(installationId);
    } catch (lockErr) {
      console.error(
        `[deployJob] release_lock_failed id=${installationId} msg=${(lockErr as Error).message}`,
      );
    }
  }
}
