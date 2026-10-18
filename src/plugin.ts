import type { CapacitorHealthPlugin } from './definitions';
import {
  validateAggregate,
  validateCheckAuthorization,
  validateDeleteSamples,
  validateGetChanges,
  validateReadSamples,
  validateReadWorkoutRoute,
  validateRequestAuthorization,
  validateSaveSamples,
} from './validate';
import type { NativePlatform } from './validate';

/**
 * Wraps the native plugin so every call is validated (and normalized) in JS first (decision #23).
 * On the web there is nothing to validate for: the web stub rejects with `UNAVAILABLE`.
 */
export function withValidation(native: CapacitorHealthPlugin, getPlatform: () => string): CapacitorHealthPlugin {
  async function call<O, R>(
    options: O,
    validate: (options: O, platform: NativePlatform) => O,
    send: (options: O) => Promise<R>,
  ): Promise<R> {
    const platform = getPlatform();
    return send(platform === 'ios' || platform === 'android' ? validate(options, platform) : options);
  }

  return {
    isAvailable: () => native.isAvailable(),
    getSupportedTypes: () => native.getSupportedTypes(),
    requestAuthorization: (o) => call(o, validateRequestAuthorization, (v) => native.requestAuthorization(v)),
    checkAuthorization: (o) => call(o, validateCheckAuthorization, (v) => native.checkAuthorization(v)),
    openHealthSettings: () => native.openHealthSettings(),
    openHealthConnectInstall: () => native.openHealthConnectInstall(),
    readSamples: (o) => call(o, validateReadSamples, (v) => native.readSamples(v)),
    aggregate: (o) => call(o, validateAggregate, (v) => native.aggregate(v)),
    getChanges: (o) => call(o, validateGetChanges, (v) => native.getChanges(v)),
    saveSamples: (o) => call(o, validateSaveSamples, (v) => native.saveSamples(v)),
    deleteSamples: (o) => call(o, validateDeleteSamples, (v) => native.deleteSamples(v)),
    readWorkoutRoute: (o) => call(o, validateReadWorkoutRoute, (v) => native.readWorkoutRoute(v)),
  };
}
