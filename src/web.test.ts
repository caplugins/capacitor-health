import { describe, expect, it } from 'vitest';

import { CapacitorHealthWeb } from './web';

// Placeholder until T11 replaces echo with the real web stub.
describe('CapacitorHealthWeb', () => {
  it('echoes its input', async () => {
    const web = new CapacitorHealthWeb();
    await expect(web.echo({ value: 'hi' })).resolves.toEqual({ value: 'hi' });
  });
});
