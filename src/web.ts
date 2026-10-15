import { WebPlugin } from '@capacitor/core';

import type { CapacitorHealthPlugin } from './definitions';

export class CapacitorHealthWeb extends WebPlugin implements CapacitorHealthPlugin {
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }
}
