/**
 * Smoke E2E — clone master V2 → container teste real.
 *
 * Valida fluxo GTM API:
 *   1. createContainer(test-clone-web)
 *   2. copyContainerContents(master web → test-clone-web)
 *   3. createContainer(test-clone-server)
 *   4. copyContainerContents(master server → test-clone-server)
 *   5. CLEANUP — deleta os 2 containers
 *
 * NÃO testa persistência DB nem auth (smoke isolado). Valida que o
 * orquestrador GtmApiClient.copyContainerContents funciona end-to-end
 * contra a GTM API real, com remap de IDs e throttle.
 *
 * Run:
 *   GTM_SA_KEY_PATH="/Volumes/SSD 2T/Dev/tracking-claude-sa.json" \
 *     npx tsx scripts/gtm/smoke-e2e-clone.ts
 *
 * Tempo esperado: 30-60s (depende de throttle + counts).
 */
import { GtmApiClient, loadServiceAccountKey, getServiceAccountEmail } from '../../workers/lib/gtm';
import type { CloneStep } from '../../workers/lib/gtm';

const ACCOUNT = '6059193756';
const MASTER_WEB = { internal: '253664662', workspace: '2', label: 'GTM-WLZ3H8VH master web V2' };
const MASTER_SERVER = { internal: '253664663', workspace: '2', label: 'GTM-KLDMV2VH master server V2' };
const TEST_PREFIX = `smoke-${Date.now()}`;

async function main() {
  const t0 = Date.now();
  console.log('=== GTM Clone Smoke E2E ===\n');
  console.log(`Test prefix: ${TEST_PREFIX}\n`);

  loadServiceAccountKey();
  console.log(`SA: ${getServiceAccountEmail()}\n`);

  const client = new GtmApiClient({ throttleMs: 100 });

  // ── 1. Clone web ────────────────────────────────────────────────────────
  console.log(`[1/4] Create container web "${TEST_PREFIX}-web"...`);
  const webContainer = await client.createContainer(ACCOUNT, `${TEST_PREFIX}-web`, ['web']);
  console.log(`     ✓ Created: ${webContainer.publicId} (${webContainer.containerId})`);

  const webWs = await client.getDefaultWorkspaceId(ACCOUNT, webContainer.containerId);
  console.log(`     ✓ Default workspace: ${webWs}`);

  console.log(`[2/4] Copy ${MASTER_WEB.label} → ${webContainer.publicId}...`);
  const t1 = Date.now();
  let lastStep: CloneStep = 'init';
  const webClone = await client.copyContainerContents({
    sourceAccountId: ACCOUNT,
    sourceContainerId: MASTER_WEB.internal,
    sourceWorkspaceId: MASTER_WEB.workspace,
    targetAccountId: ACCOUNT,
    targetContainerId: webContainer.containerId,
    targetWorkspaceId: webWs,
    onProgress: (step, detail) => {
      if (step !== lastStep) {
        console.log(`       → ${step}${detail ? ` (${detail})` : ''}`);
        lastStep = step;
      }
    },
  });
  console.log(`     ✓ Web clone OK em ${Date.now() - t1}ms`);
  console.log(`       Counts: templates=${webClone.copiedCounts.templates}, vars=${webClone.copiedCounts.variables}, triggers=${webClone.copiedCounts.triggers}, tags=${webClone.copiedCounts.tags}, clients=${webClone.copiedCounts.clients}`);

  // ── 2. Clone server ──────────────────────────────────────────────────────
  console.log(`\n[3/4] Create container server "${TEST_PREFIX}-server"...`);
  const serverContainer = await client.createContainer(ACCOUNT, `${TEST_PREFIX}-server`, ['server']);
  console.log(`     ✓ Created: ${serverContainer.publicId} (${serverContainer.containerId})`);

  const serverWs = await client.getDefaultWorkspaceId(ACCOUNT, serverContainer.containerId);

  console.log(`[4/4] Copy ${MASTER_SERVER.label} → ${serverContainer.publicId}...`);
  const t2 = Date.now();
  lastStep = 'init';
  const serverClone = await client.copyContainerContents({
    sourceAccountId: ACCOUNT,
    sourceContainerId: MASTER_SERVER.internal,
    sourceWorkspaceId: MASTER_SERVER.workspace,
    targetAccountId: ACCOUNT,
    targetContainerId: serverContainer.containerId,
    targetWorkspaceId: serverWs,
    onProgress: (step, detail) => {
      if (step !== lastStep) {
        console.log(`       → ${step}${detail ? ` (${detail})` : ''}`);
        lastStep = step;
      }
    },
  });
  console.log(`     ✓ Server clone OK em ${Date.now() - t2}ms`);
  console.log(`       Counts: templates=${serverClone.copiedCounts.templates}, vars=${serverClone.copiedCounts.variables}, triggers=${serverClone.copiedCounts.triggers}, tags=${serverClone.copiedCounts.tags}, clients=${serverClone.copiedCounts.clients}`);

  // ── 3. Cleanup ───────────────────────────────────────────────────────────
  console.log('\n[cleanup] Deletando 2 containers de teste...');
  try {
    await client.deleteContainer(ACCOUNT, webContainer.containerId);
    console.log(`     ✓ Deleted ${webContainer.publicId}`);
  } catch (err) {
    console.error(`     ✗ Failed delete ${webContainer.publicId}:`, err);
  }
  try {
    await client.deleteContainer(ACCOUNT, serverContainer.containerId);
    console.log(`     ✓ Deleted ${serverContainer.publicId}`);
  } catch (err) {
    console.error(`     ✗ Failed delete ${serverContainer.publicId}:`, err);
  }

  console.log(`\n=== ✅ Smoke E2E OK em ${Date.now() - t0}ms ===`);
  console.log(`Total: web (${webClone.copiedCounts.tags} tags) + server (${serverClone.copiedCounts.tags} tags) cloned + deleted`);
}

main().catch((err) => {
  console.error('\n❌ SMOKE FAILED:', err);
  process.exit(1);
});
