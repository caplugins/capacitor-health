/// <reference types="@capacitor/cli" />

import type {
  AggregateMetric,
  CategoryHealthType,
  EventHealthType,
  HealthType,
  QuantityHealthType,
} from './generated/registry';

export type {
  AggregateMetric,
  CategoryHealthType,
  EventHealthType,
  HealthType,
  QuantityHealthType,
} from './generated/registry';

/**
 * A native type the registry doesn't cover yet: `hk:` plus a HealthKit quantity or category
 * identifier (`hk:HKCategoryTypeIdentifierHandwashingEvent`), on iOS. Values stay native: quantities in
 * a unit you name, categories as HealthKit's raw integers. `hc:` plus a Health Connect record class
 * is reserved: every record of the Health Connect library the plugin uses is registered, so `hc:`
 * ids reject with `UNSUPPORTED_TYPE` for now.
 *
 * @since 0.2.0
 */
export type PassthroughType = `hk:${string}` | `hc:${string}`;

declare module '@capacitor/cli' {
  export interface PluginsConfig {
    /**
     * Configuration for `@caplugins/capacitor-health`, under `plugins.CapacitorHealth`.
     */
    CapacitorHealth?: {
      /**
       * Android only. The page the plugin's default permissions-rationale screen opens.
       *
       * Health Connect links to that screen from its permission dialog ("privacy policy") and won't
       * show the dialog at all when an app has no such screen. Without this setting the screen
       * closes straight away. Apps can replace the screen with their own (see the README).
       *
       * @since 0.1.0
       * @example "https://example.com/privacy"
       */
      privacyPolicyUrl?: string;

      /**
       * Logs what the plugin does natively, **health values included**, to the Xcode console and
       * logcat. For debugging only: keep it off in builds that reach users.
       *
       * @since 0.1.0
       * @default false
       * @example false
       */
      debugLogging?: boolean;
    };
  }
}

// ------------------------------------------------------------------ errors

/**
 * The `code` of every rejection from this plugin.
 *
 * - `UNAVAILABLE`: health data can't be used here (web, unsupported device). See `isAvailable()`.
 * - `NOT_INSTALLED`: Android 9–13, the Health Connect app isn't installed. See `openHealthConnectInstall()`.
 * - `UPDATE_REQUIRED`: Android, Health Connect needs an update.
 * - `MISSING_DECLARATION`: the app doesn't declare what the call needs (Android manifest permission,
 *   iOS `Info.plist` usage string). `data.missing` lists what to add.
 * - `PERMISSION_DENIED`: the user hasn't granted the access this call needs. iOS reports this for
 *   writes only: a denied read returns no data instead.
 * - `UNSUPPORTED_TYPE`: the type doesn't exist on this platform, OS version or Health Connect version.
 * - `READ_ONLY_TYPE`: the platform doesn't let apps write this type.
 * - `INVALID_ARGUMENT`: an argument is malformed or out of range. `data.field` names it; `data.reason`
 *   is `valueUnsupportedOnPlatform` for a valid value this platform can't store.
 * - `CURSOR_EXPIRED`: the `getChanges()` cursor is too old (Health Connect expires them after about
 *   30 days). Read everything again with `readSamples()` and start over without a cursor.
 * - `RATE_LIMITED`: Android, Health Connect's rate limit was hit. Try again later.
 * - `DEVICE_LOCKED`: iOS, the health store is encrypted while the device is locked. Try again after unlock.
 * - `NATIVE_ERROR`: anything else; `message` carries the platform's message.
 *
 * @since 0.1.0
 */
export type HealthErrorCode =
  | 'UNAVAILABLE'
  | 'NOT_INSTALLED'
  | 'UPDATE_REQUIRED'
  | 'MISSING_DECLARATION'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_TYPE'
  | 'READ_ONLY_TYPE'
  | 'INVALID_ARGUMENT'
  | 'CURSOR_EXPIRED'
  | 'RATE_LIMITED'
  | 'DEVICE_LOCKED'
  | 'NATIVE_ERROR';

/**
 * The shape of a rejection. Messages never contain health values.
 *
 * @since 0.1.0
 */
export interface HealthError {
  /** @since 0.1.0 */
  code: HealthErrorCode;
  /** @since 0.1.0 */
  message: string;
  /** @since 0.1.0 */
  data?: HealthErrorData;
}

/**
 * @since 0.1.0
 */
export interface HealthErrorData {
  /**
   * The type the error is about.
   *
   * @since 0.1.0
   */
  type?: string;
  /**
   * The argument at fault, as a path (`samples[2].value`).
   *
   * @since 0.1.0
   */
  field?: string;
  /**
   * A machine-readable detail, e.g. `valueUnsupportedOnPlatform`.
   *
   * @since 0.1.0
   */
  reason?: string;
  /**
   * `MISSING_DECLARATION`: the Android permissions or iOS `Info.plist` keys to add.
   *
   * @since 0.1.0
   */
  missing?: string[];
  /**
   * The platform's own error code, when there is one.
   *
   * @since 0.1.0
   */
  nativeCode?: number | string;
}

// ------------------------------------------------------------------ availability

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

/**
 * Why a type can't be read or written here.
 *
 * - `notOnPlatform`: this platform has no such type.
 * - `osVersion`: iOS, the type needs a newer iOS (see `minOS`).
 * - `featureUnavailable`: Android, this device's Health Connect doesn't have the feature the type needs.
 * - `readOnly`: the type can be read but the platform doesn't let apps write it.
 * - `aggregateOnly`: the platform has no samples of the type, only aggregates (`totalEnergy` on iOS,
 *   `basalEnergy` on Android). Since 0.2.0.
 *
 * @since 0.1.0
 */
