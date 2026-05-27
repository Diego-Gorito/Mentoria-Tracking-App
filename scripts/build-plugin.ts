/**
 * scripts/build-plugin.ts — pipeline de build per-install do plugin híbrido
 * GTM4WP Mentoria.
 *
 * Story:    F-S13 (AC-2, AC-7, AC-8)
 * ADR ref:  docs/adr-0008-auto-provisioner-gtm-architecture.md §3.2 Opção C
 *           (fork mínimo embarcado, GTM4WP upstream intocado).
 *
 * Semantics:
 *   1. Copia `plugins/gtm4wp-mentoria/` (root repo) → `/tmp/gtm4wp-mentoria-build-<uuid>/`
 *      - exceto `mentoria-config.json.template` (não vai pro deploy)
 *   2. Lê `mentoria-config.json.template`, substitui placeholders {{var}} via
 *      `applyTemplate` simples, escreve `mentoria-config.json` no temp dir.
 *   3. Retorna { pluginPath, cleanup }. Caller invoca cleanup() no `finally`
 *      pra `rm -rf` (AC-7).
 *
 * CLI mode (smoke local):
 *   npx tsx scripts/build-plugin.ts \
 *     --container_id=GTM-WVWQVMP --brand_slug=zerohum \
 *     --plugin_version=gtm4wp-1.18+bootstrap-v1
 *
 * Lib mode (consumed by workers/api/deployJob.ts):
 *   import { buildPlugin } from '../scripts/build-plugin';
 *   const { pluginPath, cleanup } = await buildPlugin({...});
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path absoluto pro diretório fonte do plugin (root repo `plugins/gtm4wp-mentoria/`). */
const PLUGIN_SRC_DIR = resolve(__dirname, '..', 'plugins', 'gtm4wp-mentoria');
const CONFIG_TEMPLATE_FILENAME = 'mentoria-config.json.template';
const CONFIG_OUTPUT_FILENAME = 'mentoria-config.json';

export interface BuildPluginInput {
  /** ex "GTM-WVWQVMP" — container ID do brand alvo. */
  container_id: string;
  /** ex "zerohum" — brand_slug per `BRAND_GTM_MAP` (workers/lib/constants.ts). */
  brand_slug: string;
  /** ex "gtm4wp-1.18+bootstrap-v1" — snapshot pro audit/drift detection. */
  plugin_version: string;
}

export interface BuildPluginResult {
  /** Absolute path do diretório montado em /tmp/. */
  pluginPath: string;
  /** `rm -rf` no temp dir. Idempotente — múltiplas calls OK. */
  cleanup: () => Promise<void>;
}

/**
 * Substituição simples de `{{var}}` por `vars[var]`. NÃO usa Handlebars
 * (overkill); manter ~5 LoC sem dep adicional. Vars ausentes viram string
 * vazia (consciente — força build a falhar visível no JSON.parse downstream).
 */
export function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Build do plugin per-install (F-S13 AC-2 + AC-7).
 *
 * Pipeline:
 *   1. mkdir /tmp/gtm4wp-mentoria-build-<uuid>/
 *   2. cp -r plugins/gtm4wp-mentoria/ → temp (excluindo .template)
 *   3. render config + write mentoria-config.json no temp
 *   4. return { pluginPath, cleanup }
 *
 * Cleanup é idempotente — chamar 2× não throw.
 */
export async function buildPlugin(input: BuildPluginInput): Promise<BuildPluginResult> {
  const { container_id, brand_slug, plugin_version } = input;

  const uuid = randomUUID();
  const pluginPath = join(tmpdir(), `gtm4wp-mentoria-build-${uuid}`);

  // 1. Cria dir vazio (filter no cp abaixo pula o template).
  await mkdir(pluginPath, { recursive: true });

  // 2. Copia dir source → temp, pulando o template (não vai pro deploy).
  // Node 20+ suporta `cp` com filter callback (path src, path dst) → boolean.
  await cp(PLUGIN_SRC_DIR, pluginPath, {
    recursive: true,
    filter: (src) => !src.endsWith(CONFIG_TEMPLATE_FILENAME),
  });

  // 3. Lê template do source (não do temp — porque filtro pulou copy).
  const templatePath = join(PLUGIN_SRC_DIR, CONFIG_TEMPLATE_FILENAME);
  const tpl = await readFile(templatePath, 'utf8');
  const rendered = applyTemplate(tpl, {
    container_id,
    brand_slug,
    plugin_version,
  });

  await writeFile(join(pluginPath, CONFIG_OUTPUT_FILENAME), rendered, 'utf8');

  // 4. Cleanup callback — idempotente (force: true não throw em ENOENT).
  const cleanup = async (): Promise<void> => {
    await rm(pluginPath, { recursive: true, force: true });
  };

  return { pluginPath, cleanup };
}

// ─── CLI mode ────────────────────────────────────────────────────────────────
// Roda apenas quando invocado direto via `tsx scripts/build-plugin.ts ...`,
// não quando importado (`import.meta.url === argv[1]` URL).

function parseCliArgs(argv: readonly string[]): Partial<BuildPluginInput> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out as Partial<BuildPluginInput>;
}

async function mainCli(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.container_id || !args.brand_slug || !args.plugin_version) {
    process.stderr.write(
      'Usage: tsx scripts/build-plugin.ts --container_id=GTM-XXX --brand_slug=zerohum --plugin_version=gtm4wp-1.18+bootstrap-v1\n',
    );
    process.exit(2);
  }
  const { pluginPath } = await buildPlugin(args as BuildPluginInput);
  // Smoke local: NÃO cleanup — Diego inspeciona manualmente, remove depois.
  process.stdout.write(`pluginPath=${pluginPath}\n`);
  process.stdout.write(`inspect:    ls -la ${pluginPath}\n`);
  process.stdout.write(`cleanup:    rm -rf ${pluginPath}\n`);
}

// Detecta entrypoint CLI vs lib import. argv[1] vem como path absoluto sem
// `file://`, então normaliza pra comparar URLs.
const isCliEntrypoint = (() => {
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isCliEntrypoint) {
  mainCli().catch((err) => {
    process.stderr.write(`[build-plugin] erro: ${String(err)}\n`);
    process.exit(1);
  });
}
