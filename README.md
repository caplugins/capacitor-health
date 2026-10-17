# @caplugins/capacitor-health

Capacitor plugin for **Apple HealthKit** (iOS) and **Google Health Connect** (Android): one API to
read and write health data, with **reproductive health first**: menstrual flow, periods, spotting,
ovulation, pregnancy and progesterone tests, cervical mucus, sexual activity, basal body
temperature, cycle symptoms and more.

- One type vocabulary on both platforms, with platform-only types and values reported, not hidden.
- Paged reads, idempotent writes (`clientId` upserts), deletes and **incremental change queries**
  for apps that sync.
- Menstruation **periods on both platforms**: native records on Android, derived from flow samples on
  iOS (which has no period object) by documented, tested rules.
- No permissions declared for you, no network calls, no analytics, no health values in logs.

Version 0.1.0 covers availability, permissions and the 44 reproductive-health types listed
[below](#supported-types). Activity, vitals, sleep, workouts and nutrition follow in later releases
([roadmap](docs/05-roadmap.md)).

Not to be confused with the unscoped `capacitor-health` package on npm, which is a different project.

## Contents

- [Install](#install)
- [iOS setup](#ios-setup)
- [Android setup](#android-setup)
- [Usage](#usage)
- [How it behaves](#how-it-behaves): dates, samples, writes, changes, periods, permissions, errors
- [Privacy](#privacy)
- [Supported types](#supported-types)
- [Coming from another health plugin](#coming-from-another-health-plugin)
- [Configuration](#configuration)
- [API](#api)

## Install

Requires Capacitor 8.

```bash
npm install @caplugins/capacitor-health
npx cap sync
```

Both Swift Package Manager and CocoaPods are supported on iOS.

## iOS setup

1. **Add the HealthKit capability** to your app target in Xcode (Signing & Capabilities → +
   Capability → HealthKit). That adds the `com.apple.developer.healthkit` entitlement. Leave
   "Clinical Health Records" and "Background Delivery" off: this plugin uses neither.
2. **Add usage strings to `Info.plist`**, saying specifically what your app does with the data
   (vague strings get rejected in review):

   ```xml
   <key>NSHealthShareUsageDescription</key>
   <string>We read your cycle data from Apple Health to show your history and predictions.</string>
   <key>NSHealthUpdateUsageDescription</key>
   <string>We save the periods and symptoms you log to Apple Health.</string>
   ```

   `NSHealthShareUsageDescription` is needed to read, `NSHealthUpdateUsageDescription` to write.
   HealthKit crashes an app that asks without them; this plugin checks first and rejects with
   `MISSING_DECLARATION` instead.
3. **App Store:** mention the Health integration in your description and UI (guideline 2.5.1), have
   a privacy policy, don't use health data for ads or marketing and don't store it in iCloud
   (5.1.3), and declare "Health" in the App Privacy section if data read from HealthKit leaves the
   device.

The plugin supports iOS 15 and later. Types newer than the running iOS (for example
`menopausalState`, iOS 27) report `supported: false` in `getSupportedTypes()` and reject with
`UNSUPPORTED_TYPE`.

## Android setup

1. **Declare the permissions you use** in `android/app/src/main/AndroidManifest.xml`, and only those
   (Google Play rejects health permissions that no feature needs). The plugin declares none and
   rejects with `MISSING_DECLARATION` when you request one you didn't declare. Each type's
   permissions are in the [type table](#supported-types); a cycle tracker might declare:

   ```xml
   <uses-permission android:name="android.permission.health.READ_MENSTRUATION" />
   <uses-permission android:name="android.permission.health.WRITE_MENSTRUATION" />
   <uses-permission android:name="android.permission.health.READ_OVULATION_TEST" />
   <uses-permission android:name="android.permission.health.WRITE_OVULATION_TEST" />
   <!-- Optional: data older than 30 days before the first grant (requestAuthorization's android.history) -->
   <uses-permission android:name="android.permission.health.READ_HEALTH_DATA_HISTORY" />
   ```

   `menstrualFlow` and `menstruationPeriod` share the `MENSTRUATION` permissions.
2. **Set your privacy policy URL.** Health Connect only shows its permission dialog to apps with a
   permissions-rationale screen, and links to it from the dialog. The plugin ships a default screen
   that opens this URL (use the same policy as your Play listing):

   ```json
   {
     "plugins": {
       "CapacitorHealth": { "privacyPolicyUrl": "https://example.com/privacy" }
     }
   }
   ```

   To show your own screen instead, remove the plugin's in your app's manifest (with
   `xmlns:tools="http://schemas.android.com/tools"` on `<manifest>`) and declare yours with the same
   intent filters:

   ```xml
   <activity android:name="com.caplugins.health.PermissionsRationaleActivity" tools:node="remove" />
   <activity-alias android:name="com.caplugins.health.ViewPermissionUsageActivity" tools:node="remove" />
   ```

3. **SDK levels.** Health Connect's library (`androidx.health.connect:connect-client` 1.1.0) needs
   `compileSdkVersion` 36 and Android Gradle Plugin 8.9.1 or newer, which new Capacitor 8 apps have.
   It also needs `minSdkVersion` 26 (Capacitor 8 apps start at 24). Either raise yours to 26, or add
   `<uses-sdk tools:overrideLibrary="androidx.health.connect.client,com.caplugins.health" />` to your
   manifest. Health Connect only runs on Android 9 (API 28) and later: below that `isAvailable()`
   reports `notSupported` without touching it, and every other call rejects with `UNAVAILABLE`. To
   use another `connect-client` version, set `androidxHealthConnectVersion` in
   `android/variables.gradle`.
4. **Health Connect itself.** It's part of Android 14 and later. On Android 9–13 users install the
   Health Connect app; `isAvailable()` reports `notInstalled` or `updateRequired`, and
   `openHealthConnectInstall()` opens it in the Play Store.
5. **Google Play:** fill in the Health apps declaration (Play Console → App content) with a reason
   for every Health Connect permission tied to a visible feature, and the Data safety form.
   Reproductive data gets extra scrutiny: describe the cycle-tracking feature it serves.

## Usage

```ts
import { CapacitorHealth } from '@caplugins/capacitor-health';

// 1. Is health data available here? (On Android 9–13, offer to install Health Connect if it isn't.)
const { available, status } = await CapacitorHealth.isAvailable();
if (status === 'notInstalled' || status === 'updateRequired') await CapacitorHealth.openHealthConnectInstall();
if (!available) throw new Error('No health data on this device');

// 2. Ask for access. Types this platform doesn't have come back 'unsupported'.
const access = await CapacitorHealth.requestAuthorization({
  read: ['menstrualFlow', 'menstruationPeriod', 'basalBodyTemperature'],
  write: ['menstrualFlow', 'menstruationPeriod'],
});

// 3. Read a page of samples (ISO 8601 dates with an offset).
const { samples, nextCursor } = await CapacitorHealth.readSamples({
  type: 'menstruationPeriod',
  startDate: '2026-07-01T00:00:00+05:30',
  endDate: '2026-10-01T00:00:00+05:30',
});
for (const period of samples) {
  if (period.type === 'menstruationPeriod') console.log(period.firstDay, period.lastDay);
}

// 4. Write. A clientId makes the write idempotent: the same clientId updates instead of duplicating.
await CapacitorHealth.saveSamples({
  samples: [
    {
      type: 'menstruationPeriod',
      startDate: '2026-10-01T09:00:00+05:30',
      endDate: '2026-10-05T09:00:00+05:30',
      clientId: 'period-2026-10-01',
      flow: { '2026-10-01': 'heavy', '2026-10-02': 'medium' },
      recordingMethod: 'manual',
    },
    { type: 'ovulationTest', startDate: '2026-10-14T08:00:00+05:30', value: 'lhSurge', clientId: 'ovulation-2026-10-14' },
  ],
});

// 5. Sync incrementally: the first call (no cursor) returns only a cursor marking "now".
let { nextCursor: cursor } = await CapacitorHealth.getChanges({ types: ['menstrualFlow', 'ovulationTest'] });
// …later, and again whenever you sync:
const changes = await CapacitorHealth.getChanges({ types: ['menstrualFlow', 'ovulationTest'], cursor });
cursor = changes.nextCursor; // store it; call again straight away while changes.hasMore
```

Validation happens in JavaScript before anything reaches the platform: a malformed date, a value the
type doesn't have or a value this platform can't store rejects with `INVALID_ARGUMENT` and names the
field (`data.field`, e.g. `samples[1].value`).

## How it behaves

### Dates and time zones

All dates are ISO 8601 strings **with an offset**: `2026-10-15T08:00:00+05:30`. The plugin returns
them in the zone the sample was recorded in when the platform knows it (Health Connect always; iOS
when the writer stored a time zone), otherwise in the device's current zone, and sets `zoneOffset`
when the platform recorded one. Times are kept to the millisecond. On writes, Android stores the
offsets of your dates; iOS stores the optional IANA `timeZone` you pass as `HKMetadataKeyTimeZone`.

Ranges (`startDate`–`endDate`) match samples that **overlap** them on both platforms. One exception:
Android's `skinTemperature` matches by start time, as Health Connect does.

### Samples

Every sample has `id`, `type`, `kind` (`quantity`, `category`, `event` or `special`), `startDate`,
`endDate`, `source` (bundle id / package name), `recordingMethod`, `platform`, `native` (the HealthKit
identifier or Health Connect record and raw value) and, when present, `device`, `clientId`,
`clientVersion`, `zoneOffset` and `metadata` (native fields the shared shape has no place for, under
`hk.` / `hc.` keys). Typed fields: `isCycleStart` (`menstrualFlow`), `sensation` (`cervicalMucus`,
Android), `measurementLocation` (`basalBodyTemperature`, `skinTemperature`), `protectionUsed`
(`sexualActivity`).

- Quantities come in the type's canonical unit unless you pass `unit` (`degC` or `degF` for
  temperatures).
- Some values exist on one platform only, like flow `none` (iOS) or cervical mucus `unusual`
  (Android). Reads never invent them; writes on the other platform reject with
  `data.reason: 'valueUnsupportedOnPlatform'`. `getSupportedTypes()` lists each type's values here.
- On Android, `menstrualFlow.isCycleStart` is computed: `true` when a period from the same app starts
  that day, `false` when one covers it but started earlier, absent otherwise. On iOS it's whatever
  the writer stored; note that Apple Health itself writes `false` even on day 1.

### Writes, upserts and deletes

- Give samples a `clientId` (your own stable id) to make writes idempotent. Writing the same
  `clientId` again replaces the sample when `clientVersion` is equal or higher (default `1`) and is
  ignored when it's lower. `saveSamples` returns the stored ids, in order.
- **iOS replaces a sample's `id` when it's updated** (HealthKit samples are immutable); `clientId`
  stays. Health Connect keeps the id. Don't re-save unchanged samples: on iOS it creates churn in
  `getChanges`.
- `deleteSamples` takes `ids`, `clientIds` or a `startDate`–`endDate` range. Both platforms only let
  an app delete what it wrote; other apps' samples are left alone. Ids and `clientIds` that match
  nothing are skipped.
- Read-only types (Apple-computed ones like `wristTemperature`) reject writes with `READ_ONLY_TYPE`.

### Changes (`getChanges`)

- Without a cursor you get **no samples**, only a cursor marking "now". Read existing data with
  `readSamples`, then follow changes from there. A cursor only works with the types it was created for.
- `upserted` holds samples in their current state; `deleted` holds `{ type, id }`, plus `clientId` on
  iOS. Health Connect collapses several edits of one record into one upsert. iOS reports an edit as a
  deletion plus a new sample with a new id.
- Call again while `hasMore` is `true`. Health Connect cursors expire after about 30 days unused:
  you get `CURSOR_EXPIRED`, re-read with `readSamples` and start over without a cursor.
- `excludeOwnWrites: true` leaves out upserts your app made (deletions carry no source).
- On iOS, `menstruationPeriod` can't be followed (periods are derived; see below): follow
  `menstrualFlow` and re-read the periods around what changed.

### Menstruation periods

Health Connect stores periods as records; HealthKit doesn't have them, so on iOS the plugin works them
out from `menstrualFlow` samples. These rules are a contract, covered by
[test fixtures](fixtures/menstruation):

- **Reading on iOS:** flow samples are mapped to local days (each sample's own stored time zone, else
  the device's). A sample with a duration covers each day from its start up to, but not including, its
  end, so a sample ending at midnight doesn't add a day. Samples with flow `none` are ignored. A new
  period starts after **two or more blank days** (one blank day stays inside a period) or at a sample
  flagged `isCycleStart`. The gap rule comes first, because Apple Health writes the flag as `false`
  even on day 1. The plugin looks 15 days before your range, so a period that started earlier is
  returned whole. A derived period has `derived: true`, `firstDay` / `lastDay` (local dates),
  `startDate` / `endDate` from local midnight of the first day to 23:59:59.999 of the last, the ids of
  its flow samples, and its first sample's id and source. Like Apple Health, it merges days from every
  app: if another app logged days next to yours, they form one period, whose `id`, `source` and
  `clientId` come from its first day. Look periods up by date, not only by `clientId`.
- **Writing on iOS:** a period becomes one flow sample per day at local noon (`unspecified` unless you
  pass `flow` for that day), flagged as cycle start on day 1, with `clientId`
  `<your clientId>:<yyyy-mm-dd>`. Writing the same period again updates it, and a shorter period
  deletes the days it no longer covers. This is the shape Apple Health writes itself.
- **Android:** one `MenstruationPeriodRecord` from local midnight of the first day to 23:59:59.999 of
  the last, at most **31 days** (Health Connect's limit). Days in `flow` also become flow records,
  which belong to the period: re-writing it replaces them, deleting it deletes them. Reads map a
  period's end to the day before when it ends exactly at midnight.
- `deleteSamples` for periods counts periods. On iOS it deletes your app's flow samples of the
  matched periods.

### Permissions

- **iOS never tells apps whether read access was granted.** Read status is `notDetermined` before you
  ask and `unknown` after, never `granted`, and a read the user denied simply returns no data. Write
  status is exact. On iOS 27, users can share only recent history; `earliestAuthorizedDates` tells you
  where it starts (data before it is hidden, not absent; your app's own samples stay readable).
- **Android reports grants exactly**, but `notGranted` can't tell "never asked" from "refused".
- Health Connect **stops showing its dialog after the user refuses twice**: the call returns at once
  with nothing new granted. When that happens, offer `openHealthSettings()` (Health Connect's
  settings; users find your app under "App permissions"). On iOS it opens the Health app, where
  users find your app under Profile → Apps.
- On Android, reopening your app from its launcher icon while the dialog is open closes the dialog
  (Capacitor's `singleTask` activity); the call then resolves with what was granted.
- iOS shows its sheet only for types it hasn't asked about yet, and Android only for permissions not
  yet granted.

### Errors

Every rejection has a stable `code` (see [`HealthErrorCode`](#healtherrorcode)) and a message without
health values; `data` adds the `field`, `type`, `reason` or `missing` declarations where relevant.

```ts
try {
  await CapacitorHealth.saveSamples({ samples });
} catch (error) {
  const { code, data } = error as HealthError;
  if (code === 'PERMISSION_DENIED') {
    // ask again, or point the user to openHealthSettings()
  }
}
```

## Privacy

- The plugin sends nothing anywhere: no network calls, no analytics, no storage of its own.
- It never logs health values unless you set `debugLogging: true` (for debugging only).
- **Capacitor itself logs every plugin call's arguments and results in debug builds**, health values
  included, to the Xcode console and logcat. Keep `loggingBehavior` at its default (`"debug"`) so
  release builds don't log, or set `"none"` in `capacitor.config` to silence it everywhere.
- Don't forward health data to analytics, advertising or attribution SDKs: both Apple (5.1.3) and
  Google's Health Connect policy forbid it, and regulators have acted against cycle-tracking apps
  that did. Treat sharing between users (partner features) as disclosure: ask for specific consent.

## Supported types

`getSupportedTypes()` reports what's available on the running device. Permissions are shown without
the `android.permission.health.` prefix.

<!-- registry-types:start -->
<!-- Generated by scripts/gen-registry.mjs from registry/types.json. Do not edit. -->

| Type | Kind | HealthKit | Health Connect record: read / write permission | Values or units |
|---|---|---|---|---|
| `menstrualFlow` | category | `MenstrualFlow` (iOS 9.0+) | `MenstruationFlowRecord`: `READ_MENSTRUATION` / `WRITE_MENSTRUATION` | `unspecified`, `light`, `medium`, `heavy`, `none` (iOS) |
| `menstruationPeriod` | special | `MenstrualFlow` (iOS 9.0+, derived from `menstrualFlow`) | `MenstruationPeriodRecord`: `READ_MENSTRUATION` / `WRITE_MENSTRUATION` |  |
| `intermenstrualBleeding` | event | `IntermenstrualBleeding` (iOS 9.0+) | `IntermenstrualBleedingRecord`: `READ_INTERMENSTRUAL_BLEEDING` / `WRITE_INTERMENSTRUAL_BLEEDING` |  |
| `cervicalMucus` | category | `CervicalMucusQuality` (iOS 9.0+) | `CervicalMucusRecord`: `READ_CERVICAL_MUCUS` / `WRITE_CERVICAL_MUCUS` | `dry`, `sticky`, `creamy`, `watery`, `eggWhite`, `unusual` (Android), `unknown` (Android) |
| `ovulationTest` | category | `OvulationTestResult` (iOS 9.0+) | `OvulationTestRecord`: `READ_OVULATION_TEST` / `WRITE_OVULATION_TEST` | `negative`, `lhSurge`, `estrogenSurge`, `indeterminate` |
| `sexualActivity` | event | `SexualActivity` (iOS 9.0+) | `SexualActivityRecord`: `READ_SEXUAL_ACTIVITY` / `WRITE_SEXUAL_ACTIVITY` |  |
| `basalBodyTemperature` | quantity | `BasalBodyTemperature` (iOS 9.0+) | `BasalBodyTemperatureRecord`: `READ_BASAL_BODY_TEMPERATURE` / `WRITE_BASAL_BODY_TEMPERATURE` | `degC`, `degF` |
| `wristTemperature` | quantity | `AppleSleepingWristTemperature` (iOS 16.0+, read-only) | — | `degC`, `degF` |
| `skinTemperature` | special | — | `SkinTemperatureRecord`: `READ_SKIN_TEMPERATURE` / `WRITE_SKIN_TEMPERATURE` (needs `FEATURE_SKIN_TEMPERATURE`) | `degC`, `degF` |
| `pregnancyTest` | category | `PregnancyTestResult` (iOS 15.0+) | — | `negative`, `positive`, `indeterminate` |
| `progesteroneTest` | category | `ProgesteroneTestResult` (iOS 15.0+) | — | `negative`, `positive`, `indeterminate` |
| `contraceptive` | category | `Contraceptive` (iOS 14.3+) | — | `unspecified`, `implant`, `injection`, `intrauterineDevice`, `intravaginalRing`, `oral`, `patch` |
| `pregnancy` | event | `Pregnancy` (iOS 14.3+) | — |  |
| `lactation` | event | `Lactation` (iOS 14.3+) | — |  |
| `bleedingDuringPregnancy` | category | `BleedingDuringPregnancy` (iOS 18.0+) | — | `unspecified`, `light`, `medium`, `heavy`, `none` |
| `bleedingAfterPregnancy` | category | `BleedingAfterPregnancy` (iOS 18.0+) | — | `unspecified`, `light`, `medium`, `heavy`, `none` |
| `bleedingAfterMenopause` | category | `BleedingAfterMenopause` (iOS 27.0+) | — | `unspecified`, `light`, `medium`, `heavy`, `none` |
| `menopausalState` | category | `MenopausalState` (iOS 27.0+) | — | `menopause`, `perimenopause`, `none` |
| `infrequentMenstrualCycles` | event | `InfrequentMenstrualCycles` (iOS 16.0+, read-only) | — |  |
| `irregularMenstrualCycles` | event | `IrregularMenstrualCycles` (iOS 16.0+, read-only) | — |  |
| `persistentIntermenstrualBleeding` | event | `PersistentIntermenstrualBleeding` (iOS 16.0+, read-only) | — |  |
| `prolongedMenstrualPeriods` | event | `ProlongedMenstrualPeriods` (iOS 16.0+, read-only) | — |  |
| `abdominalCramps` | category | `AbdominalCramps` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `acne` | category | `Acne` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `appetiteChanges` | category | `AppetiteChanges` (iOS 13.6+) | — | `unspecified`, `noChange`, `decreased`, `increased` |
| `bladderIncontinence` | category | `BladderIncontinence` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `bloating` | category | `Bloating` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `breastPain` | category | `BreastPain` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `chills` | category | `Chills` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `constipation` | category | `Constipation` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `diarrhea` | category | `Diarrhea` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `drySkin` | category | `DrySkin` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `fatigue` | category | `Fatigue` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `hairLoss` | category | `HairLoss` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `headache` | category | `Headache` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `hotFlashes` | category | `HotFlashes` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `lowerBackPain` | category | `LowerBackPain` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `memoryLapse` | category | `MemoryLapse` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `moodChanges` | category | `MoodChanges` (iOS 13.6+) | — | `present`, `notPresent` |
| `nausea` | category | `Nausea` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `nightSweats` | category | `NightSweats` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `pelvicPain` | category | `PelvicPain` (iOS 13.6+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |
| `sleepChanges` | category | `SleepChanges` (iOS 13.6+) | — | `present`, `notPresent` |
| `vaginalDryness` | category | `VaginalDryness` (iOS 14.0+) | — | `unspecified`, `notPresent`, `mild`, `moderate`, `severe` |

<!-- registry-types:end -->

## Coming from another health plugin

- **Types** are camelCase ids shared by both platforms (`menstrualFlow`, `basalBodyTemperature`),
  not HealthKit identifiers or Health Connect record names; the [table](#supported-types) maps them.
- **Values** are named, not numbers: flow is `unspecified | light | medium | heavy | none`, an
  LH-surge ovulation test is `lhSurge`. Health Connect's `RESULT_HIGH` reads as `estrogenSurge`.
- **Periods** are their own type, `menstruationPeriod`, on both platforms, read with `readSamples`.
- **Dates** are ISO strings with an offset, not epoch milliseconds or `Date` objects.
- **Upserts** use `clientId` / `clientVersion` (HealthKit's sync identifier and version, Health
  Connect's `clientRecordId` and version): migrate your app's own ids to them to avoid duplicates
  when you re-sync data you wrote with another plugin.
- **Android permissions** are no longer declared by the plugin: copy the ones you use into your
  manifest.

## Configuration

<docgen-config>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Configuration for `@caplugins/capacitor-health`, under `plugins.CapacitorHealth`.

| Prop                   | Type                 | Description                                                                                                                                                                                                                                                                                                                                           | Default            | Since |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----- |
| **`privacyPolicyUrl`** | <code>string</code>  | Android only. The page the plugin's default permissions-rationale screen opens. Health Connect links to that screen from its permission dialog ("privacy policy") and won't show the dialog at all when an app has no such screen. Without this setting the screen closes straight away. Apps can replace the screen with their own (see the README). |                    | 0.1.0 |
| **`debugLogging`**     | <code>boolean</code> | Logs what the plugin does natively, **health values included**, to the Xcode console and logcat. For debugging only: keep it off in builds that reach users.                                                                                                                                                                                          | <code>false</code> | 0.1.0 |

### Examples

In `capacitor.config.json`:

```json
{
  "plugins": {
    "CapacitorHealth": {
      "privacyPolicyUrl": "https://example.com/privacy",
      "debugLogging": false
    }
  }
}
```

In `capacitor.config.ts`:

```ts
/// <reference types="@caplugins/capacitor-health" />

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  plugins: {
    CapacitorHealth: {
      privacyPolicyUrl: "https://example.com/privacy",
      debugLogging: false,
    },
  },
};

export default config;
```

</docgen-config>

## API

<docgen-index>

* [`isAvailable()`](#isavailable)
* [`getSupportedTypes()`](#getsupportedtypes)
* [`requestAuthorization(...)`](#requestauthorization)
* [`checkAuthorization(...)`](#checkauthorization)
* [`openHealthSettings()`](#openhealthsettings)
* [`openHealthConnectInstall()`](#openhealthconnectinstall)
* [`readSamples(...)`](#readsamples)
* [`getChanges(...)`](#getchanges)
* [`saveSamples(...)`](#savesamples)
* [`deleteSamples(...)`](#deletesamples)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### isAvailable()

```typescript
isAvailable() => Promise<AvailabilityResult>
```

Checks whether HealthKit (iOS) or Health Connect (Android) can be used on this device.

Call it before anything else. On the web it always resolves `{ available: false, status: 'notSupported' }`.

**Returns:** <code>Promise&lt;<a href="#availabilityresult">AvailabilityResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### getSupportedTypes()

```typescript
getSupportedTypes() => Promise<SupportedTypesResult>
```

Lists every type the plugin knows with whether this device can read and write it.

**Returns:** <code>Promise&lt;<a href="#supportedtypesresult">SupportedTypesResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### requestAuthorization(...)

```typescript
requestAuthorization(options: AuthorizationOptions) => Promise<AuthorizationResult>
```

Shows the platform's permission screen for the given types and reports the result.

Declare what you request first, or the call rejects with `MISSING_DECLARATION`: iOS needs
`NSHealthShareUsageDescription` (read) and `NSHealthUpdateUsageDescription` (write) in
`Info.plist`; Android needs each permission in `AndroidManifest.xml` (see the README).

iOS shows its sheet only for types the user hasn't been asked about; read results are
`unknown` afterwards. Android stops showing its dialog after the user refused twice: when
nothing new was granted, offer `openHealthSettings()`.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#authorizationoptions">AuthorizationOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#authorizationresult">AuthorizationResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### checkAuthorization(...)

```typescript
checkAuthorization(options: CheckAuthorizationOptions) => Promise<AuthorizationResult>
```

Reports access for the given types without showing anything.

| Param         | Type                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#checkauthorizationoptions">CheckAuthorizationOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#authorizationresult">AuthorizationResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### openHealthSettings()

```typescript
openHealthSettings() => Promise<void>
```

Opens Health Connect's settings (Android) or the Health app (iOS, which has no link to an app's
own health permissions; users find them under Profile → Apps).

**Since:** 0.1.0

--------------------


### openHealthConnectInstall()

```typescript
openHealthConnectInstall() => Promise<void>
```

Android 9–13: opens Health Connect in the Play Store, to install or update it. Rejects with
`UNAVAILABLE` on iOS.

**Since:** 0.1.0

--------------------


### readSamples(...)

```typescript
readSamples(options: ReadSamplesOptions) => Promise<ReadSamplesResult>
```

Reads samples of one type, a page at a time.

A read the user denied on iOS returns no samples rather than an error: iOS hides read
permissions. On Android it rejects with `PERMISSION_DENIED`.

| Param         | Type                                                              |
| ------------- | ----------------------------------------------------------------- |
| **`options`** | <code><a href="#readsamplesoptions">ReadSamplesOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#readsamplesresult">ReadSamplesResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### getChanges(...)

```typescript
getChanges(options: GetChangesOptions) => Promise<GetChangesResult>
```

Returns what was added, changed or deleted since `cursor`, for incremental sync.

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#getchangesoptions">GetChangesOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#getchangesresult">GetChangesResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### saveSamples(...)

```typescript
saveSamples(options: SaveSamplesOptions) => Promise<SaveSamplesResult>
```

Writes samples, of one or several types. Samples with a `clientId` are upserted.

| Param         | Type                                                              |
| ------------- | ----------------------------------------------------------------- |
| **`options`** | <code><a href="#savesamplesoptions">SaveSamplesOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#savesamplesresult">SaveSamplesResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### deleteSamples(...)

```typescript
deleteSamples(options: DeleteSamplesOptions) => Promise<DeleteSamplesResult>
```

Deletes samples of one type. Both platforms only let an app delete samples it wrote itself;
others are left alone and not counted. `ids` and `clientIds` that match nothing are skipped.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#deletesamplesoptions">DeleteSamplesOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#deletesamplesresult">DeleteSamplesResult</a>&gt;</code>

**Since:** 0.1.0

--------------------


### Interfaces


#### AvailabilityResult

| Prop            | Type                                                              | Description                               | Since |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------- | ----- |
| **`available`** | <code>boolean</code>                                              | `true` only when `status` is `available`. | 0.1.0 |
| **`status`**    | <code><a href="#availabilitystatus">AvailabilityStatus</a></code> | Why health data is or isn't available.    | 0.1.0 |


#### SupportedTypesResult

| Prop          | Type                                                    | Description                                                                                                                                  | Since |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`types`**   | <code>TypeSupport[]</code>                              | Every type the plugin knows, in registry order, with its support on this device.                                                             | 0.1.0 |
| **`android`** | <code>{ history: boolean; background: boolean; }</code> | Android only: whether this device's Health Connect supports the optional `history` and `background` permissions of `requestAuthorization()`. | 0.1.0 |


#### TypeSupport

| Prop               | Type                                                            | Description                                                                                                           | Since |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**         | <code><a href="#healthtype">HealthType</a></code>               |                                                                                                                       | 0.1.0 |
| **`supported`**    | <code>boolean</code>                                            | The type exists on this device. When `false`, every call with it rejects with `UNSUPPORTED_TYPE`.                     | 0.1.0 |
| **`readable`**     | <code>boolean</code>                                            |                                                                                                                       | 0.1.0 |
| **`writable`**     | <code>boolean</code>                                            |                                                                                                                       | 0.1.0 |
| **`aggregatable`** | <code>boolean</code>                                            | Whether `aggregate()` works for the type. `aggregate()` arrives in 0.2.0, so this is `false` for every type in 0.1.0. | 0.1.0 |
| **`reason`**       | <code><a href="#unsupportedreason">UnsupportedReason</a></code> | Set when `supported` or `writable` is `false`.                                                                        | 0.1.0 |
| **`minOS`**        | <code>string</code>                                             | iOS: the first iOS version with the type.                                                                             | 0.1.0 |
| **`values`**       | <code>string[]</code>                                           | Values this platform can store, for types with a value set (category types).                                          | 0.1.0 |
| **`units`**        | <code>string[]</code>                                           | Units `readSamples()` and `saveSamples()` accept, canonical unit first (quantity types).                              | 0.1.0 |


#### AuthorizationResult

| Prop                          | Type                                                                                                                                | Description                                                                                                                                                                                                  | Since |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`read`**                    | <code><a href="#authorizationstatusmap">AuthorizationStatusMap</a></code>                                                           | Read access per type passed in `read`. On iOS this is `notDetermined` or `unknown`, never `granted` (see <a href="#authorizationstatus">`AuthorizationStatus`</a>).                                          | 0.1.0 |
| **`write`**                   | <code><a href="#authorizationstatusmap">AuthorizationStatusMap</a></code>                                                           | Write access per type passed in `write`.                                                                                                                                                                     | 0.1.0 |
| **`earliestAuthorizedDates`** | <code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#healthtype">HealthType</a>, string&gt;&gt;</code> | iOS 27+: types the user shared only recent history of, with the date that history starts. Data before that date is hidden from the app, not absent. Types with full access (or denied access) aren't listed. | 0.1.0 |
| **`historyGranted`**          | <code>boolean</code>                                                                                                                | Android only: `READ_HEALTH_DATA_HISTORY` is granted.                                                                                                                                                         | 0.1.0 |
| **`backgroundGranted`**       | <code>boolean</code>                                                                                                                | Android only: `READ_HEALTH_DATA_IN_BACKGROUND` is granted.                                                                                                                                                   | 0.1.0 |


#### AuthorizationOptions

| Prop          | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Description                                                                                                                                                                        | Since |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`read`**    | <code>('menstrualFlow' \| 'menstruationPeriod' \| 'intermenstrualBleeding' \| 'cervicalMucus' \| 'ovulationTest' \| 'sexualActivity' \| 'basalBodyTemperature' \| 'wristTemperature' \| 'skinTemperature' \| 'pregnancyTest' \| 'progesteroneTest' \| 'contraceptive' \| 'pregnancy' \| 'lactation' \| 'bleedingDuringPregnancy' \| 'bleedingAfterPregnancy' \| 'bleedingAfterMenopause' \| 'menopausalState' \| 'infrequentMenstrualCycles' \| 'irregularMenstrualCycles' \| 'persistentIntermenstrualBleeding' \| 'prolongedMenstrualPeriods' \| 'abdominalCramps' \| 'acne' \| 'appetiteChanges' \| 'bladderIncontinence' \| 'bloating' \| 'breastPain' \| 'chills' \| 'constipation' \| 'diarrhea' \| 'drySkin' \| 'fatigue' \| 'hairLoss' \| 'headache' \| 'hotFlashes' \| 'lowerBackPain' \| 'memoryLapse' \| 'moodChanges' \| 'nausea' \| 'nightSweats' \| 'pelvicPain' \| 'sleepChanges' \| 'vaginalDryness')[]</code> | Types to read.                                                                                                                                                                     | 0.1.0 |
| **`write`**   | <code>('menstrualFlow' \| 'menstruationPeriod' \| 'intermenstrualBleeding' \| 'cervicalMucus' \| 'ovulationTest' \| 'sexualActivity' \| 'basalBodyTemperature' \| 'wristTemperature' \| 'skinTemperature' \| 'pregnancyTest' \| 'progesteroneTest' \| 'contraceptive' \| 'pregnancy' \| 'lactation' \| 'bleedingDuringPregnancy' \| 'bleedingAfterPregnancy' \| 'bleedingAfterMenopause' \| 'menopausalState' \| 'infrequentMenstrualCycles' \| 'irregularMenstrualCycles' \| 'persistentIntermenstrualBleeding' \| 'prolongedMenstrualPeriods' \| 'abdominalCramps' \| 'acne' \| 'appetiteChanges' \| 'bladderIncontinence' \| 'bloating' \| 'breastPain' \| 'chills' \| 'constipation' \| 'diarrhea' \| 'drySkin' \| 'fatigue' \| 'hairLoss' \| 'headache' \| 'hotFlashes' \| 'lowerBackPain' \| 'memoryLapse' \| 'moodChanges' \| 'nausea' \| 'nightSweats' \| 'pelvicPain' \| 'sleepChanges' \| 'vaginalDryness')[]</code> | Types to write. Read-only types reject with `READ_ONLY_TYPE`.                                                                                                                      | 0.1.0 |
| **`android`** | <code><a href="#androidauthorizationoptions">AndroidAuthorizationOptions</a></code>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Android only. Extra Health Connect permissions, requested only when set and supported by the device (see `getSupportedTypes().android`). The app's manifest must declare them too. | 0.1.0 |


#### AndroidAuthorizationOptions

| Prop             | Type                 | Description                                                                                                                                                    | Since |
| ---------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`history`**    | <code>boolean</code> | Also request `READ_HEALTH_DATA_HISTORY`: without it, apps can only read data from the 30 days before they were first granted access.                           | 0.1.0 |
| **`background`** | <code>boolean</code> | Also request `READ_HEALTH_DATA_IN_BACKGROUND`. The plugin doesn't read in the background itself yet; this is for apps that schedule their own background work. | 0.1.0 |


#### CheckAuthorizationOptions

| Prop        | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Since |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`read`**  | <code>('menstrualFlow' \| 'menstruationPeriod' \| 'intermenstrualBleeding' \| 'cervicalMucus' \| 'ovulationTest' \| 'sexualActivity' \| 'basalBodyTemperature' \| 'wristTemperature' \| 'skinTemperature' \| 'pregnancyTest' \| 'progesteroneTest' \| 'contraceptive' \| 'pregnancy' \| 'lactation' \| 'bleedingDuringPregnancy' \| 'bleedingAfterPregnancy' \| 'bleedingAfterMenopause' \| 'menopausalState' \| 'infrequentMenstrualCycles' \| 'irregularMenstrualCycles' \| 'persistentIntermenstrualBleeding' \| 'prolongedMenstrualPeriods' \| 'abdominalCramps' \| 'acne' \| 'appetiteChanges' \| 'bladderIncontinence' \| 'bloating' \| 'breastPain' \| 'chills' \| 'constipation' \| 'diarrhea' \| 'drySkin' \| 'fatigue' \| 'hairLoss' \| 'headache' \| 'hotFlashes' \| 'lowerBackPain' \| 'memoryLapse' \| 'moodChanges' \| 'nausea' \| 'nightSweats' \| 'pelvicPain' \| 'sleepChanges' \| 'vaginalDryness')[]</code> | 0.1.0 |
| **`write`** | <code>('menstrualFlow' \| 'menstruationPeriod' \| 'intermenstrualBleeding' \| 'cervicalMucus' \| 'ovulationTest' \| 'sexualActivity' \| 'basalBodyTemperature' \| 'wristTemperature' \| 'skinTemperature' \| 'pregnancyTest' \| 'progesteroneTest' \| 'contraceptive' \| 'pregnancy' \| 'lactation' \| 'bleedingDuringPregnancy' \| 'bleedingAfterPregnancy' \| 'bleedingAfterMenopause' \| 'menopausalState' \| 'infrequentMenstrualCycles' \| 'irregularMenstrualCycles' \| 'persistentIntermenstrualBleeding' \| 'prolongedMenstrualPeriods' \| 'abdominalCramps' \| 'acne' \| 'appetiteChanges' \| 'bladderIncontinence' \| 'bloating' \| 'breastPain' \| 'chills' \| 'constipation' \| 'diarrhea' \| 'drySkin' \| 'fatigue' \| 'hairLoss' \| 'headache' \| 'hotFlashes' \| 'lowerBackPain' \| 'memoryLapse' \| 'moodChanges' \| 'nausea' \| 'nightSweats' \| 'pelvicPain' \| 'sleepChanges' \| 'vaginalDryness')[]</code> | 0.1.0 |


#### ReadSamplesResult

| Prop             | Type                  | Description                                                                   | Since |
| ---------------- | --------------------- | ----------------------------------------------------------------------------- | ----- |
| **`samples`**    | <code>Sample[]</code> |                                                                               | 0.1.0 |
| **`nextCursor`** | <code>string</code>   | Set when there may be more samples: pass it as `cursor` to get the next page. | 0.1.0 |


#### QuantitySample

A number with a unit (`basalBodyTemperature`, …).

| Prop                      | Type                                                              | Description                                                                        | Since |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| **`kind`**                | <code>'quantity'</code>                                           |                                                                                    | 0.1.0 |
| **`type`**                | <code><a href="#quantityhealthtype">QuantityHealthType</a></code> |                                                                                    | 0.1.0 |
| **`value`**               | <code>number</code>                                               |                                                                                    | 0.1.0 |
| **`unit`**                | <code>string</code>                                               | The type's canonical unit, or the `unit` asked for in `readSamples()`.             | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                                               | `basalBodyTemperature`: where the temperature was taken. Absent when not recorded. | 0.1.0 |


#### CategorySample

One value from the type's value set (`menstrualFlow`, `ovulationTest`, symptoms, …).

| Prop               | Type                                                              | Description                                                                                                                                                                                                                                                   | Since |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`kind`**         | <code>'category'</code>                                           |                                                                                                                                                                                                                                                               | 0.1.0 |
| **`type`**         | <code><a href="#categoryhealthtype">CategoryHealthType</a></code> |                                                                                                                                                                                                                                                               | 0.1.0 |
| **`value`**        | <code>string</code>                                               | The unified value, e.g. `medium` for `menstrualFlow`. `getSupportedTypes()` lists each type's values.                                                                                                                                                         | 0.1.0 |
| **`isCycleStart`** | <code>boolean</code>                                              | `menstrualFlow`: the sample starts a period. iOS: the writer's flag (Apple Health itself writes `false` even on day 1). Android: `true` when a period from the same app starts on this day, `false` when one covers it but started earlier, absent otherwise. | 0.1.0 |
| **`sensation`**    | <code>string</code>                                               | `cervicalMucus`, Android only: `light \| medium \| heavy`. Absent when not recorded.                                                                                                                                                                          | 0.1.0 |


#### EventSample

Something that happened, with no value (`intermenstrualBleeding`, `sexualActivity`, `pregnancy`, …).

| Prop                 | Type                                                        | Description                                                              | Since |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| **`kind`**           | <code>'event'</code>                                        |                                                                          | 0.1.0 |
| **`type`**           | <code><a href="#eventhealthtype">EventHealthType</a></code> |                                                                          | 0.1.0 |
| **`protectionUsed`** | <code>boolean</code>                                        | `sexualActivity`: whether protection was used. Absent when not recorded. | 0.1.0 |


#### MenstruationPeriodSample

A menstruation period. Android stores periods as records. iOS has no period object: the plugin
derives periods from `menstrualFlow` samples (rules in the README).

| Prop                | Type                              | Description                                                           | Since |
| ------------------- | --------------------------------- | --------------------------------------------------------------------- | ----- |
| **`kind`**          | <code>'special'</code>            |                                                                       | 0.1.0 |
| **`type`**          | <code>'menstruationPeriod'</code> |                                                                       | 0.1.0 |
| **`firstDay`**      | <code>string</code>               | First day of the period, as a local date (`2026-10-01`).              | 0.1.0 |
| **`lastDay`**       | <code>string</code>               | Last day of the period, inclusive.                                    | 0.1.0 |
| **`derived`**       | <code>boolean</code>              | `true` when the plugin worked the period out from flow samples (iOS). | 0.1.0 |
| **`flowSampleIds`** | <code>string[]</code>             | iOS: the ids of the flow samples the period was derived from.         | 0.1.0 |


#### SkinTemperatureSample

Android only: skin temperature as a baseline plus timed deltas (`SkinTemperatureRecord`).

| Prop                      | Type                                | Since |
| ------------------------- | ----------------------------------- | ----- |
| **`kind`**                | <code>'special'</code>              | 0.1.0 |
| **`type`**                | <code>'skinTemperature'</code>      | 0.1.0 |
| **`unit`**                | <code>string</code>                 | 0.1.0 |
| **`baseline`**            | <code>number</code>                 | 0.1.0 |
| **`deltas`**              | <code>SkinTemperatureDelta[]</code> | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                 | 0.1.0 |


#### SkinTemperatureDelta

One change from the baseline in a `skinTemperature` sample.

| Prop        | Type                | Description                                         | Since |
| ----------- | ------------------- | --------------------------------------------------- | ----- |
| **`time`**  | <code>string</code> |                                                     | 0.1.0 |
| **`delta`** | <code>number</code> | Difference from the baseline, in the sample's unit. | 0.1.0 |


#### ReadSamplesOptions

| Prop            | Type                                              | Description                                                                  | Default           | Since |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- | ----- |
| **`type`**      | <code><a href="#healthtype">HealthType</a></code> |                                                                              |                   | 0.1.0 |
| **`startDate`** | <code>string</code>                               | Returns samples that overlap `startDate`–`endDate`. ISO 8601 with an offset. |                   | 0.1.0 |
| **`endDate`**   | <code>string</code>                               |                                                                              |                   | 0.1.0 |
| **`limit`**     | <code>number</code>                               | Page size. Default 1,000, maximum 10,000.                                    | <code>1000</code> | 0.1.0 |
| **`ascending`** | <code>boolean</code>                              | Oldest first.                                                                | <code>true</code> | 0.1.0 |
| **`cursor`**    | <code>string</code>                               | `nextCursor` from the previous page. Pass the same other options with it.    |                   | 0.1.0 |
| **`unit`**      | <code>string</code>                               | Unit for quantity values; one of the type's units.                           |                   | 0.1.0 |
| **`sourceIds`** | <code>string[]</code>                             | Only samples written by these apps (bundle ids / package names).             |                   | 0.1.0 |


#### GetChangesResult

| Prop             | Type                         | Description                                                                                                                           | Since |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`upserted`**   | <code>Sample[]</code>        | Samples added or changed since the cursor, in their current state. iOS reports an edit as a deletion plus a new sample with a new id. | 0.1.0 |
| **`deleted`**    | <code>DeletedSample[]</code> |                                                                                                                                       | 0.1.0 |
| **`nextCursor`** | <code>string</code>          | Store it and pass it to the next call.                                                                                                | 0.1.0 |
| **`hasMore`**    | <code>boolean</code>         | More changes are waiting: call again with `nextCursor` straight away.                                                                 | 0.1.0 |


#### DeletedSample

A deleted sample.

| Prop           | Type                                              | Description                                               | Since |
| -------------- | ------------------------------------------------- | --------------------------------------------------------- | ----- |
| **`type`**     | <code><a href="#healthtype">HealthType</a></code> |                                                           | 0.1.0 |
| **`id`**       | <code>string</code>                               |                                                           | 0.1.0 |
| **`clientId`** | <code>string</code>                               | iOS only: the deleted sample's `clientId`, if it had one. | 0.1.0 |


#### GetChangesOptions

| Prop                   | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Description                                                                                                                                                                               | Default            | Since |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----- |
| **`types`**            | <code>('menstrualFlow' \| 'menstruationPeriod' \| 'intermenstrualBleeding' \| 'cervicalMucus' \| 'ovulationTest' \| 'sexualActivity' \| 'basalBodyTemperature' \| 'wristTemperature' \| 'skinTemperature' \| 'pregnancyTest' \| 'progesteroneTest' \| 'contraceptive' \| 'pregnancy' \| 'lactation' \| 'bleedingDuringPregnancy' \| 'bleedingAfterPregnancy' \| 'bleedingAfterMenopause' \| 'menopausalState' \| 'infrequentMenstrualCycles' \| 'irregularMenstrualCycles' \| 'persistentIntermenstrualBleeding' \| 'prolongedMenstrualPeriods' \| 'abdominalCramps' \| 'acne' \| 'appetiteChanges' \| 'bladderIncontinence' \| 'bloating' \| 'breastPain' \| 'chills' \| 'constipation' \| 'diarrhea' \| 'drySkin' \| 'fatigue' \| 'hairLoss' \| 'headache' \| 'hotFlashes' \| 'lowerBackPain' \| 'memoryLapse' \| 'moodChanges' \| 'nausea' \| 'nightSweats' \| 'pelvicPain' \| 'sleepChanges' \| 'vaginalDryness')[]</code> | The types to follow. A cursor only works with the types it was created for.                                                                                                               |                    | 0.1.0 |
| **`cursor`**           | <code>string</code>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `nextCursor` from the previous call. Without it, the call returns no changes, only a cursor marking "now": read existing data with `readSamples()` first, then follow changes from there. |                    | 0.1.0 |
| **`limit`**            | <code>number</code>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | iOS: most changes to return per type and call (default 1,000). Health Connect sets its own page size.                                                                                     | <code>1000</code>  | 0.1.0 |
| **`excludeOwnWrites`** | <code>boolean</code>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Leave out upserts this app wrote. Deletions are always reported: the platforms don't say who deleted.                                                                                     | <code>false</code> | 0.1.0 |


#### SaveSamplesResult

| Prop      | Type                  | Description                                                                                                                                                                 | Since |
| --------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`ids`** | <code>string[]</code> | The stored ids, in the order of `samples`. For a period written on iOS, the id of its first day's flow sample, which is also the id `readSamples()` reports for the period. | 0.1.0 |


#### SaveSamplesOptions

| Prop          | Type                     | Since |
| ------------- | ------------------------ | ----- |
| **`samples`** | <code>NewSample[]</code> | 0.1.0 |


#### NewQuantitySample

| Prop                      | Type                                                              | Description                                              | Since |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| **`type`**                | <code><a href="#quantityhealthtype">QuantityHealthType</a></code> |                                                          | 0.1.0 |
| **`value`**               | <code>number</code>                                               |                                                          | 0.1.0 |
| **`unit`**                | <code>string</code>                                               | One of the type's units. Defaults to its canonical unit. | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                                               |                                                          | 0.1.0 |


#### NewCategorySample

| Prop               | Type                                                              | Description                                                                                                                                                                                                                                                      | Since |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**         | <code><a href="#categoryhealthtype">CategoryHealthType</a></code> |                                                                                                                                                                                                                                                                  | 0.1.0 |
| **`value`**        | <code>string</code>                                               | One of the type's values that this platform can store (`getSupportedTypes()`). Others reject with `INVALID_ARGUMENT` and `data.reason = 'valueUnsupportedOnPlatform'`.                                                                                           | 0.1.0 |
| **`isCycleStart`** | <code>boolean</code>                                              | `menstrualFlow`, iOS: stored as `HKMetadataKeyMenstrualCycleStart`, which HealthKit requires on every flow sample, so it defaults to `false`. Android has no such flag: write a `menstruationPeriod` instead (setting it there rejects with `INVALID_ARGUMENT`). | 0.1.0 |
| **`sensation`**    | <code>string</code>                                               | `cervicalMucus`, Android only.                                                                                                                                                                                                                                   | 0.1.0 |


#### NewEventSample

| Prop                 | Type                                                        | Since |
| -------------------- | ----------------------------------------------------------- | ----- |
| **`type`**           | <code><a href="#eventhealthtype">EventHealthType</a></code> | 0.1.0 |
| **`protectionUsed`** | <code>boolean</code>                                        | 0.1.0 |


#### NewMenstruationPeriod

A period to write. Only the local dates of `startDate` and `endDate` matter: the period covers
every day from the first to the last, inclusive.

iOS writes one `menstrualFlow` sample per day (at local noon, first day flagged as cycle start,
`clientId` `&lt;clientId&gt;:&lt;yyyy-mm-dd&gt;`), so writing the same period again updates it and a shorter
period deletes the dropped days. Android writes one `MenstruationPeriodRecord` (at most 31 days)
plus a flow record per day listed in `flow`.

| Prop          | Type                                    | Description                                                                          | Since |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| **`type`**    | <code>'menstruationPeriod'</code>       |                                                                                      | 0.1.0 |
| **`endDate`** | <code>string</code>                     | The last day, inclusive. Required.                                                   | 0.1.0 |
| **`flow`**    | <code>{ [day: string]: string; }</code> | Flow per day (`2026-10-01` → `heavy`). iOS writes `unspecified` for days not listed. | 0.1.0 |


#### NewSkinTemperatureSample

Android only.

| Prop                      | Type                                | Description                                            | Since |
| ------------------------- | ----------------------------------- | ------------------------------------------------------ | ----- |
| **`type`**                | <code>'skinTemperature'</code>      |                                                        | 0.1.0 |
| **`endDate`**             | <code>string</code>                 | Defaults to `startDate`. Must not be before it.        | 0.1.0 |
| **`unit`**                | <code>string</code>                 | Unit of `baseline` and the deltas. Defaults to `degC`. | 0.1.0 |
| **`baseline`**            | <code>number</code>                 |                                                        | 0.1.0 |
| **`deltas`**              | <code>SkinTemperatureDelta[]</code> | Times must fall between `startDate` and `endDate`.     | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                 |                                                        | 0.1.0 |


#### DeleteSamplesResult

| Prop          | Type                | Since |
| ------------- | ------------------- | ----- |
| **`deleted`** | <code>number</code> | 0.1.0 |


#### DeleteSamplesOptions

Pass exactly one of `ids`, `clientIds`, or `startDate` + `endDate`.

| Prop            | Type                                              | Description                                                    | Since |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------- | ----- |
| **`type`**      | <code><a href="#healthtype">HealthType</a></code> |                                                                | 0.1.0 |
| **`ids`**       | <code>string[]</code>                             |                                                                | 0.1.0 |
| **`clientIds`** | <code>string[]</code>                             |                                                                | 0.1.0 |
| **`startDate`** | <code>string</code>                               | Deletes this app's samples that overlap `startDate`–`endDate`. | 0.1.0 |
| **`endDate`**   | <code>string</code>                               |                                                                | 0.1.0 |


### Type Aliases


#### AvailabilityStatus

Whether health data can be used on this device.

- `available`: HealthKit / Health Connect is ready to use.
- `notSupported`: the device can't use health data (web, iPads before iPadOS 17, Android below 9 /
  API 28, or Health Connect unavailable for this user, e.g. in a work profile).
- `notInstalled`: Android 9–13 only. The Health Connect app isn't installed.
- `updateRequired`: Android only. Health Connect is installed but too old for this plugin.

<code>'available' | 'notSupported' | 'notInstalled' | 'updateRequired'</code>


#### HealthType

A unified health data type. Which platforms support it, and how, is in {@link REGISTRY}.

<code>(typeof HEALTH_TYPES)[number]</code>


#### UnsupportedReason

Why a type can't be read or written here.

- `notOnPlatform`: this platform has no such type.
- `osVersion`: iOS, the type needs a newer iOS (see `minOS`).
- `featureUnavailable`: Android, this device's Health Connect doesn't have the feature the type needs.
- `readOnly`: the type can be read but the platform doesn't let apps write it.

<code>'notOnPlatform' | 'osVersion' | 'featureUnavailable' | 'readOnly'</code>


#### AuthorizationStatusMap

Status per type, for the types passed in.

<code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#healthtype">HealthType</a>, <a href="#authorizationstatus">AuthorizationStatus</a>&gt;&gt;</code>


#### Partial

Make all properties in T optional

<code>{
 [P in keyof T]?: T[P];
 }</code>


#### Record

Construct a type with a set of properties K of type T

<code>{
 [P in K]: T;
 }</code>


#### AuthorizationStatus

Access to one type.

- `granted`: the platform confirms access.
- `notGranted`: the platform confirms there's no access. On Android this covers "never asked" and
  "refused" alike: Health Connect doesn't say which.
- `notDetermined`: iOS only. The app hasn't asked yet, so `requestAuthorization()` will show the sheet.
- `unknown`: iOS read access after the app has asked. **iOS never tells apps whether read access
  was granted**; a denied read simply returns no data.
- `unsupported`: the type doesn't exist on this device (see `getSupportedTypes()`); nothing was requested.

<code>'granted' | 'notGranted' | 'notDetermined' | 'unknown' | 'unsupported'</code>


#### Sample

Any sample `readSamples()` or `getChanges()` returns. Narrow it with `kind` or `type`.

<code><a href="#quantitysample">QuantitySample</a> | <a href="#categorysample">CategorySample</a> | <a href="#eventsample">EventSample</a> | <a href="#menstruationperiodsample">MenstruationPeriodSample</a> | <a href="#skintemperaturesample">SkinTemperatureSample</a></code>


#### QuantityHealthType

Types whose samples are a number with a unit.

<code>'basalBodyTemperature' | 'wristTemperature'</code>


#### CategoryHealthType

Types whose samples hold one value from a fixed set (flow level, test result, severity…).

<code>'menstrualFlow' | 'cervicalMucus' | 'ovulationTest' | 'pregnancyTest' | 'progesteroneTest' | 'contraceptive' | 'bleedingDuringPregnancy' | 'bleedingAfterPregnancy' | 'bleedingAfterMenopause' | 'menopausalState' | 'abdominalCramps' | 'acne' | 'appetiteChanges' | 'bladderIncontinence' | 'bloating' | 'breastPain' | 'chills' | 'constipation' | 'diarrhea' | 'drySkin' | 'fatigue' | 'hairLoss' | 'headache' | 'hotFlashes' | 'lowerBackPain' | 'memoryLapse' | 'moodChanges' | 'nausea' | 'nightSweats' | 'pelvicPain' | 'sleepChanges' | 'vaginalDryness'</code>


#### EventHealthType

Types whose samples have no value, only a time range (the event happened).

<code>'intermenstrualBleeding' | 'sexualActivity' | 'pregnancy' | 'lactation' | 'infrequentMenstrualCycles' | 'irregularMenstrualCycles' | 'persistentIntermenstrualBleeding' | 'prolongedMenstrualPeriods'</code>


#### NewSample

Any sample `saveSamples()` accepts.

<code><a href="#newquantitysample">NewQuantitySample</a> | <a href="#newcategorysample">NewCategorySample</a> | <a href="#neweventsample">NewEventSample</a> | <a href="#newmenstruationperiod">NewMenstruationPeriod</a> | <a href="#newskintemperaturesample">NewSkinTemperatureSample</a></code>

</docgen-api>

## License

MIT
