# Changelog

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
  upserts; `deleteSamples()` by ids, `clientId`s or range.
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