export type UnsupportedReason = 'notOnPlatform' | 'osVersion' | 'featureUnavailable' | 'readOnly' | 'aggregateOnly';

/**
 * @since 0.1.0
 */
export interface TypeSupport {
  /** @since 0.1.0 */
  type: HealthType;
  /**
   * The type exists on this device. When `false`, every call with it rejects with `UNSUPPORTED_TYPE`.
   *
   * @since 0.1.0
   */
  supported: boolean;
  /** @since 0.1.0 */
  readable: boolean;
  /** @since 0.1.0 */
  writable: boolean;
  /**
   * Whether `aggregate()` works for the type on this device (always `false` in 0.1.0, which had no
   * `aggregate()`).
   *
   * @since 0.1.0
   */
  aggregatable: boolean;
  /**
   * The metrics `aggregate()` computes for the type here. Set when `aggregatable` is `true`.
   *
   * @since 0.2.0
   */
  metrics?: AggregateMetric[];
  /**
   * Set when `supported`, `readable` or `writable` is `false`.
   *
   * @since 0.1.0
   */
  reason?: UnsupportedReason;
  /**
   * iOS: the first iOS version with the type.
   *
   * @since 0.1.0
   */
  minOS?: string;
  /**
   * Values this platform can store, for types with a value set (category types).
   *
   * @since 0.1.0
   */
  values?: string[];
  /**
   * Units `readSamples()` and `saveSamples()` accept, canonical unit first (quantity types).
   *
   * @since 0.1.0
   */
  units?: string[];
}

/**
 * @since 0.1.0
 */
export interface SupportedTypesResult {
  /**
   * Every type the plugin knows, in registry order, with its support on this device.
   *
   * @since 0.1.0
   */
  types: TypeSupport[];
  /**
   * Android only: whether this device's Health Connect supports the optional `history` and
   * `background` permissions of `requestAuthorization()`.
   *
   * @since 0.1.0
   */
  android?: { history: boolean; background: boolean };
}

// ------------------------------------------------------------------ authorization

/**
 * Access to one type.
 *
 * - `granted`: the platform confirms access.
 * - `notGranted`: the platform confirms there's no access. On Android this covers "never asked" and
 *   "refused" alike: Health Connect doesn't say which.
 * - `notDetermined`: iOS only. The app hasn't asked yet, so `requestAuthorization()` will show the sheet.
 * - `unknown`: iOS read access after the app has asked. **iOS never tells apps whether read access
 *   was granted**; a denied read simply returns no data.
 * - `unsupported`: the type doesn't exist on this device (see `getSupportedTypes()`); nothing was requested.
 *
 * @since 0.1.0
 */
export type AuthorizationStatus = 'granted' | 'notGranted' | 'notDetermined' | 'unknown' | 'unsupported';

/**
 * Status per type, for the types passed in.
 *
 * @since 0.1.0
 */
export type AuthorizationStatusMap = Partial<Record<HealthType | PassthroughType, AuthorizationStatus>>;

/**
 * @since 0.1.0
 */
export interface AuthorizationOptions {
  /**
   * Types to read.
   *
   * @since 0.1.0
   */
  read?: (HealthType | PassthroughType)[];
  /**
   * Types to write. Read-only types reject with `READ_ONLY_TYPE`.
   *
   * @since 0.1.0
   */
  write?: (HealthType | PassthroughType)[];
  /**
   * Android only. Extra Health Connect permissions, requested only when set and supported by the
   * device (see `getSupportedTypes().android`). The app's manifest must declare them too.
   *
   * @since 0.1.0
   */
  android?: AndroidAuthorizationOptions;
}

/**
 * @since 0.1.0
 */
export interface AndroidAuthorizationOptions {
  /**
   * Also request `READ_HEALTH_DATA_HISTORY`: without it, apps can only read data from the 30 days
   * before they were first granted access.
   *
   * @since 0.1.0
   */
  history?: boolean;
  /**
   * Also request `READ_HEALTH_DATA_IN_BACKGROUND`. The plugin doesn't read in the background itself
   * yet; this is for apps that schedule their own background work.
   *
   * @since 0.1.0
   */
  background?: boolean;
}

/**
 * @since 0.1.0
 */
export interface CheckAuthorizationOptions {
  /** @since 0.1.0 */
  read?: (HealthType | PassthroughType)[];
  /** @since 0.1.0 */
  write?: (HealthType | PassthroughType)[];
}

/**
 * @since 0.1.0
 */
export interface AuthorizationResult {
  /**
   * Read access per type passed in `read`. On iOS this is `notDetermined` or `unknown`, never
   * `granted` (see `AuthorizationStatus`).
   *
   * @since 0.1.0
   */
  read: AuthorizationStatusMap;
  /**
   * Write access per type passed in `write`.
   *
   * @since 0.1.0
   */
  write: AuthorizationStatusMap;
  /**
   * iOS 27+: types the user shared only recent history of, with the date that history starts.
   * Data before that date is hidden from the app, not absent. Types with full access (or denied
   * access) aren't listed.
   *
   * @since 0.1.0
   */
  earliestAuthorizedDates?: Partial<Record<HealthType, string>>;
  /**
   * Android only: `READ_HEALTH_DATA_HISTORY` is granted.
   *
   * @since 0.1.0
   */
  historyGranted?: boolean;
  /**
   * Android only: `READ_HEALTH_DATA_IN_BACKGROUND` is granted.
   *
   * @since 0.1.0
   */
  backgroundGranted?: boolean;
}

