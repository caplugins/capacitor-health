import { Capacitor, registerPlugin } from '@capacitor/core';

import type { CapacitorHealthPlugin } from './definitions';
import { withValidation } from './plugin';

const NativeCapacitorHealth = registerPlugin<CapacitorHealthPlugin>('CapacitorHealth', {
  web: () => import('./web').then((m) => new m.CapacitorHealthWeb()),
});

const CapacitorHealth: CapacitorHealthPlugin = withValidation(NativeCapacitorHealth, () => Capacitor.getPlatform());

export * from './definitions';
export { HEALTH_TYPES, REGISTRY, VALUE_SETS } from './generated/registry';
export type { RegistryEntry, RegistryField, RegistryGroup, RegistryKind, RegistryValueSet } from './generated/registry';
export { CapacitorHealth };
