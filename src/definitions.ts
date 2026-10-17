export type { HealthType } from './generated/registry';

/**
 * Whether health data can be used on this device.
 *
 * - `available`: HealthKit / Health Connect is ready to use.
 * - `notSupported`: the device can't use health data (web, iPads before iPadOS 17, Android below 9 /
 *   API 28, or Health Connect unavailable for this user, e.g. in a work profile).
 * - `notInstalled`: Android 9–13 only. The Health Connect app isn't installed.
 * - `updateRequired`: Android only. Health Connect is installed but too old for this plugin.
 *
 * @since 0.1.0
 */
export type AvailabilityStatus = 'available' | 'notSupported' | 'notInstalled' | 'updateRequired';

/**
 * @since 0.1.0
 */
export interface AvailabilityResult {
  /**
   * `true` only when `status` is `available`.
   *
   * @since 0.1.0
   */
  available: boolean;
  /**
   * Why health data is or isn't available.
   *
   * @since 0.1.0
   */
  status: AvailabilityStatus;
}

export interface CapacitorHealthPlugin {
  /**
   * Checks whether HealthKit (iOS) or Health Connect (Android) can be used on this device.
   *
   * Call it before anything else. On the web it always resolves `{ available: false, status: 'notSupported' }`.
   *
   * @since 0.1.0
   */
  isAvailable(): Promise<AvailabilityResult>;
}
