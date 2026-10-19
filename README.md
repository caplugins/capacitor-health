# @caplugins/capacitor-health

[![npm](https://img.shields.io/npm/v/@caplugins/capacitor-health)](https://www.npmjs.com/package/@caplugins/capacitor-health)
[![CI](https://github.com/caplugins/capacitor-health/actions/workflows/ci.yml/badge.svg)](https://github.com/caplugins/capacitor-health/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Capacitor plugin for **Apple HealthKit** (iOS) and **Google Health Connect** (Android): one API to
read and write health data, with **reproductive health first**: menstrual flow, periods, spotting,
ovulation, pregnancy and progesterone tests, cervical mucus, sexual activity, basal body
temperature, cycle symptoms and more.

- **One type vocabulary on both platforms**: 142 types, with platform-only types and values
  reported, not hidden.
- **Menstruation periods on both platforms**: native records on Android, derived from flow samples
  on iOS (which has no period object) by documented, tested rules.
- **Built for apps that sync**: paged reads, idempotent writes (`clientId` upserts), deletes and
  incremental change queries.
- **Aggregates** (daily steps, average heart rate, …) computed by the platform, without
  double-counting phone and watch data.
- **Private by design**: no permissions declared for you, no network calls, no analytics, no health
  values in logs.

Covers reproductive health, activity (steps, distance, energy, floors, speed, power, cadence,
walking and running metrics), vitals (heart rate and HRV, blood pressure, SpO2, respiration,
temperature, blood glucose, VO2 max) and body measurements. Other HealthKit types can be used
through [passthrough ids](docs/supported-types.md#passthrough-ids-hk).

> Not to be confused with the unscoped `capacitor-health` package on npm, which is a different
> project.

## Requirements

| | |
|---|---|
| Capacitor | 8 |
| iOS | 15 or later. Builds with Xcode 27 or later. Swift Package Manager or CocoaPods. |
| Android | Health Connect: Android 9 (API 28) or later. App `minSdkVersion` 26, `compileSdkVersion` 36. |

## Install

```bash
npm install @caplugins/capacitor-health
npx cap sync
```

Then set up the native projects:

- **iOS**: add the HealthKit capability and the `NSHealthShareUsageDescription` /
  `NSHealthUpdateUsageDescription` strings. → [iOS setup](docs/setup-ios.md)
- **Android**: declare the health permissions you use, set `privacyPolicyUrl`, raise `minSdkVersion`
  to 26. → [Android setup](docs/setup-android.md)

## Usage

```ts
import { CapacitorHealth } from '@caplugins/capacitor-health';

// Is health data available here? (Android 9–13 may need Health Connect installed.)
const { available, status } = await CapacitorHealth.isAvailable();
if (status === 'notInstalled' || status === 'updateRequired') await CapacitorHealth.openHealthConnectInstall();
if (!available) throw new Error('No health data on this device');

// Ask for access. On iOS, read access always reads back as 'unknown': HealthKit never reveals it.
await CapacitorHealth.requestAuthorization({
  read: ['menstruationPeriod', 'basalBodyTemperature', 'steps'],
  write: ['menstruationPeriod'],
});

// Read periods (dates are ISO 8601 with an offset).
const { samples } = await CapacitorHealth.readSamples({
  type: 'menstruationPeriod',
  startDate: '2026-07-01T00:00:00+05:30',
  endDate: '2026-10-01T00:00:00+05:30',
});

// Write a period. The same clientId updates it instead of adding another.
await CapacitorHealth.saveSamples({
  samples: [{
    type: 'menstruationPeriod',
    startDate: '2026-10-01T09:00:00+05:30',
    endDate: '2026-10-05T09:00:00+05:30',
    clientId: 'period-2026-10-01',
    flow: { '2026-10-01': 'heavy', '2026-10-02': 'medium' },
  }],
});

// Steps per day for a week, from the platform.
const { buckets } = await CapacitorHealth.aggregate({
  type: 'steps',
  startDate: '2026-10-10T00:00:00+05:30',
  endDate: '2026-10-17T00:00:00+05:30',
  metrics: ['sum'],
  bucket: { unit: 'day' },
});

// Follow changes from other apps.
const { nextCursor } = await CapacitorHealth.getChanges({ types: ['menstrualFlow'] });
// …later: getChanges({ types: ['menstrualFlow'], cursor: nextCursor })
```

## Documentation

| | |
|---|---|
| [Getting started](docs/getting-started.md) | From install to your first read and write |
| [iOS setup](docs/setup-ios.md) · [Android setup](docs/setup-android.md) | Native project setup |
| [Permissions](docs/permissions.md) | What each platform tells you, and how to handle it |
| [Reading and writing](docs/reading-and-writing.md) | Dates, paging, sample shape, units, upserts, deletes |
| [Aggregates](docs/aggregates.md) | Totals and statistics without double-counting |
| [Syncing](docs/syncing.md) | Incremental changes with `getChanges()` |
| [Reproductive health](docs/reproductive-health.md) | Cycle types and menstruation periods on both platforms |
| [Supported types](docs/supported-types.md) | All 142 types with their native mappings and permissions |
| [Errors](docs/errors.md) | Error codes and reasons |
| [Privacy and store review](docs/privacy-and-store-review.md) | App Store and Google Play requirements |
| [Testing your integration](docs/testing.md) | Simulators, emulators and devices |
| [Coming from another health plugin](docs/migrating.md) | Migration notes |
| [API reference](docs/api.md) | Every method, option and result |

## Privacy

The plugin sends nothing anywhere and never logs health values (unless you turn on
`debugLogging`). Note that **Capacitor itself logs plugin call arguments and results in debug
builds**; keep `loggingBehavior` at its default so release builds don't. More in
[Privacy and store review](docs/privacy-and-store-review.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The design record
(architecture, decisions, platform research) lives in the
[wiki](https://github.com/caplugins/capacitor-health/wiki); planned work is tracked in
[issues](https://github.com/caplugins/capacitor-health/issues).

## License

[MIT](LICENSE)
