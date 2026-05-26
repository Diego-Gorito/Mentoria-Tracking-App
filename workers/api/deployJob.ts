/**
 * deployJob — worker assíncrono pra deploy de plugin GTM4WP.
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-6 (pipeline state machine).
 *
 * Pipeline (per AC-6 step 3):
 *   draft → uploading → uploaded_pending_activation → activating → installed
 *                                                                ↘ failed
 *
 * Steps:
 *   1. mark uploading + attempt_count++
 *   2. buildPlugin(installation) (F-S13 stub — TODO)
 *   3. provider.deployPlugin(...) (F-S04)
 *   4. mark uploaded_pending_activation + upload_dir_name
 *   5. activation fallback D — TODO (ADR-0008 §3.4) — apenas marca explicitamente
 *   6. validate(domain, expectedContainerId) (F-S06 stub — TODO)
 *   7. mark installed | failed + last_validation_result
 *   8. releaseLock(id)
 *
 * Erros capturados → updateInstallation status='failed' + appendAudit
 * 'upload_failed' + release lock. Worker NUNCA throw (executado via
 * setImmediate, sem caller pra capturar).
 */

import type { IGtmStorage } from '../lib/storage';
import type { GtmInstallation, ISO8601, InstallationId } from '../lib/storage/types';
import type { IHostingProvider } from '../lib/providers';
import { TokenInvalidError, RateLimitError, DomainNotOwnedError } from '../lib/providers/errors';
import { validate as runValidator, type ValidationResult } from '../lib/validator';

export interface DeployJobDeps {
  storage: IGtmStorage;
  /** Factory que retorna o provider apropriado pra installation alvo. */
  getProvider: (installation: GtmInstallation) => Promise<IHostingProvider>;
  /**
   * Build do plugin GTM4WP customizado pra instalação.
   * @todo F-S13 — implementar build real. Stub atual retorna path fake.
   */
  buildPlugin?: (installation: GtmInstallation) => Promise<string> | string;
  /**
   * Validador pós-deploy 2-stage (HEAD+GET). Default usa `validate` de
   * `workers/lib/validator.ts` (F-S06). Tests podem injetar mock.
   */
  validate?: (
    domain: string,
    expectedContainerId: string,
  ) => Promise<ValidationResult>;
}

function nowIso(): ISO8601 {
  return new Date().toISOString() as ISO8601;
}

/**
 * @todo F-S13 — substituir por build real (zip + extract assets per brand).
 */
function defaultBuildPluginStub(_installation: GtmInstallation): string {
  return '/tmp/plugin-stub';
}

/**
 * Executa pipeline completo do deploy. NUNCA throw — captura tudo e marca
 * `status='failed'` se algo deu errado. Sempre libera o lock no finally.
 */
export async function deployJob(
  installationId: InstallationId,
  deps: DeployJobDeps,
): Promise<void> {
  const { storage, getProvider, buildPlugin, validate } = deps;
  const buildFn = buildPlugin ?? defaultBuildPluginStub;
  const validateFn = validate ?? runValidator;

  let installation: GtmInstallation | null = null;

  try {
    installation = await storage.getInstallation(installationId);
    if (!installation) {
      console.error(`[deployJob] installation_not_found id=${installationId}`);
      return; // lock será liberado no finally
    }

    // Step 1 — mark uploading
    installation = await storage.updateInstallation(installationId, {
      status: 'uploading',
      attempt_count: installation.attempt_count + 1,
      last_attempted_at: nowIso(),
    });

    await storage.appendAudit({
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: 'upload_started',
      payload: { attempt: installation.attempt_count },
      actor_source: 'tracking-api',
    });

    // Step 2 — build plugin (TODO F-S13 stub)
    const pluginPath = await buildFn(installation);

    // Step 3 — provider.deployPlugin
    const provider = await getProvider(installation);
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

    // Step 4 — uploaded_pending_activation
    installation = await storage.updateInstallation(installationId, {
      status: 'uploaded_pending_activation',
      upload_dir_name: deployResult.uploadDirName,
    });

    await storage.appendAudit({
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: 'upload_complete',
      payload: {
        upload_dir_name: deployResult.uploadDirName,
        files_ok: deployResult.summary?.successful,
      },
      actor_source: 'tracking-api',
    });

    // Step 5 — activation fallback D (TODO ADR-0008 §3.4)
    // MVP: marca activating mas não tenta ativação automática — UI mostra fallback D.
    // @todo F-S05+ — implementar fallback C (HTTP wp-admin com WP app password) quando creds presentes.
    installation = await storage.updateInstallation(installationId, {
      status: 'activating',
    });

    // Step 6 — validate (TODO F-S06 stub)
    const validation = await validateFn(
      installation.site_domain,
      installation.gtm_container_id,
    );

    // Step 7 — installed | failed
    const finalStatus: GtmInstallation['status'] = validation.passed ? 'installed' : 'failed';
    const installedAt: ISO8601 | undefined = validation.passed ? nowIso() : undefined;

    const detailsNormalized = validation.details as
      | NonNullable<GtmInstallation['last_validation_result']>['details']
      | undefined;

    await storage.updateInstallation(installationId, {
      status: finalStatus,
      last_validation_at: nowIso(),
      last_validation_result: {
        passed: validation.passed,
        stage: validation.stage,
        details: detailsNormalized,
      },
      ...(installedAt ? { installed_at: installedAt } : {}),
    });

    await storage.appendAudit({
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: validation.passed ? 'validation_passed' : 'validation_failed',
      payload: {
        stage: validation.stage,
        passed: validation.passed,
      },
      actor_source: 'tracking-api',
    });

    console.log(`[deployJob] complete id=${installationId} status=${finalStatus}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const truncated = message.slice(0, 500);
    let code = 'UPLOAD_FAILED';

    if (err instanceof TokenInvalidError) code = 'INVALID_TOKEN';
    else if (err instanceof RateLimitError) code = 'RATE_LIMITED';
    else if (err instanceof DomainNotOwnedError) code = 'DOMAIN_NOT_OWNED';

    console.error(`[deployJob] failed id=${installationId} code=${code} msg=${truncated}`);

    try {
      const current = installation ?? (await storage.getInstallation(installationId));
      if (current) {
        await storage.updateInstallation(installationId, {
          status: 'failed',
          last_error: truncated,
        });
        await storage.appendAudit({
          installation_id: installationId,
          tenant_id: current.tenant_id,
          action: 'upload_failed',
          payload: { code, error: truncated },
          actor_source: 'tracking-api',
        });
      }
    } catch (auditErr) {
      console.error(
        `[deployJob] audit_failed id=${installationId} msg=${(auditErr as Error).message}`,
      );
    }
  } finally {
    try {
      await storage.releaseLock(installationId);
    } catch (lockErr) {
      console.error(
        `[deployJob] release_lock_failed id=${installationId} msg=${(lockErr as Error).message}`,
      );
    }
  }
}
