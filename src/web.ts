import { WebPlugin } from '@capacitor/core';

import type { AvailabilityResult, CapacitorHealthPlugin } from './definitions';

export class CapacitorHealthWeb extends WebPlugin implements CapacitorHealthPlugin {
  async isAvailable(): Promise<AvailabilityResult> {
    return { available: false, status: 'notSupported' };
  }
}
