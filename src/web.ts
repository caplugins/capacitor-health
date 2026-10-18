import { WebPlugin } from '@capacitor/core';

import type {
  AggregateResult,
  AuthorizationResult,
  AvailabilityResult,
  CapacitorHealthPlugin,
  DeleteSamplesResult,
  GetChangesResult,
  ReadSamplesResult,
  ReadWorkoutRouteResult,
  SaveSamplesResult,
  SupportedTypesResult,
} from './definitions';

/** The web has no health store: `isAvailable()` says so and everything else rejects with `UNAVAILABLE`. */
export class CapacitorHealthWeb extends WebPlugin implements CapacitorHealthPlugin {
  async isAvailable(): Promise<AvailabilityResult> {
    return { available: false, status: 'notSupported' };
  }

  async getSupportedTypes(): Promise<SupportedTypesResult> {
    throw this.notOnWeb();
  }

  async requestAuthorization(): Promise<AuthorizationResult> {
    throw this.notOnWeb();
  }

  async checkAuthorization(): Promise<AuthorizationResult> {
    throw this.notOnWeb();
  }

  async openHealthSettings(): Promise<void> {
    throw this.notOnWeb();
  }

  async openHealthConnectInstall(): Promise<void> {
    throw this.notOnWeb();
  }

  async readSamples(): Promise<ReadSamplesResult> {
    throw this.notOnWeb();
  }

  async aggregate(): Promise<AggregateResult> {
    throw this.notOnWeb();
  }

  async getChanges(): Promise<GetChangesResult> {
    throw this.notOnWeb();
  }

  async saveSamples(): Promise<SaveSamplesResult> {
    throw this.notOnWeb();
  }

  async deleteSamples(): Promise<DeleteSamplesResult> {
    throw this.notOnWeb();
  }

  async readWorkoutRoute(): Promise<ReadWorkoutRouteResult> {
    throw this.notOnWeb();
  }

  private notOnWeb() {
    return this.unavailable('Health data is not available on the web.');
  }
}