// ------------------------------------------------------------------ samples

/**
 * How a sample was recorded.
 *
 * - `manual`: entered by the user.
 * - `automatic`: recorded passively by a device (e.g. a watch counting steps).
 * - `active`: recorded during a session the user started (e.g. a workout).
 * - `unknown`: not stated by the writer.
 *
 * iOS only knows `manual` (`HKMetadataKeyWasUserEntered`); everything else reads as `unknown` there.
 *
 * @since 0.1.0
 */
export type RecordingMethod = 'manual' | 'automatic' | 'active' | 'unknown';

/**
 * Health Connect's device types. iOS doesn't record a device type.
 *
 * @since 0.1.0
 */
export type DeviceType =
  'unknown' | 'watch' | 'phone' | 'scale' | 'ring' | 'headMounted' | 'fitnessBand' | 'chestStrap' | 'smartDisplay';

/**
 * The app that wrote a sample.
 *
 * @since 0.1.0
 */
export interface SampleSource {
  /**
   * Bundle id (iOS) or package name (Android).
   *
   * @since 0.1.0
   */
  id: string;
  /**
   * The app's name, when the platform provides it (iOS).
   *
   * @since 0.1.0
   */
  name?: string;
}

/**
 * The device that recorded a sample, when the writer said.
 *
 * @since 0.1.0
 */
export interface SampleDevice {
  /** @since 0.1.0 */
  name?: string;
  /** @since 0.1.0 */
  manufacturer?: string;
  /** @since 0.1.0 */
  model?: string;
  /**
   * Android only.
   *
   * @since 0.1.0
   */
  type?: DeviceType;
  /**
   * iOS only.
   *
   * @since 0.1.0
   */
  hardwareVersion?: string;
  /**
   * iOS only.
   *
   * @since 0.1.0
   */
  softwareVersion?: string;
}

/**
 * The platform object a sample came from, for anything the unified shape doesn't cover.
 *
 * @since 0.1.0
 */
export interface NativeSampleInfo {
  /**
   * HealthKit identifier (`HKCategoryTypeIdentifierMenstrualFlow`) or Health Connect record class
   * (`MenstruationFlowRecord`).
   *
   * @since 0.1.0
   */
  type: string;
  /**
   * The raw stored value (HealthKit enum raw value, Health Connect constant), for value types.
   *
   * @since 0.1.0
   */
  value?: number | string;
}

/**
 * Fields every sample has.
 *
 * Dates are ISO 8601 strings with an offset (`2026-10-15T08:00:00+05:30`), in the zone the sample
 * was recorded in when the platform knows it, otherwise the device's current zone.
 *
 * @since 0.1.0
 */
export interface SampleBase {
  /**
   * The platform's id for the sample. iOS replaces the id when a sample is upserted, so use
   * `clientId` to recognise your own samples across writes.
   *
   * @since 0.1.0
   */
  id: string;
  /** @since 0.1.0 */
  type: HealthType | PassthroughType;
  /** @since 0.1.0 */
  startDate: string;
  /**
   * Equal to `startDate` for samples recorded at a single moment.
   *
   * @since 0.1.0
   */
  endDate: string;
  /**
   * The zone offset the sample was recorded in (`+05:30`): always on Android, on iOS only when the
   * writer stored a time zone.
   *
   * @since 0.1.0
   */
  zoneOffset?: string;
  /** @since 0.1.0 */
  source: SampleSource;
  /** @since 0.1.0 */
  device?: SampleDevice;
  /** @since 0.1.0 */
  recordingMethod: RecordingMethod;
  /**
   * The writer's own id for the sample, if it set one (HealthKit sync identifier, Health Connect
   * `clientRecordId`).
   *
   * @since 0.1.0
   */
  clientId?: string;
  /** @since 0.1.0 */
  clientVersion?: number;
  /**
   * Android: the Health Connect series record (heart rate, speed, power, cadence) this sample is a
   * point of, when the record holds several points. Its points have ids `<seriesId>#<index>` and
   * share the record's `clientId`; a deletion in `getChanges` names the record, so it matches their
   * `seriesId`.
   *
   * @since 0.2.0
   */
  seriesId?: string;
  /**
   * Native fields the unified shape has no place for, under `hk.` / `hc.` keys.
   *
   * @since 0.1.0
   */
  metadata?: { [key: string]: string | number | boolean };
  /** @since 0.1.0 */
  native: NativeSampleInfo;
  /** @since 0.1.0 */
  platform: 'ios' | 'android';
}

/**
 * A number with a unit (`basalBodyTemperature`, …).
 *
 * @since 0.1.0
 */
export interface QuantitySample extends SampleBase {
  /** @since 0.1.0 */
  kind: 'quantity';
  /** @since 0.1.0 */
  type: QuantityHealthType;
  /** @since 0.1.0 */
  value: number;
  /**
   * The type's canonical unit, or the `unit` asked for in `readSamples()`.
   *
   * @since 0.1.0
   */
  unit: string;
  /**
   * `basalBodyTemperature`, `bodyTemperature`: where the temperature was taken. Absent when not
   * recorded.
   *
   * @since 0.1.0
   */
  measurementLocation?: string;
  /**
   * `vo2Max`, iOS: how the value was measured or estimated (`vo2MaxTestType` values).
   *
   * @since 0.2.0
   */
  testType?: string;
  /**
   * `vo2Max`, Android: how the value was measured (`vo2MaxMeasurementMethod` values).
   *
   * @since 0.2.0
   */
  measurementMethod?: string;
  /**
   * `bloodGlucose`: when the reading was taken relative to a meal. iOS stores only `beforeMeal` and
   * `afterMeal`.
   *
   * @since 0.2.0
   */
  relationToMeal?: string;
  /**
   * `bloodGlucose`, Android: the meal the reading relates to.
   *
   * @since 0.2.0
   */
  mealType?: string;
  /**
   * `bloodGlucose`, Android: what the reading was taken from (capillary blood, interstitial fluid, …).
   *
   * @since 0.2.0
   */
  specimenSource?: string;
  /**
   * `insulinDelivery`, iOS: `basal` or `bolus`.
   *
   * @since 0.2.0
   */
  reason?: string;
}

