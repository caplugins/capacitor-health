import { registerPlugin } from '@capacitor/core';

import type { CapacitorHealthPlugin } from './definitions';

const CapacitorHealth = registerPlugin<CapacitorHealthPlugin>('CapacitorHealth', {
  web: () => import('./web').then((m) => new m.CapacitorHealthWeb()),
});

export * from './definitions';
export { CapacitorHealth };
