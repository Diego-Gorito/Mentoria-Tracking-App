/**
 * Smoke test READ-ONLY do GtmApiClient.
 * Run: GTM_SA_KEY_PATH="/Volumes/SSD 2T/Dev/tracking-claude-sa.json" \
 *        npx tsx scripts/gtm/smoke-client.ts
 */
import { GtmApiClient, loadServiceAccountKey, getServiceAccountEmail } from '../../workers/lib/gtm';

async function main() {
  const start = Date.now();
  console.log('=== GtmApiClient Smoke Test (READ-ONLY) ===\n');

  console.log('[1/5] Load SA key...');
  loadServiceAccountKey();
  console.log(`  ✓ ${getServiceAccountEmail()}`);

  console.log('[2/5] Instantiate client (throttle 100ms)...');
  const client = new GtmApiClient({ throttleMs: 100 });
  console.log('  ✓ ready');

  console.log('[3/5] List containers in account 6059193756...');
  const containers = await client.listContainers('6059193756');
  console.log(`  ✓ ${containers.length} containers:`);
  for (const c of containers) {
    console.log(`     - ${c.publicId} (${c.containerId}) "${c.name}" usage=${c.usageContext.join(',')}`);
  }

  console.log('[4/5] List templates of GTM-WLZ3H8VH (workspace 2)...');
  const templates = await client.listTemplates('6059193756', '253664662', '2');
  console.log(`  ✓ ${templates.length} templates`);

  console.log('[5/5] List tags of GTM-WLZ3H8VH (workspace 2)...');
  const tags = await client.listTags('6059193756', '253664662', '2');
  console.log(`  ✓ ${tags.length} tags`);
  const paused = tags.filter((t) => t.paused === true);
  console.log(`     ${paused.length} paused (esperado: 22 — X/Reddit/Pinterest/Snap/Bing/Quora)`);

  console.log(`\n=== ✅ Smoke OK em ${Date.now() - start}ms ===`);
}

main().catch((err) => {
  console.error('\n❌ SMOKE FAILED:', err);
  process.exit(1);
});