/**
 * One value from the type's value set (`menstrualFlow`, `ovulationTest`, symptoms, …).
 *
 * @since 0.1.0
 */
export interface CategorySample extends SampleBase {
  /** @since 0.1.0 */
  kind: 'category';
  /** @since 0.1.0 */
  type: CategoryHealthType;
  /**
   * The unified value, e.g. `medium` for `menstrualFlow`. `getSupportedTypes()` lists each type's values.
   *
   * @since 0.1.0
   */
  value: string;
  /**
   * `menstrualFlow`: the sample starts a period. iOS: the writer's flag (Apple Health itself writes
   * `false` even on day 1). Android: `true` when a period from the same app starts on this day,
   * `false` when one covers it but started earlier, absent otherwise.
   *
   * @since 0.1.0
   */
  isCycleStart?: boolean;
  /**
   * `cervicalMucus`, Android only: `light | medium | heavy`. Absent when not recorded.
   *
   * @since 0.1.0
   */
  sensation?: string;
}

/**
 * Something that happened, with no value (`intermenstrualBleeding`, `sexualActivity`, `pregnancy`, …).
 *
 * @since 0.1.0
 */
export interface EventSample extends SampleBase {
  /** @since 0.1.0 */
  kind: 'event';
  /** @since 0.1.0 */
  type: EventHealthType;
  /**
   * `sexualActivity`: whether protection was used. Absent when not recorded.
   *
   * @since 0.1.0
   */
  protectionUsed?: boolean;
  /**
   * `mindfulSession` on Android: `meditation`, `breathing`, `music`, `movement` or `unguided`. Absent
   * when not recorded; HealthKit mindful sessions have no type. Health Connect's title and notes read as
   * `metadata['hc.title']` / `metadata['hc.notes']`.
   *
   * @since 0.3.0
   */
  sessionType?: string;
}

/**
 * A menstruation period. Android stores periods as records. iOS has no period object: the plugin
 * derives periods from `menstrualFlow` samples (rules in the README).
 *
 * @since 0.1.0
 */
export interface MenstruationPeriodSample extends SampleBase {
  /** @since 0.1.0 */
  kind: 'special';
  /** @since 0.1.0 */
  type: 'menstruationPeriod';
  /**
   * First day of the period, as a local date (`2026-10-01`).
   *
   * @since 0.1.0
   */
  firstDay: string;
  /**
   * Last day of the period, inclusive.
   *
   * @since 0.1.0
   */
  lastDay: string;
  /**
   * `true` when the plugin worked the period out from flow samples (iOS).
   *
   * @since 0.1.0
   */
  derived: boolean;
  /**
   * iOS: the ids of the flow samples the period was derived from.
   *
   * @since 0.1.0
   */
  flowSampleIds?: string[];
}

/**
 * One change from the baseline in a `skinTemperature` sample.
 *
 * @since 0.1.0
 */
export interface SkinTemperatureDelta {
  /** @since 0.1.0 */
  time: string;
  /**
   * Difference from the baseline, in the sample's unit.
   *
   * @since 0.1.0
   */
  delta: number;
}

/**
 * Android only: skin temperature as a baseline plus timed deltas (`SkinTemperatureRecord`).
 *
 * @since 0.1.0
 */
export interface SkinTemperatureSample extends SampleBase {
  /** @since 0.1.0 */
  kind: 'special';
  /** @since 0.1.0 */
  type: 'skinTemperature';
  /** @since 0.1.0 */
  unit: string;
  /** @since 0.1.0 */
  baseline?: number;
  /** @since 0.1.0 */
  deltas: SkinTemperatureDelta[];
  /** @since 0.1.0 */
  measurementLocation?: string;
}

/**
 * Any sample `readSamples()` or `getChanges()` returns. Narrow it with `kind` or `type`.
 *
 * @since 0.1.0
 */
/**
 * A blood pressure reading. iOS stores it as a correlation of a systolic and a diastolic sample
 * (what Apple Health shows as one reading), Android as a `BloodPressureRecord`.
 *
 * @since 0.2.0
 */
export interface BloodPressureSample extends SampleBase {
  /** @since 0.2.0 */
  kind: 'special';
  /** @since 0.2.0 */
  type: 'bloodPressure';
  /** @since 0.2.0 */
  systolic: number;
  /** @since 0.2.0 */
  diastolic: number;
  /** @since 0.2.0 */
  unit: 'mmHg';
  /**
   * Android: `standingUp`, `sittingDown`, `lyingDown` or `reclining`. Absent when not recorded.
   *
   * @since 0.2.0
   */
  bodyPosition?: string;
  /**
   * Android: `leftWrist`, `rightWrist`, `leftUpperArm` or `rightUpperArm`. Absent when not recorded.
   *
   * @since 0.2.0
   */
  measurementLocation?: string;
}

/**
 * A sample of a passthrough type (`hk:…`), with its native value.
 *
 * @since 0.2.0
 */
