# Getting started

This page takes you from install to your first read and write. Each step links to the page with
the details.

## Requirements

| | |
|---|---|
| Capacitor | 8 |
| iOS | Runs on iOS 15 or later (iPhone, or iPad with iPadOS 17 or later). Builds with **Xcode 27** or later: the plugin uses iOS 27 SDK APIs behind availability checks. |
| Android | `minSdkVersion` 26 (Health Connect itself needs Android 9 / API 28), `compileSdkVersion` 36 |
| Web | Not supported. `isAvailable()` reports `notSupported`; other calls reject with `UNAVAILABLE`. |

## 1. Install

```bash
npm install @caplugins/capacitor-health
npx cap sync
```

## 2. Set up the native projects

- **iOS**: add the HealthKit capability and two `Info.plist` strings. [iOS setup](setup-ios.md)
- **Android**: declare the health permissions you use, set your privacy policy URL, and raise
  `minSdkVersion` to 26. [Android setup](setup-android.md)

## 3. Check availability

```ts
import { CapacitorHealth } from '@caplugins/capacitor-health';

const { available, status } = await CapacitorHealth.isAvailable();

if (status === 'notInstalled' || status === 'updateRequired') {
  // Android 9–13 without (a recent) Health Connect: explain, then
  await CapacitorHealth.openHealthConnectInstall();
}
if (!available) {
  // Hide health features on this device.
}
```

## 4. Ask for access

Ask when the user reaches the feature that needs it:

```ts
const access = await CapacitorHealth.requestAuthorization({
  read: ['menstrualFlow', 'menstruationPeriod', 'steps'],
  write: ['menstrualFlow', 'menstruationPeriod'],
});
```

On iOS, read access shows as `unknown` after asking: HealthKit never tells apps whether reading was
allowed. Write access is exact on both platforms. [Permissions](permissions.md)

## 5. Read

```ts
const { samples, nextCursor } = await CapacitorHealth.readSamples({
  type: 'menstruationPeriod',
  startDate: '2026-07-01T00:00:00+05:30',
  endDate: '2026-10-01T00:00:00+05:30',
});
```

All dates are ISO 8601 strings with an offset. Pass `nextCursor` back as `cursor` for the next page.
[Reading and writing](reading-and-writing.md)

## 6. Write

```ts
await CapacitorHealth.saveSamples({
  samples: [
    {
      type: 'ovulationTest',
      startDate: '2026-10-14T08:00:00+05:30',
      value: 'lhSurge',
      clientId: 'ovulation-2026-10-14', // your own id: writing it again updates instead of duplicating
    },
  ],
});
```

## 7. Totals and sync

- Daily steps, average heart rate and other totals: [Aggregates](aggregates.md). Never add up raw
  samples; a phone and a watch both count the same walk.
- Keeping your own copy up to date with other apps' changes: [Syncing](syncing.md).

## Before you ship

- Read [Privacy and store review](privacy-and-store-review.md): both stores review health apps
  closely, and reproductive data most of all.
- Test on real devices: [Testing your integration](testing.md).
