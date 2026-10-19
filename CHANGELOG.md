# Changelog

## 0.1.0 (unreleased)

First release: Apple HealthKit (iOS) and Google Health Connect (Android) for Capacitor 8, with
reproductive health first. See the [documentation](docs/README.md).

### Added

- `isAvailable()`: HealthKit / Health Connect availability with a reason (`available`,
  `notSupported`, `notInstalled`, `updateRequired`).
- `getSupportedTypes()`: every type with whether this device can read, write and aggregate it, its
  values and units, and (Android) whether history and background reads are supported.
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
- `aggregate()`: sums, averages, minimums and maximums over a range, optionally in minute to month
  buckets, with each platform's de-duplication.
- 142 types:
  - Reproductive health: menstrual flow, menstruation periods (native on Android, derived from flow
    samples on iOS by documented rules), spotting, cervical mucus, ovulation / pregnancy /
    progesterone tests, sexual activity, basal body temperature, wrist and skin temperature,
    contraceptives, pregnancy, lactation, bleeding during / after pregnancy and after menopause,
    menopausal state, Apple's cycle-deviation flags, and the 22 symptoms of Apple Health's Cycle
    Tracking.
  - Activity, vitals and body: steps, distance, energy, speed, power, heart rate and HRV, SpO2,
    respiration, body temperature, blood pressure, blood glucose, weight and body composition, VO2
    max, walking and running metrics, audio exposure, Apple's heart and fitness notifications, and
    more.
- iOS: combined ids `distance`, `speed` and `power` read every matching HealthKit type.
- `bloodPressure`: one reading with `systolic` and `diastolic` (an `HKCorrelation` on iOS, a
  `BloodPressureRecord` on Android).
- Typed fields `isCycleStart`, `sensation`, `measurementLocation`, `protectionUsed`, `testType` /
  `measurementMethod` (`vo2Max`), `relationToMeal`, `mealType`, `specimenSource` (`bloodGlucose`)
  and `reason` (`insulinDelivery`).
- iOS: passthrough ids (`hk:` + a HealthKit identifier) for types without a unified id yet.
- Android: series records (heart rate, speed, power, cadence) read as one sample per point, with
  `seriesId` for records holding several points.
- Android: a default permissions-rationale screen opening `privacyPolicyUrl`.
- Validation of every argument in JavaScript, with stable error codes (`HealthErrorCode`) and messages
  that never contain health values. Values a platform would refuse (out of its ranges, the wrong
  record shape) reject with `INVALID_ARGUMENT` and a `data.reason` before reaching it.
- `debugLogging` for native logs.