export interface PassthroughSample extends SampleBase {
  /** @since 0.2.0 */
  kind: 'quantity' | 'category';
  /** @since 0.2.0 */
  type: PassthroughType;
  /**
   * A quantity in `unit`, or a category's raw HealthKit value.
   *
   * @since 0.2.0
   */
  value: number;
  /**
   * Quantities: the unit asked for in `readSamples()`, else the first unit of the plugin's unit table
   * that fits the HealthKit type.
   *
   * @since 0.2.0
   */
  unit?: string;
}

/**
 * One stage of a sleep session.
 *
 * @since 0.3.0
 */
export interface SleepStage {
  /**
   * `inBed`, `asleep`, `awake`, `light`, `deep` or `rem`; Android also `outOfBed` and `unknown`
   * (`getSupportedTypes()` lists what this platform stores). `light`, `deep` and `rem` need iOS 16.
   *
   * @since 0.3.0
   */
  stage: string;
  /** @since 0.3.0 */
  startDate: string;
  /** @since 0.3.0 */
  endDate: string;
}

/**
 * A night's sleep, or a nap. Android stores sessions as `SleepSessionRecord`s. iOS has no session
 * object: the plugin derives sessions from `sleepAnalysis` samples (rules in the README).
 *
 * Stages are in time order and never overlap; they may leave gaps. On iOS, time in bed that no other
 * stage covers reads as `inBed` stages.
 *
 * @since 0.3.0
 */
export interface SleepSessionSample extends SampleBase {
  /** @since 0.3.0 */
  kind: 'special';
  /** @since 0.3.0 */
  type: 'sleepSession';
  /** @since 0.3.0 */
  stages: SleepStage[];
  /**
   * Android only.
   *
   * @since 0.3.0
   */
  title?: string;
  /**
   * Android only.
   *
   * @since 0.3.0
   */
  notes?: string;
  /**
   * `true` when the plugin worked the session out from stage samples (iOS).
   *
   * @since 0.3.0
   */
  derived: boolean;
  /**
   * iOS: the ids of the `sleepAnalysis` samples the session was derived from, `inBed` ones included.
   *
   * @since 0.3.0
   */
  stageSampleIds?: string[];
}

export type Sample =
  | PassthroughSample
  | QuantitySample
  | CategorySample
  | EventSample
  | MenstruationPeriodSample
  | SkinTemperatureSample
  | BloodPressureSample
  | SleepSessionSample;

// ------------------------------------------------------------------ writing

/**
 * Fields every new sample can have.
 *
 * @since 0.1.0
 */
export interface NewSampleBase {
  /**
   * ISO 8601 with an offset. The offset is stored as the sample's zone offset on Android.
   *
   * @since 0.1.0
   */
  startDate: string;
  /**
   * Defaults to `startDate`. Must not be before it.
   *
   * @since 0.1.0
   */
  endDate?: string;
  /**
   * Your own stable id for the sample. Writing again with the same `clientId` replaces the sample
   * instead of adding another (when `clientVersion` is equal or higher), and `deleteSamples()` can
   * delete by it.
   *
   * @since 0.1.0
   */
  clientId?: string;
  /**
   * Version for `clientId` upserts: a write with a lower version than the stored one is ignored.
   * Defaults to `1`. Needs `clientId`.
   *
   * @since 0.1.0
   */
  clientVersion?: number;
  /**
   * Defaults to `unknown`. On iOS only `manual` is stored (as `HKMetadataKeyWasUserEntered`).
   *
   * @since 0.1.0
   */
  recordingMethod?: RecordingMethod;
  /** @since 0.1.0 */
  device?: SampleDevice;
  /**
   * IANA time zone the sample was recorded in (`Europe/Berlin`). iOS stores it as
   * `HKMetadataKeyTimeZone`; Android takes zone offsets from the dates and ignores it.
   *
   * @since 0.1.0
   */
  timeZone?: string;
}

/**
 * @since 0.1.0
 */
export interface NewQuantitySample extends NewSampleBase {
  /** @since 0.1.0 */
  type: QuantityHealthType;
  /** @since 0.1.0 */
  value: number;
  /**
   * One of the type's units. Defaults to its canonical unit.
   *
   * @since 0.1.0
   */
  unit?: string;
  /** @since 0.1.0 */
  measurementLocation?: string;
  /** @since 0.2.0 */
  testType?: string;
  /** @since 0.2.0 */
  measurementMethod?: string;
  /** @since 0.2.0 */
  relationToMeal?: string;
  /** @since 0.2.0 */
  mealType?: string;
  /** @since 0.2.0 */
  specimenSource?: string;
  /**
   * `insulinDelivery`: required on iOS, which rejects the sample without it.
   *
   * @since 0.2.0
   */
  reason?: string;
}

/**
 * @since 0.1.0
 */
export interface NewCategorySample extends NewSampleBase {
  /** @since 0.1.0 */
  type: CategoryHealthType;
  /**
   * One of the type's values that this platform can store (`getSupportedTypes()`). Others reject
   * with `INVALID_ARGUMENT` and `data.reason = 'valueUnsupportedOnPlatform'`.
   *
   * @since 0.1.0
   */
  value: string;
  /**
   * `menstrualFlow`, iOS: stored as `HKMetadataKeyMenstrualCycleStart`, which HealthKit requires on
   * every flow sample, so it defaults to `false`. Android has no such flag: write a
   * `menstruationPeriod` instead (setting it there rejects with `INVALID_ARGUMENT`).
   *
   * @since 0.1.0
   */
  isCycleStart?: boolean;
  /**
   * `cervicalMucus`, Android only.
   *
   * @since 0.1.0
   */
  sensation?: string;
}

