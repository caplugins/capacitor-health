# @caplugins/capacitor-health

Capacitor plugin for **Apple HealthKit** and **Google Health Connect**: one API to read and write
every health data type both platforms offer, from steps and heart rate to sleep, workouts,
nutrition and **reproductive health** (menstrual flow, periods, ovulation tests, cervical mucus,
basal body temperature and more).

> **Status: in design.** Nothing is published yet. The plan is in [docs/](docs/README.md).
> This README will be replaced by the generated API docs (`@capacitor/docgen`) once code lands.

Not to be confused with the unscoped `capacitor-health` package on npm, which is a different
project.

## Why another health plugin?

Existing Capacitor health plugins cover a fixed set of fitness types and leave out reproductive
health entirely, so apps that need cycle data end up writing native code or running two plugins.
This one aims for complete coverage on both platforms behind one type vocabulary, with
idempotent writes and incremental change queries for apps that sync.

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
others are left alone and not counted.

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

<code>{ [P in keyof T]?: T[P]; }</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>


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
