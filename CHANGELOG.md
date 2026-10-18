# Changelog

## 0.3.0 (unreleased)

### Added

- `hydration` (`dietaryWater` ⇄ `HydrationRecord`) in mL, L or US fl oz.
- 42 single-nutrient types (`dietaryProtein`, `dietaryEnergy`, `dietaryVitaminC`, …): HealthKit
  dietary samples on iOS, `aggregate()` sums on Android (decision #61).
- `mindfulSession` (HealthKit mindful sessions ⇄ `MindfulnessSessionRecord`, Android only where
  Health Connect has the feature), with `sessionType` on Android.
- Units `mg`, `mcg`, `oz` and `flOz`.
- `sleepSession` (decisions #64–#66): nights and naps with stages. iOS derives sessions from
  `sleepAnalysis` samples and writes them back as an in-bed span plus one sample per stage; Android
  stores `SleepSessionRecord`s with `title` and `notes`. Read, write, delete, `getChanges` and
  `aggregate()` time asleep (`duration`) on both.
- `workout` (decisions #67–#69): finished workouts with activity type, totals, segments (Health
  Connect's segment types, checked against the activity on Android), laps and iOS multisport
  activities. Read, write, delete and `getChanges` on both: `HKWorkout`s on iOS (`HKWorkoutBuilder`,
  totals associated with the workout), `ExerciseSessionRecord`s on Android (totals as the workout
  app's active calories and distance records, `title` and `notes`). On Android, `aggregate()` gives
  exercise time (`duration`). `WORKOUT_ACTIVITIES` and `WORKOUT_SEGMENTS` are exported.

### Changed

- iOS passthrough ids for identifiers that now have a unified id (`hk:HKQuantityTypeIdentifierDietaryWater`,
  every `hk:HKQuantityTypeIdentifierDietary…`, `hk:HKCategoryTypeIdentifierMindfulSession`,
  `hk:HKCategoryTypeIdentifierSleepAnalysis`) reject with
  `INVALID_ARGUMENT`, `data.reason` `registeredType` and the unified id in `data.type` (decision #59).

## 0.2.0 (unreleased)

### Added

- `aggregate()`: sums, averages, minimums and maximums over a range, optionally in minute to month
  buckets, with each platform's de-duplication.
- 98 activity, vitals and body types: steps, distance, energy, speed, power, heart rate and HRV,
  SpO2, respiration, body temperature, blood glucose, weight and body composition, VO2 max, walking
  and running metrics, audio exposure, Apple's heart and fitness notifications, and more. See the
  type table in the README.
- iOS: combined ids `distance`, `speed` and `power` read every matching HealthKit type.
- `bloodPressure`: one reading with `systolic` and `diastolic` (an `HKCorrelation` on iOS, a
  `BloodPressureRecord` on Android).
- Typed fields `testType` / `measurementMethod` (`vo2Max`), `relationToMeal`, `mealType`,
  `specimenSource` (`bloodGlucose`) and `reason` (`insulinDelivery`).
- iOS: passthrough ids (`hk:` + a HealthKit identifier) for types without a unified id yet.
- `UnsupportedReason` `aggregateOnly` for types that only have aggregates on a platform.
- Android: series records (heart rate, speed, power, cadence) read as one sample per point, with
  `seriesId` for records holding several points.
- iOS: values HealthKit would refuse with an exception (effort scores outside 0–10, audio exposure
  samples without a duration) reject with `INVALID_ARGUMENT` before reaching HealthKit.
- Android: writes that don't fit Health Connect's record shapes or ranges reject with
  `INVALID_ARGUMENT` and `data.reason` `intervalOnly`, `instantOnly`, `wholeNumberOnly` or
  `outOfRange`.

## 0.1.0 (unreleased)

First release: availability, permissions and reproductive health on iOS (HealthKit) and Android
(Health Connect). See the [README](README.md) for setup and behaviour.

### Added

- `isAvailable()`: HealthKit / Health Connect availability with a reason (`available`,
  `notSupported`, `notInstalled`, `updateRequired`).
- `getSupportedTypes()`: every type with whether this device can read and write it, its values and
  units, and (Android) whether history and background reads are supported.
- `requestAuthorization()` / `checkAuthorization()`: per-type read and write status that never claims
  more than the platform reveals (iOS read access is `unknown`), iOS 27's limited-history start dates,
  Android's history and background permissions. Missing `Info.plist` strings or manifest permissions
  reject with `MISSING_DECLARATION` instead of crashing or failing silently.
- `openHealthSettings()`, `openHealthConnectInstall()`.
- `readSamples()` with paging, units and source filters; `saveSamples()` with idempotent `clientId`
  upserts; `deleteSamples()` by ids, `clientId`s or range (ids that match nothing or belong to other
  apps are skipped).
- `getChanges()`: incremental changes with an opaque cursor, own writes optionally excluded,
  `CURSOR_EXPIRED` when Health Connect drops a cursor.
- 44 types: menstrual flow, menstruation periods (native on Android, derived from flow samples on iOS
  by documented rules), spotting, cervical mucus, ovulation / pregnancy / progesterone tests, sexual
  activity, basal body temperature, wrist and skin temperature, contraceptives, pregnancy, lactation,
  bleeding during / after pregnancy and after menopause, menopausal state, Apple's cycle-deviation
  flags, and the 22 symptoms of Apple Health's Cycle Tracking.
- Android: a default permissions-rationale screen opening `privacyPolicyUrl`.
- Validation of every argument in JavaScript, with stable error codes (`HealthErrorCode`) and messages
  that never contain health values; `debugLogging` for native logs.