/**
 * @since 0.1.0
 */
export interface NewEventSample extends NewSampleBase {
  /** @since 0.1.0 */
  type: EventHealthType;
  /** @since 0.1.0 */
  protectionUsed?: boolean;
  /** `mindfulSession`, Android only. @since 0.3.0 */
  sessionType?: string;
}

/**
 * A period to write. Only the local dates of `startDate` and `endDate` matter: the period covers
 * every day from the first to the last, inclusive.
 *
 * iOS writes one `menstrualFlow` sample per day (at local noon, first day flagged as cycle start,
 * `clientId` `<clientId>:<yyyy-mm-dd>`), so writing the same period again updates it and a shorter
 * period deletes the dropped days. Android writes one `MenstruationPeriodRecord` (at most 31 days)
 * plus a flow record per day listed in `flow`.
 *
 * @since 0.1.0
 */
export interface NewMenstruationPeriod extends NewSampleBase {
  /** @since 0.1.0 */
  type: 'menstruationPeriod';
  /**
   * The last day, inclusive. Required.
   *
   * @since 0.1.0
   */
  endDate: string;
  /**
   * Flow per day (`2026-10-01` → `heavy`). iOS writes `unspecified` for days not listed.
   *
   * @since 0.1.0
   */
  flow?: { [day: string]: string };
}

/**
 * Android only.
 *
 * @since 0.1.0
 */
export interface NewSkinTemperatureSample extends NewSampleBase {
  /** @since 0.1.0 */
  type: 'skinTemperature';
  /** @since 0.1.0 */
  endDate: string;
  /**
   * Unit of `baseline` and the deltas. Defaults to `degC`.
   *
   * @since 0.1.0
   */
  unit?: string;
  /** @since 0.1.0 */
  baseline?: number;
  /**
   * Times must fall between `startDate` and `endDate`.
   *
   * @since 0.1.0
   */
  deltas: SkinTemperatureDelta[];
  /** @since 0.1.0 */
  measurementLocation?: string;
}

/**
 * Any sample `saveSamples()` accepts.
 *
 * @since 0.1.0
 */
/**
 * A blood pressure reading, in mmHg. Android takes a single moment (`endDate` equal to `startDate`
 * or absent).
 *
 * @since 0.2.0
 */
export interface NewBloodPressureSample extends NewSampleBase {
  /** @since 0.2.0 */
  type: 'bloodPressure';
  /** @since 0.2.0 */
  systolic: number;
  /** @since 0.2.0 */
  diastolic: number;
  /** @since 0.2.0 */
  unit?: 'mmHg';
  /** @since 0.2.0 */
  bodyPosition?: string;
  /** @since 0.2.0 */
  measurementLocation?: string;
}

/**
 * A new sample of a passthrough type (`hk:…`, iOS).
 *
 * @since 0.2.0
 */
export interface NewPassthroughSample extends NewSampleBase {
  /** @since 0.2.0 */
  type: PassthroughType;
  /**
   * Quantities: the amount in `unit`. Categories: HealthKit's raw value (0 for types without values).
   *
   * @since 0.2.0
   */
  value: number;
  /**
   * Quantities: required, one of the plugin's unit ids that fits the HealthKit type (`mL`, `kcal`, …).
   *
   * @since 0.2.0
   */
  unit?: string;
}

/**
 * A sleep session to write. Stages must lie inside the session, may touch but not overlap, and may
 * leave gaps; the plugin sorts them.
 *
 * iOS writes one `sleepAnalysis` sample per stage plus one `inBed` sample spanning the whole session
 * (`inBed` stages you pass are folded into it), with `clientId`s `<clientId>:<n>` and
 * `<clientId>:inBed`, so writing the same session again replaces its stages. Time the stages don't
 * cover reads back as `inBed`. Android writes one `SleepSessionRecord`.
 *
 * @since 0.3.0
 */
export interface NewSleepSession extends NewSampleBase {
  /** @since 0.3.0 */
  type: 'sleepSession';
  /**
   * Required, after `startDate`.
   *
   * @since 0.3.0
   */
  endDate: string;
  /**
   * Defaults to none.
   *
   * @since 0.3.0
   */
  stages?: SleepStage[];
  /**
   * Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`.
   *
   * @since 0.3.0
   */
  title?: string;
  /**
   * Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`.
   *
   * @since 0.3.0
   */
  notes?: string;
}

export type NewSample =
  | NewPassthroughSample
  | NewQuantitySample
  | NewCategorySample
  | NewEventSample
  | NewMenstruationPeriod
  | NewSkinTemperatureSample
  | NewBloodPressureSample
  | NewSleepSession;

// ------------------------------------------------------------------ method options and results

/**
 * @since 0.1.0
 */
export interface ReadSamplesOptions {
  /**
   * A combined id (`distance`, `speed`, `power`) reads every member type HealthKit has on iOS; each
   * sample keeps the combined id as its `type` and names its member in `native.type`. Aggregate-only
   * types (`reason: 'aggregateOnly'` in `getSupportedTypes()`) reject with `UNSUPPORTED_TYPE`.
   *
   * @since 0.1.0
   */
  type: HealthType | PassthroughType;
  /**
   * Returns samples that overlap `startDate`–`endDate` (on Android, records covering a period of time
   * other than menstruation periods match by start time). ISO 8601 with an offset.
   *
   * @since 0.1.0
   */
  startDate: string;
  /** @since 0.1.0 */
  endDate: string;
  /**
   * Page size. Default 1,000, maximum 10,000.
   *
   * @since 0.1.0
   * @default 1000
   */
  limit?: number;
  /**
   * Oldest first.
   *
   * @since 0.1.0
   * @default true
   */
  ascending?: boolean;
  /**
   * `nextCursor` from the previous page. Pass the same other options with it.
   *
   * @since 0.1.0
   */
  cursor?: string;
  /**
   * Unit for quantity values; one of the type's units.
   *
   * @since 0.1.0
   */
  unit?: string;
  /**
   * Only samples written by these apps (bundle ids / package names).
   *
   * @since 0.1.0
   */
  sourceIds?: string[];
}

