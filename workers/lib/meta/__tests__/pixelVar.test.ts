/**
 * Tests pro updateTenantMetaPixel — mecanismo targeted var update do conector
 * Meta (NÃO republish). GtmApiClient é mockado.
 */

import { describe, expect, it, vi } from 'vitest';
import { updateTenantMetaPixel, META_PIXEL_VAR_NAME } from '../pixelVar';
import type { GtmApiClient } from '../../gtm/client';

function makeGtm(opts: { varExists: boolean }): GtmApiClient {
  return {
    getDefaultWorkspaceId: vi.fn(async () => '4'),
    listVariables: vi.fn(async () =>
      opts.varExists
        ? [
            {
              variableId: '77',
              name: META_PIXEL_VAR_NAME,
              type: 'c',
              parameter: [{ type: 'template' as const, key: 'value', value: 'OLD' }],
            },
          ]
        : [{ variableId: '1', name: 'Outra Var', type: 'c', parameter: [] }],
    ),
    updateVariable: vi.fn(async () => ({}) as never),
    createVersion: vi.fn(async () => ({ containerVersionId: 'v9' })),
    publishVersion: vi.fn(async () => undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('updateTenantMetaPixel', () => {
  it('var existe → atualiza value + publica versão', async () => {
    const gtm = makeGtm({ varExists: true });
    const res = await updateTenantMetaPixel(gtm, {
      webContainerInternalId: '253000',
      pixelId: '999888',
      gtmAccountId: '6059193756',
    });

    expect(res.updated).toBe(true);
    expect(res.versionId).toBe('v9');
    // value gravado.
    const args = (gtm.updateVariable as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = args[4] as { parameter: Array<{ key: string; value: string }> };
    expect(body.parameter.find((p) => p.key === 'value')?.value).toBe('999888');
    expect(gtm.publishVersion).toHaveBeenCalledTimes(1);
  });

  it('autoPublish=false → atualiza var mas NÃO publica', async () => {
    const gtm = makeGtm({ varExists: true });
    const res = await updateTenantMetaPixel(gtm, {
      webContainerInternalId: '253000',
      pixelId: '111',
      autoPublish: false,
    });
    expect(res.updated).toBe(true);
    expect(res.versionId).toBeUndefined();
    expect(gtm.createVersion).not.toHaveBeenCalled();
    expect(gtm.publishVersion).not.toHaveBeenCalled();
  });

  it('var não existe no container → updated:false (sem throw, sem publish)', async () => {
    const gtm = makeGtm({ varExists: false });
    const res = await updateTenantMetaPixel(gtm, {
      webContainerInternalId: '253000',
      pixelId: '111',
    });
    expect(res.updated).toBe(false);
    expect(res.reason).toMatch(/não existe/i);
    expect(gtm.updateVariable).not.toHaveBeenCalled();
    expect(gtm.publishVersion).not.toHaveBeenCalled();
  });
});
