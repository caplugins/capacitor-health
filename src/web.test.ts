import { CapacitorException, ExceptionCode } from '@capacitor/core';
import { describe, expect, it } from 'vitest';

import type { CapacitorHealthPlugin } from './definitions';
import { CapacitorHealthWeb } from './web';

const range = { startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-02T00:00:00Z' };

describe('CapacitorHealthWeb', () => {
  it('reports health data as not supported', async () => {
    await expect(new CapacitorHealthWeb().isAvailable()).resolves.toEqual({
      available: false,
      status: 'notSupported',
    });
  });

  const calls: [string, (web: CapacitorHealthPlugin) => Promise<unknown>][] = [
    ['getSupportedTypes', (web) => web.getSupportedTypes()],
    ['requestAuthorization', (web) => web.requestAuthorization({ read: ['menstrualFlow'] })],
    ['checkAuthorization', (web) => web.checkAuthorization({ read: ['menstrualFlow'] })],
    ['openHealthSettings', (web) => web.openHealthSettings()],
    ['openHealthConnectInstall', (web) => web.openHealthConnectInstall()],
    ['readSamples', (web) => web.readSamples({ type: 'menstrualFlow', ...range })],
    ['aggregate', (web) => web.aggregate({ type: 'steps', metrics: ['sum'], ...range })],
    ['getChanges', (web) => web.getChanges({ types: ['menstrualFlow'] })],
    ['saveSamples', (web) => web.saveSamples({ samples: [{ type: 'menstrualFlow', value: 'light', ...range }] })],
    ['deleteSamples', (web) => web.deleteSamples({ type: 'menstrualFlow', ids: ['x'] })],
  ];

  it.each(calls)('%s rejects with UNAVAILABLE', async (_name, call) => {
    const error = await call(new CapacitorHealthWeb()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CapacitorException);
    expect((error as CapacitorException).code).toBe(ExceptionCode.Unavailable);
  });

  it('covers every plugin method', () => {
    const methods = Object.getOwnPropertyNames(CapacitorHealthWeb.prototype).filter(
      (name) => name !== 'constructor' && name !== 'notOnWeb',
    );
    expect(methods.sort()).toEqual(['isAvailable', ...calls.map(([name]) => name)].sort());
  });
});