/**
 * @since 0.1.0
 */
export interface ReadSamplesResult {
  /** @since 0.1.0 */
  samples: Sample[];
  /**
   * Set when there may be more samples: pass it as `cursor` to get the next page.
   *
   * @since 0.1.0
   */
  nextCursor?: string;
}

/**
 * Bucket length for `aggregate()`.
 *
 * @since 0.2.0
 */
export type AggregateBucketUnit = 'minute' | 'hour' | 'day' | 'week' | 'month';

/**
 * @since 0.2.0
 */
export interface AggregateBucketOptions {
  /** @since 0.2.0 */
  unit: AggregateBucketUnit;
  /**
   * How many `unit`s each bucket spans.
   *
   * @since 0.2.0
   * @default 1
   */
  size?: number;
}

/**
 * @since 0.2.0
 */
export interface AggregateOptions {
  /**
   * A type whose `getSupportedTypes()` entry is `aggregatable`: quantity types, and `sleepSession`
   * (`duration`: seconds asleep, time two apps both record counted once).
   *
   * @since 0.2.0
   */
  type: HealthType;
  /**
   * Start of the range and of the first bucket. ISO 8601 with an offset.
   *
   * @since 0.2.0
   */
  startDate: string;
  /**
   * End of the range; the last bucket stops here.
   *
   * @since 0.2.0
   */
  endDate: string;
  /**
   * What to compute: `sum` for cumulative types (steps, energy, distance), `avg` / `min` / `max`
   * for the others, `count` (number of readings) where the platform has it. `TypeSupport.metrics`
   * lists them per type.
   *
   * @since 0.2.0
   */
  metrics: AggregateMetric[];
  /**
   * Split the range into buckets that start at `startDate`. Without it the result is one bucket for
   * the whole range. Minute and hour buckets are exact lengths of time; day, week and month buckets
   * follow the calendar in the device's time zone, so a day across a daylight-saving change lasts 23
   * or 25 hours. At most 5,000 buckets.
   *
   * @since 0.2.0
   */
  bucket?: AggregateBucketOptions;
  /**
   * Unit for `sum`, `avg`, `min` and `max`; one of the type's units. Defaults to its canonical unit.
   *
   * @since 0.2.0
   */
  unit?: string;
  /**
   * Only data written by these apps (bundle ids / package names).
   *
   * @since 0.2.0
   */
  sourceIds?: string[];
}

/**
 * @since 0.2.0
 */
export interface AggregateBucket {
  /** @since 0.2.0 */
  startDate: string;
  /** @since 0.2.0 */
  endDate: string;
  /**
   * The metrics asked for; a metric is absent when the bucket has no data for it. `count` is a
   * number of readings, `duration` seconds; the others are in `unit`.
   *
   * @since 0.2.0
   */
  values: Partial<Record<AggregateMetric, number>>;
  /** @since 0.2.0 */
  unit: string;
}

/**
 * @since 0.2.0
 */
export interface AggregateResult {
  /**
   * Every bucket of the range in order, including empty ones.
   *
   * @since 0.2.0
   */
  buckets: AggregateBucket[];
}

/**
 * @since 0.1.0
 */
export interface GetChangesOptions {
  /**
   * The types to follow. A cursor only works with the types it was created for.
   *
   * @since 0.1.0
   */
  types: (HealthType | PassthroughType)[];
  /**
   * `nextCursor` from the previous call. Without it, the call returns no changes, only a cursor
   * marking "now": read existing data with `readSamples()` first, then follow changes from there.
   *
   * @since 0.1.0
   */
  cursor?: string;
  /**
   * iOS: most changes to return per type and call (default 1,000). Health Connect sets its own page size.
   *
   * @since 0.1.0
   * @default 1000
   */
  limit?: number;
  /**
   * Leave out upserts this app wrote. Deletions are always reported: the platforms don't say who deleted.
   *
   * @since 0.1.0
   * @default false
   */
  excludeOwnWrites?: boolean;
}

/**
 * A deleted sample.
 *
 * @since 0.1.0
 */
export interface DeletedSample {
  /** @since 0.1.0 */
  type: HealthType | PassthroughType;
  /**
   * The deleted sample's id. On Android, a deleted series record gives one deletion whose id is the
   * record's: remove the samples whose `id` or `seriesId` equals it. iOS `sleepSession`: the id of a
   * deleted stage sample, so it matches a session's `id` or one of its `stageSampleIds`. HealthKit
   * doesn't say when a deleted sample was, so a session that only lost some of its stages isn't
   * derived again: when an id matches a stage of a session you hold, re-read that session's range.
   *
   * @since 0.1.0
   */
  id: string;
  /**
   * iOS only: the deleted sample's `clientId`, if it had one. For a stage of a sleep session the
   * plugin wrote, the session's `clientId`.
   *
   * @since 0.1.0
   */
  clientId?: string;
}

/**
 * @since 0.1.0
 */
