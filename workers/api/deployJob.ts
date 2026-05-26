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
 *   6. validate(domain, expectedContainerId) (F-S06 real)
 *   7. mark installed | failed + last_validation_result
 *   8. releaseLock(id)
 *
 * Erros capturados → updateInstallation status='failed' + appendAudit
 * 'upload_failed' + release lock. Worker NUNCA throw (executado via
 * setImmediate, sem caller pra capturar).
 *
 * Todos os audit appends usam `appendAuditWithSanitization` (F-S07) — payload
 * passa por whitelist/blacklist antes de gravar (LGPD-safe by default).
 */

import type { IGtmStorage } from '../lib/storage';
import type { GtmInstallation, ISO8601, InstallationId } from '../lib/storage/types';
import type { IHostingProvider } from '../lib/providers';
import { TokenInvalidError, RateLimitError, DomainNotOwnedError } from '../lib/providers/errors';
import { validate as runValidator, type ValidationResult } from '../lib/validator';
import { appendAuditWithSanitization } from '../lib/audit';

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

    await appendAuditWithSanitization(storage, {
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: 'upload_started',
      rawPayload: { retry_attempt: installation.attempt_count },
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

    // Step 5 — activation fallback D (TODO ADR-0008 §3.4)
    // MVP: marca activating mas não tenta ativação automática — UI mostra fallback D.
    // @todo F-S05+ — implementar fallback C (HTTP wp-admin com WP app password) quando creds presentes.
    installation = await storage.updateInstallation(installationId, {
      status: 'activating',
    });

    // Step 6 — validate (F-S06 real, 2-stage HEAD+GET)
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

    await appendAuditWithSanitization(storage, {
      installation_id: installationId,
      tenant_id: installation.tenant_id,
      action: validation.passed ? 'validation_passed' : 'validation_failed',
      // Nota: `stage`/`passed` não estão na whitelist (ADR-0008 §3.7 lista
      // apenas 7 keys safe). Wrapper filtra. Detalhes ricos vivem em
      // installation.last_validation_result (typed). Audit apenas marca o
      // evento ocorreu (action é suficiente pra forensic).
      rawPayload: {},
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
    try {
      await storage.releaseLock(installationId);
    } catch (lockErr) {
      console.error(
        `[deployJob] release_lock_failed id=${installationId} msg=${(lockErr as Error).message}`,
      );
    }
  }
}
