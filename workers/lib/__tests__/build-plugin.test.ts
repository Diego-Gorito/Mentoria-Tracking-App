/**
 * Tests pra `buildPlugin` (F-S13 AC-2 + AC-7 + AC-8).
 *
 * Cobertura mínima por escopo da story:
 *   1. Template substitution — placeholders {{container_id}} etc. são
 *      substituídos corretamente no mentoria-config.json gerado.
 *   2. pluginPath existe — diretório montado em /tmp/ e contém os arquivos
 *      esperados (PHP bootstrap + config JSON).
 *   3. Cleanup callback — `rm -rf /tmp/build-<uuid>/` remove o dir
 *      (idempotente; chamar 2× não throw).
 *
 * @see scripts/build-plugin.ts
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyTemplate, buildPlugin } from '../../../scripts/build-plugin';

describe('buildPlugin (F-S13)', () => {
  it('template substitution — mentoria-config.json contém valores corretos', async () => {
    const { pluginPath, cleanup } = await buildPlugin({
      container_id: 'GTM-WVWQVMP',
      brand_slug: 'zerohum',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
    });

    try {
      const configRaw = readFileSync(join(pluginPath, 'mentoria-config.json'), 'utf8');
      const config = JSON.parse(configRaw);

      expect(config.container_id).toBe('GTM-WVWQVMP');
      expect(config.brand_slug).toBe('zerohum');
      expect(config.plugin_version).toBe('gtm4wp-1.18+bootstrap-v1');

      // Sanity: applyTemplate puro (sem dep filesystem) também substitui.
      expect(
        applyTemplate('{{a}} + {{b}}', { a: 'x', b: 'y' }),
      ).toBe('x + y');
    } finally {
      await cleanup();
    }
  });

  it('pluginPath existe + contém mentoria-gtm-bootstrap.php + config JSON', async () => {
    const { pluginPath, cleanup } = await buildPlugin({
      container_id: 'GTM-5J587HS3',
      brand_slug: 'mentoria',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
    });

    try {
      // Path está debaixo de tmpdir (sandbox/security check).
      expect(pluginPath.startsWith(tmpdir())).toBe(true);
      expect(existsSync(pluginPath)).toBe(true);

      // Arquivos essenciais presentes (PHP bootstrap + config render).
      expect(existsSync(join(pluginPath, 'mentoria-gtm-bootstrap.php'))).toBe(true);
      expect(existsSync(join(pluginPath, 'mentoria-config.json'))).toBe(true);

      // Template NÃO copiado (filter no cp pula .template).
      expect(existsSync(join(pluginPath, 'mentoria-config.json.template'))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('cleanup remove o temp dir (idempotente — 2 calls não throw)', async () => {
    const { pluginPath, cleanup } = await buildPlugin({
      container_id: 'GTM-KMK749ZW',
      brand_slug: 'mentoria-app',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
    });

    expect(existsSync(pluginPath)).toBe(true);

    await cleanup();
    expect(existsSync(pluginPath)).toBe(false);

    // Idempotente — 2ª call não throw mesmo com dir já removido.
    await expect(cleanup()).resolves.toBeUndefined();
    expect(existsSync(pluginPath)).toBe(false);
  });
});