export interface GetChangesResult {
  /**
   * Samples added or changed since the cursor, in their current state. iOS reports an edit as a
   * deletion plus a new sample with a new id.
   *
   * @since 0.1.0
   */
  upserted: Sample[];
  /** @since 0.1.0 */
  deleted: DeletedSample[];
  /**
   * Store it and pass it to the next call.
   *
   * @since 0.1.0
   */
  nextCursor: string;
  /**
   * More changes are waiting: call again with `nextCursor` straight away.
   *
   * @since 0.1.0
   */
  hasMore: boolean;
}

/**
 * @since 0.1.0
 */
export interface SaveSamplesOptions {
  /** @since 0.1.0 */
  samples: NewSample[];
}

/**
 * @since 0.1.0
 */
export interface SaveSamplesResult {
  /**
   * The stored ids, in the order of `samples`. For a period written on iOS, the id of its first
   * day's flow sample, which is also the id `readSamples()` reports for the period.
   *
   * @since 0.1.0
   */
  ids: string[];
}

/**
 * Pass exactly one of `ids`, `clientIds`, or `startDate` + `endDate`.
 *
 * @since 0.1.0
 */
export interface DeleteSamplesOptions {
  /** @since 0.1.0 */
  type: HealthType | PassthroughType;
  /**
   * Sample ids. On Android, the id of a point in a series record (`<seriesId>#<index>`) deletes the
   * whole record, every point of it.
   *
   * @since 0.1.0
   */
  ids?: string[];
  /** @since 0.1.0 */
  clientIds?: string[];
  /**
   * Deletes this app's samples that overlap `startDate`–`endDate`.
   *
   * @since 0.1.0
   */
  startDate?: string;
  /** @since 0.1.0 */
  endDate?: string;
}

/**
 * @since 0.1.0
 */
export interface DeleteSamplesResult {
  /** @since 0.1.0 */
  deleted: number;
}

// ------------------------------------------------------------------ plugin

export interface CapacitorHealthPlugin {
  /**
   * Checks whether HealthKit (iOS) or Health Connect (Android) can be used on this device.
   *
   * Call it before anything else. On the web it always resolves `{ available: false, status: 'notSupported' }`.
   *
   * @since 0.1.0
   */
  isAvailable(): Promise<AvailabilityResult>;

  /**
   * Lists every type the plugin knows with whether this device can read and write it.
   *
   * @since 0.1.0
   */
  getSupportedTypes(): Promise<SupportedTypesResult>;

  /**
   * Shows the platform's permission screen for the given types and reports the result.
   *
   * Declare what you request first, or the call rejects with `MISSING_DECLARATION`: iOS needs
   * `NSHealthShareUsageDescription` (read) and `NSHealthUpdateUsageDescription` (write) in
   * `Info.plist`; Android needs each permission in `AndroidManifest.xml` (see the README).
   *
   * iOS shows its sheet only for types the user hasn't been asked about; read results are
   * `unknown` afterwards. Android stops showing its dialog after the user refused twice: when
   * nothing new was granted, offer `openHealthSettings()`.
   *
   * @since 0.1.0
   */
  requestAuthorization(options: AuthorizationOptions): Promise<AuthorizationResult>;

  /**
   * Reports access for the given types without showing anything.
   *
   * @since 0.1.0
   */
  checkAuthorization(options: CheckAuthorizationOptions): Promise<AuthorizationResult>;

  /**
   * Opens Health Connect's settings (Android) or the Health app (iOS, which has no link to an app's
   * own health permissions; users find them under Profile → Apps).
   *
   * @since 0.1.0
   */
  openHealthSettings(): Promise<void>;

  /**
   * Android 9–13: opens Health Connect in the Play Store, to install or update it. Rejects with
   * `UNAVAILABLE` on iOS.
   *
   * @since 0.1.0
   */
  openHealthConnectInstall(): Promise<void>;

  /**
   * Reads samples of one type, a page at a time.
   *
   * A read the user denied on iOS returns no samples rather than an error: iOS hides read
   * permissions. On Android it rejects with `PERMISSION_DENIED`.
   *
   * @since 0.1.0
   */
  readSamples(options: ReadSamplesOptions): Promise<ReadSamplesResult>;

  /**
   * Sums, averages, minimums and maximums of a quantity type over a range, optionally in buckets.
   * Use it rather than adding up `readSamples()` values: phone and watch often record the same
   * steps, and HealthKit removes that overlap when it aggregates. Health Connect removes it only for
   * activity types (steps, distance, energy, floors…), using the user's app priority; for other types
   * its aggregates cover every app's data.
   *
   * @since 0.2.0
   */
  aggregate(options: AggregateOptions): Promise<AggregateResult>;

  /**
   * Returns what was added, changed or deleted since `cursor`, for incremental sync.
   *
   * @since 0.1.0
   */
  getChanges(options: GetChangesOptions): Promise<GetChangesResult>;

  /**
   * Writes samples, of one or several types. Samples with a `clientId` are upserted.
   *
   * @since 0.1.0
   */
  saveSamples(options: SaveSamplesOptions): Promise<SaveSamplesResult>;

  /**
   * Deletes samples of one type. Both platforms only let an app delete samples it wrote itself;
   * others are left alone and not counted. `ids` and `clientIds` that match nothing are skipped.
   *
   * @since 0.1.0
   */
  deleteSamples(options: DeleteSamplesOptions): Promise<DeleteSamplesResult>;

  // Reserved for a later release (decision D4), so they can be added without a breaking change:
  //   enableBackgroundDelivery(options: { types: HealthType[] }): Promise<void>;
  //   addListener('healthDataChanged', listener: (event: { types: HealthType[] }) => void): Promise<PluginListenerHandle>;
}
