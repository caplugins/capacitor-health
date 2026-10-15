import { describe, expect, it } from 'vitest';

import { CapacitorHealthWeb } from './web';

describe('CapacitorHealthWeb', () => {
  it('reports health data as not supported', async () => {
    await expect(new CapacitorHealthWeb().isAvailable()).resolves.toEqual({
      available: false,
      status: 'notSupported',
    });
  });
});
