# API reference

Generated from the JSDoc in [`src/definitions.ts`](../src/definitions.ts). The guides explain how
the methods behave together: start with [Getting started](getting-started.md).

```ts
import { CapacitorHealth } from '@caplugins/capacitor-health';
```

## Configuration

<docgen-config>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Configuration for `@caplugins/capacitor-health`, under `plugins.CapacitorHealth`.

| Prop                   | Type                 | Description                                                                                                                                                                                                                                                                                                                                                      | Default            | Since |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----- |
| **`privacyPolicyUrl`** | <code>string</code>  | Android only. The page the plugin's default permissions-rationale screen opens. Health Connect links to that screen from its permission dialog ("privacy policy") and won't show the dialog at all when an app has no such screen. Without this setting the screen closes straight away. Apps can replace the screen with their own (see docs/setup-android.md). |                    | 0.1.0 |
| **`debugLogging`**     | <code>boolean</code> | Logs what the plugin does natively, **health values included**, to the Xcode console and logcat. For debugging only: keep it off in builds that reach users.                                                                                                                                                                                                     | <code>false</code> | 0.1.0 |

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

## Methods

<docgen-index>

* [`isAvailable()`](#isavailable)
* [`getSupportedTypes()`](#getsupportedtypes)
* [`requestAuthorization(...)`](#requestauthorization)
* [`checkAuthorization(...)`](#checkauthorization)
* [`openHealthSettings()`](#openhealthsettings)
* [`openHealthConnectInstall()`](#openhealthconnectinstall)
* [`readSamples(...)`](#readsamples)
* [`aggregate(...)`](#aggregate)
* [`getChanges(...)`](#getchanges)
* [`saveSamples(...)`](#savesamples)
* [`deleteSamples(...)`](#deletesamples)
* [`readWorkoutRoute(...)`](#readworkoutroute)
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
`Info.plist`; Android needs each permission in `AndroidManifest.xml` (see docs/setup-ios.md and docs/setup-android.md).

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


### aggregate(...)

```typescript
aggregate(options: AggregateOptions) => Promise<AggregateResult>
```

Sums, averages, minimums and maximums of a quantity type over a range, optionally in buckets.
Use it rather than adding up `readSamples()` values: phone and watch often record the same
steps, and HealthKit removes that overlap when it aggregates. Health Connect removes it only for
activity types (steps, distance, energy, floors…), using the user's app priority; for other types
its aggregates cover every app's data.

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#aggregateoptions">AggregateOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#aggregateresult">AggregateResult</a>&gt;</code>

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


### readWorkoutRoute(...)

```typescript
readWorkoutRoute(options: ReadWorkoutRouteOptions) => Promise<ReadWorkoutRouteResult>
```

Reads a workout's route (<a href="#workoutsample">`WorkoutSample.hasRoute`</a>). A workout this app can't read rejects with
`INVALID_ARGUMENT` (reason `workoutNotFound`). On Android, another app's route needs
`READ_EXERCISE_ROUTES` or the user's consent for this workout (`android.requestConsent`); a
refusal rejects with `PERMISSION_DENIED` (reason `routeConsentDenied`).

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#readworkoutrouteoptions">ReadWorkoutRouteOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#readworkoutrouteresult">ReadWorkoutRouteResult</a>&gt;</code>

**Since:** 0.2.0

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

| Prop               | Type                                                            | Description                                                                                       | Since |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| **`type`**         | <code><a href="#healthtype">HealthType</a></code>               |                                                                                                   | 0.1.0 |
| **`supported`**    | <code>boolean</code>                                            | The type exists on this device. When `false`, every call with it rejects with `UNSUPPORTED_TYPE`. | 0.1.0 |
| **`readable`**     | <code>boolean</code>                                            |                                                                                                   | 0.1.0 |
| **`writable`**     | <code>boolean</code>                                            |                                                                                                   | 0.1.0 |
| **`aggregatable`** | <code>boolean</code>                                            | Whether `aggregate()` works for the type on this device.                                          | 0.1.0 |
| **`metrics`**      | <code>AggregateMetric[]</code>                                  | The metrics `aggregate()` computes for the type here. Set when `aggregatable` is `true`.          | 0.1.0 |
| **`reason`**       | <code><a href="#unsupportedreason">UnsupportedReason</a></code> | Set when `supported`, `readable` or `writable` is `false`.                                        | 0.1.0 |
| **`minOS`**        | <code>string</code>                                             | iOS: the first iOS version with the type.                                                         | 0.1.0 |
| **`values`**       | <code>string[]</code>                                           | Values this platform can store, for types with a value set (category types).                      | 0.1.0 |
| **`units`**        | <code>string[]</code>                                           | Units `readSamples()` and `saveSamples()` accept, canonical unit first (quantity types).          | 0.1.0 |


#### AuthorizationResult

| Prop                          | Type                                                                                                                                | Description                                                                                                                                                                                                  | Since |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`read`**                    | <code><a href="#authorizationstatusmap">AuthorizationStatusMap</a></code>                                                           | Read access per type passed in `read`. On iOS this is `notDetermined` or `unknown`, never `granted` (see <a href="#authorizationstatus">`AuthorizationStatus`</a>).                                          | 0.1.0 |
| **`write`**                   | <code><a href="#authorizationstatusmap">AuthorizationStatusMap</a></code>                                                           | Write access per type passed in `write`.                                                                                                                                                                     | 0.1.0 |
| **`earliestAuthorizedDates`** | <code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#healthtype">HealthType</a>, string&gt;&gt;</code> | iOS 27+: types the user shared only recent history of, with the date that history starts. Data before that date is hidden from the app, not absent. Types with full access (or denied access) aren't listed. | 0.1.0 |
| **`historyGranted`**          | <code>boolean</code>                                                                                                                | Android only: `READ_HEALTH_DATA_HISTORY` is granted.                                                                                                                                                         | 0.1.0 |
| **`backgroundGranted`**       | <code>boolean</code>                                                                                                                | Android only: `READ_HEALTH_DATA_IN_BACKGROUND` is granted.                                                                                                                                                   | 0.1.0 |
| **`exerciseRoutesGranted`**   | <code>{ read: boolean; write: boolean; }</code>                                                                                     | Android only: whether `READ_EXERCISE_ROUTES` and `WRITE_EXERCISE_ROUTE` are granted.                                                                                                                         | 0.2.0 |


#### AuthorizationOptions

| Prop          | Type                                                                                | Description                                                                                                                                                                        | Since |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`read`**    | <code>HealthTypeOrPassthrough[]</code>                                              | Types to read.                                                                                                                                                                     | 0.1.0 |
| **`write`**   | <code>HealthTypeOrPassthrough[]</code>                                              | Types to write. Read-only types reject with `READ_ONLY_TYPE`.                                                                                                                      | 0.1.0 |
| **`android`** | <code><a href="#androidauthorizationoptions">AndroidAuthorizationOptions</a></code> | Android only. Extra Health Connect permissions, requested only when set and supported by the device (see `getSupportedTypes().android`). The app's manifest must declare them too. | 0.1.0 |


#### AndroidAuthorizationOptions

| Prop                 | Type                 | Description                                                                                                                                                                                                                                                                                                                                                                     | Since |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`history`**        | <code>boolean</code> | Also request `READ_HEALTH_DATA_HISTORY`: without it, apps can only read data from the 30 days before they were first granted access.                                                                                                                                                                                                                                            | 0.1.0 |
| **`background`**     | <code>boolean</code> | Also request `READ_HEALTH_DATA_IN_BACKGROUND`. The plugin doesn't read in the background itself yet; this is for apps that schedule their own background work.                                                                                                                                                                                                                  | 0.1.0 |
| **`exerciseRoutes`** | <code>boolean</code> | Also request access to exercise routes: `READ_EXERCISE_ROUTES` when `read` lists `workout`, `WRITE_EXERCISE_ROUTE` when `write` does. Declare the ones you request in the manifest. Without `READ_EXERCISE_ROUTES`, reading another app's route needs the user's consent per workout (`readWorkoutRoute`'s `android.requestConsent`). On iOS routes always come with `workout`. | 0.2.0 |


#### CheckAuthorizationOptions

| Prop        | Type                                   | Since |
| ----------- | -------------------------------------- | ----- |
| **`read`**  | <code>HealthTypeOrPassthrough[]</code> | 0.1.0 |
| **`write`** | <code>HealthTypeOrPassthrough[]</code> | 0.1.0 |


#### ReadSamplesResult

| Prop             | Type                  | Description                                                                   | Since |
| ---------------- | --------------------- | ----------------------------------------------------------------------------- | ----- |
| **`samples`**    | <code>Sample[]</code> |                                                                               | 0.1.0 |
| **`nextCursor`** | <code>string</code>   | Set when there may be more samples: pass it as `cursor` to get the next page. | 0.1.0 |


#### PassthroughSample

A sample of a passthrough type (`hk:…`), with its native value.

| Prop        | Type                                                        | Description                                                                                                                     | Since |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`kind`**  | <code>'quantity' \| 'category'</code>                       |                                                                                                                                 | 0.1.0 |
| **`type`**  | <code><a href="#passthroughtype">PassthroughType</a></code> |                                                                                                                                 | 0.1.0 |
| **`value`** | <code>number</code>                                         | A quantity in `unit`, or a category's raw HealthKit value.                                                                      | 0.1.0 |
| **`unit`**  | <code>string</code>                                         | Quantities: the unit asked for in `readSamples()`, else the first unit of the plugin's unit table that fits the HealthKit type. | 0.1.0 |


#### QuantitySample

A number with a unit (`basalBodyTemperature`, …).

| Prop                      | Type                                                              | Description                                                                                                  | Since |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| **`kind`**                | <code>'quantity'</code>                                           |                                                                                                              | 0.1.0 |
| **`type`**                | <code><a href="#quantityhealthtype">QuantityHealthType</a></code> |                                                                                                              | 0.1.0 |
| **`value`**               | <code>number</code>                                               |                                                                                                              | 0.1.0 |
| **`unit`**                | <code>string</code>                                               | The type's canonical unit, or the `unit` asked for in `readSamples()`.                                       | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                                               | `basalBodyTemperature`, `bodyTemperature`: where the temperature was taken. Absent when not recorded.        | 0.1.0 |
| **`testType`**            | <code>string</code>                                               | `vo2Max`, iOS: how the value was measured or estimated (`vo2MaxTestType` values).                            | 0.1.0 |
| **`measurementMethod`**   | <code>string</code>                                               | `vo2Max`, Android: how the value was measured (`vo2MaxMeasurementMethod` values).                            | 0.1.0 |
| **`relationToMeal`**      | <code>string</code>                                               | `bloodGlucose`: when the reading was taken relative to a meal. iOS stores only `beforeMeal` and `afterMeal`. | 0.1.0 |
| **`mealType`**            | <code>string</code>                                               | `bloodGlucose`, Android: the meal the reading relates to.                                                    | 0.1.0 |
| **`specimenSource`**      | <code>string</code>                                               | `bloodGlucose`, Android: what the reading was taken from (capillary blood, interstitial fluid, …).           | 0.1.0 |
| **`reason`**              | <code>string</code>                                               | `insulinDelivery`, iOS: `basal` or `bolus`.                                                                  | 0.1.0 |


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

| Prop                 | Type                                                        | Description                                                                                                                                                                                                                                             | Since |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`kind`**           | <code>'event'</code>                                        |                                                                                                                                                                                                                                                         | 0.1.0 |
| **`type`**           | <code><a href="#eventhealthtype">EventHealthType</a></code> |                                                                                                                                                                                                                                                         | 0.1.0 |
| **`protectionUsed`** | <code>boolean</code>                                        | `sexualActivity`: whether protection was used. Absent when not recorded.                                                                                                                                                                                | 0.1.0 |
| **`sessionType`**    | <code>string</code>                                         | `mindfulSession` on Android: `meditation`, `breathing`, `music`, `movement` or `unguided`. Absent when not recorded; HealthKit mindful sessions have no type. Health Connect's title and notes read as `metadata['hc.title']` / `metadata['hc.notes']`. | 0.2.0 |


#### MenstruationPeriodSample

A menstruation period. Android stores periods as records. iOS has no period object: the plugin
derives periods from `menstrualFlow` samples (rules in docs/reproductive-health.md).

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


#### BloodPressureSample

A blood pressure reading. iOS stores it as a correlation of a systolic and a diastolic sample
(what Apple Health shows as one reading), Android as a `BloodPressureRecord`.

| Prop                      | Type                         | Description                                                                                      | Since |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| **`kind`**                | <code>'special'</code>       |                                                                                                  | 0.1.0 |
| **`type`**                | <code>'bloodPressure'</code> |                                                                                                  | 0.1.0 |
| **`systolic`**            | <code>number</code>          |                                                                                                  | 0.1.0 |
| **`diastolic`**           | <code>number</code>          |                                                                                                  | 0.1.0 |
| **`unit`**                | <code>'mmHg'</code>          |                                                                                                  | 0.1.0 |
| **`bodyPosition`**        | <code>string</code>          | Android: `standingUp`, `sittingDown`, `lyingDown` or `reclining`. Absent when not recorded.      | 0.1.0 |
| **`measurementLocation`** | <code>string</code>          | Android: `leftWrist`, `rightWrist`, `leftUpperArm` or `rightUpperArm`. Absent when not recorded. | 0.1.0 |


#### SleepSessionSample

A night's sleep, or a nap. Android stores sessions as `SleepSessionRecord`s. iOS has no session
object: the plugin derives sessions from `sleepAnalysis` samples (rules in the README).

Stages are in time order and never overlap; they may leave gaps. On iOS, time in bed that no other
stage covers reads as `inBed` stages.

| Prop                 | Type                        | Description                                                                                      | Since |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| **`kind`**           | <code>'special'</code>      |                                                                                                  | 0.2.0 |
| **`type`**           | <code>'sleepSession'</code> |                                                                                                  | 0.2.0 |
| **`stages`**         | <code>SleepStage[]</code>   |                                                                                                  | 0.2.0 |
| **`title`**          | <code>string</code>         | Android only.                                                                                    | 0.2.0 |
| **`notes`**          | <code>string</code>         | Android only.                                                                                    | 0.2.0 |
| **`derived`**        | <code>boolean</code>        | `true` when the plugin worked the session out from stage samples (iOS).                          | 0.2.0 |
| **`stageSampleIds`** | <code>string[]</code>       | iOS: the ids of the `sleepAnalysis` samples the session was derived from, `inBed` ones included. | 0.2.0 |


#### SleepStage

One stage of a sleep session.

| Prop            | Type                | Description                                                                                                                                                                                 | Since |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`stage`**     | <code>string</code> | `inBed`, `asleep`, `awake`, `light`, `deep` or `rem`; Android also `outOfBed` and `unknown` (`getSupportedTypes()` lists what this platform stores). `light`, `deep` and `rem` need iOS 16. | 0.2.0 |
| **`startDate`** | <code>string</code> |                                                                                                                                                                                             | 0.2.0 |
| **`endDate`**   | <code>string</code> |                                                                                                                                                                                             | 0.2.0 |


#### WorkoutSample

A finished workout: HealthKit's `HKWorkout`, Health Connect's `ExerciseSessionRecord`.

Samples recorded during a workout (heart rate, steps, …) aren't part of it: read them by the
workout's time range.

| Prop               | Type                                                        | Description                                                                                                                                 | Since |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`kind`**         | <code>'special'</code>                                      |                                                                                                                                             | 0.2.0 |
| **`type`**         | <code>'workout'</code>                                      |                                                                                                                                             | 0.2.0 |
| **`activityType`** | <code><a href="#workoutactivity">WorkoutActivity</a></code> | Native activities without a unified id read as `other`, with the raw value in `native.value`.                                               | 0.2.0 |
| **`title`**        | <code>string</code>                                         | Android only.                                                                                                                               | 0.2.0 |
| **`notes`**        | <code>string</code>                                         | Android only.                                                                                                                               | 0.2.0 |
| **`totals`**       | <code><a href="#workouttotals">WorkoutTotals</a></code>     |                                                                                                                                             | 0.2.0 |
| **`segments`**     | <code>WorkoutSegment[]</code>                               | In time order.                                                                                                                              | 0.2.0 |
| **`laps`**         | <code>WorkoutLap[]</code>                                   | In time order.                                                                                                                              | 0.2.0 |
| **`activities`**   | <code>WorkoutActivityPeriod[]</code>                        | iOS 16+, in time order; absent on Android and for workouts with a single activity.                                                          | 0.2.0 |
| **`hasRoute`**     | <code>boolean</code>                                        | Whether a route was recorded with the workout. On Android it's also `true` when this app may not read the route without the user's consent. | 0.2.0 |


#### WorkoutTotals

What a workout burned and covered. Neither platform stores these on the workout itself: iOS sums
the active energy and distance samples associated with the workout (`HKWorkout` statistics),
Android the active calories and distance records the workout's app wrote over its time, a record
partly inside counted in proportion. A total is absent when there's nothing to sum.

| Prop           | Type                | Description          | Since |
| -------------- | ------------------- | -------------------- | ----- |
| **`energy`**   | <code>number</code> | Active energy, kcal. | 0.2.0 |
| **`distance`** | <code>number</code> | Metres.              | 0.2.0 |


#### WorkoutSegment

A stretch of a workout: a pause, a rest, a set of one exercise, a swimming stroke.

Segments lie inside the workout and don't overlap on Android; on iOS, segments other apps wrote may
overlap (HealthKit allows it).

| Prop              | Type                | Description                                                                                                                                                                                                                                                                                                                          | Since |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`startDate`**   | <code>string</code> |                                                                                                                                                                                                                                                                                                                                      | 0.2.0 |
| **`endDate`**     | <code>string</code> |                                                                                                                                                                                                                                                                                                                                      | 0.2.0 |
| **`segmentType`** | <code>string</code> | A `workoutSegmentType` value (`pause`, `rest`, `squat`, `swimmingFreestyle`, …); absent for a segment without one. iOS stores only `pause` (a pause event and its resume event); any other segment is a HealthKit segment event, which has no type. Android takes only the types the workout's activity allows (`WORKOUT_SEGMENTS`). | 0.2.0 |
| **`repetitions`** | <code>number</code> | Android only: repetitions done in the segment.                                                                                                                                                                                                                                                                                       | 0.2.0 |


#### WorkoutLap

One lap of a workout.

| Prop            | Type                | Description                                                                              | Since |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------- | ----- |
| **`startDate`** | <code>string</code> |                                                                                          | 0.2.0 |
| **`endDate`**   | <code>string</code> |                                                                                          | 0.2.0 |
| **`length`**    | <code>number</code> | Metres, 0 to 1,000,000. HealthKit stores it as the lap event's `HKMetadataKeyLapLength`. | 0.2.0 |


#### WorkoutActivityPeriod

iOS 16+: one activity of a multisport workout (a triathlon's swim, ride and run), HealthKit's
`HKWorkoutActivity`.

| Prop               | Type                                                        | Since |
| ------------------ | ----------------------------------------------------------- | ----- |
| **`activityType`** | <code><a href="#workoutactivity">WorkoutActivity</a></code> | 0.2.0 |
| **`startDate`**    | <code>string</code>                                         | 0.2.0 |
| **`endDate`**      | <code>string</code>                                         | 0.2.0 |


#### NutritionSample

A food or meal entry with its nutrients: a `food` correlation of dietary samples on iOS, a
`NutritionRecord` on Android.

| Prop                  | Type                                                        | Description                                                                                                                        | Since |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`kind`**            | <code>'special'</code>                                      |                                                                                                                                    | 0.2.0 |
| **`type`**            | <code>'nutrition'</code>                                    |                                                                                                                                    | 0.2.0 |
| **`name`**            | <code>string</code>                                         | The food's name: `HKMetadataKeyFoodType` on iOS, `NutritionRecord.name` on Android.                                                | 0.2.0 |
| **`mealType`**        | <code>string</code>                                         | Android only: `breakfast`, `lunch`, `dinner` or `snack`; absent when not recorded.                                                 | 0.2.0 |
| **`nutrients`**       | <code><a href="#nutrientamounts">NutrientAmounts</a></code> | The entry's nutrients; nutrients it doesn't record are absent. On iOS, amounts of a nutrient held twice in one entry are added up. | 0.2.0 |
| **`memberSampleIds`** | <code>string[]</code>                                       | iOS only: the ids of the dietary samples the entry holds. They also read as single-nutrient samples (`dietaryProtein`, …).         | 0.2.0 |


#### ReadSamplesOptions

| Prop            | Type                                                                        | Description                                                                                                                                                                                                                                                                                 | Default           | Since |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----- |
| **`type`**      | <code><a href="#healthtypeorpassthrough">HealthTypeOrPassthrough</a></code> | A combined id (`distance`, `speed`, `power`) reads every member type HealthKit has on iOS; each sample keeps the combined id as its `type` and names its member in `native.type`. Aggregate-only types (`reason: 'aggregateOnly'` in `getSupportedTypes()`) reject with `UNSUPPORTED_TYPE`. |                   | 0.1.0 |
| **`startDate`** | <code>string</code>                                                         | Returns samples that overlap `startDate`–`endDate` (on Android, records covering a period of time other than menstruation periods match by start time). ISO 8601 with an offset.                                                                                                            |                   | 0.1.0 |
| **`endDate`**   | <code>string</code>                                                         |                                                                                                                                                                                                                                                                                             |                   | 0.1.0 |
| **`limit`**     | <code>number</code>                                                         | Page size. Default 1,000, maximum 10,000.                                                                                                                                                                                                                                                   | <code>1000</code> | 0.1.0 |
| **`ascending`** | <code>boolean</code>                                                        | Oldest first.                                                                                                                                                                                                                                                                               | <code>true</code> | 0.1.0 |
| **`cursor`**    | <code>string</code>                                                         | `nextCursor` from the previous page. Pass the same other options with it.                                                                                                                                                                                                                   |                   | 0.1.0 |
| **`unit`**      | <code>string</code>                                                         | Unit for quantity values; one of the type's units.                                                                                                                                                                                                                                          |                   | 0.1.0 |
| **`sourceIds`** | <code>string[]</code>                                                       | Only samples written by these apps (bundle ids / package names).                                                                                                                                                                                                                            |                   | 0.1.0 |


#### AggregateResult

| Prop          | Type                           | Description                                               | Since |
| ------------- | ------------------------------ | --------------------------------------------------------- | ----- |
| **`buckets`** | <code>AggregateBucket[]</code> | Every bucket of the range in order, including empty ones. | 0.1.0 |


#### AggregateBucket

| Prop            | Type                                                                                                                                          | Description                                                                                                                                                  | Since |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`startDate`** | <code>string</code>                                                                                                                           |                                                                                                                                                              | 0.1.0 |
| **`endDate`**   | <code>string</code>                                                                                                                           |                                                                                                                                                              | 0.1.0 |
| **`values`**    | <code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#aggregatemetric">AggregateMetric</a>, number&gt;&gt;</code> | The metrics asked for; a metric is absent when the bucket has no data for it. `count` is a number of readings, `duration` seconds; the others are in `unit`. | 0.1.0 |
| **`unit`**      | <code>string</code>                                                                                                                           |                                                                                                                                                              | 0.1.0 |


#### AggregateOptions

| Prop            | Type                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Since |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**      | <code><a href="#healthtype">HealthType</a></code>                         | A type whose `getSupportedTypes()` entry is `aggregatable`: quantity types, and `sleepSession` (`duration`: seconds asleep; iOS counts asleep stages with time two apps both record counted once, Android is Health Connect's total: session time minus awake, in-bed and out-of-bed stages, from apps on the user's sleep priority list), and on Android `workout` (`duration`: Health Connect's exercise time, session time minus `pause` and `rest` segments). | 0.1.0 |
| **`startDate`** | <code>string</code>                                                       | Start of the range and of the first bucket. ISO 8601 with an offset.                                                                                                                                                                                                                                                                                                                                                                                              | 0.1.0 |
| **`endDate`**   | <code>string</code>                                                       | End of the range; the last bucket stops here.                                                                                                                                                                                                                                                                                                                                                                                                                     | 0.1.0 |
| **`metrics`**   | <code>AggregateMetric[]</code>                                            | What to compute: `sum` for cumulative types (steps, energy, distance), `avg` / `min` / `max` for the others, `count` (number of readings) where the platform has it. <a href="#typesupport">`TypeSupport</a>.metrics` lists them per type.                                                                                                                                                                                                                        | 0.1.0 |
| **`bucket`**    | <code><a href="#aggregatebucketoptions">AggregateBucketOptions</a></code> | Split the range into buckets that start at `startDate`. Without it the result is one bucket for the whole range. Minute and hour buckets are exact lengths of time; day, week and month buckets follow the calendar in the device's time zone, so a day across a daylight-saving change lasts 23 or 25 hours. At most 5,000 buckets.                                                                                                                              | 0.1.0 |
| **`unit`**      | <code>string</code>                                                       | Unit for `sum`, `avg`, `min` and `max`; one of the type's units. Defaults to its canonical unit.                                                                                                                                                                                                                                                                                                                                                                  | 0.1.0 |
| **`sourceIds`** | <code>string[]</code>                                                     | Only data written by these apps (bundle ids / package names).                                                                                                                                                                                                                                                                                                                                                                                                     | 0.1.0 |


#### AggregateBucketOptions

| Prop       | Type                                                                | Description                         | Default        | Since |
| ---------- | ------------------------------------------------------------------- | ----------------------------------- | -------------- | ----- |
| **`unit`** | <code><a href="#aggregatebucketunit">AggregateBucketUnit</a></code> |                                     |                | 0.1.0 |
| **`size`** | <code>number</code>                                                 | How many `unit`s each bucket spans. | <code>1</code> | 0.1.0 |


#### GetChangesResult

| Prop             | Type                         | Description                                                                                                                           | Since |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`upserted`**   | <code>Sample[]</code>        | Samples added or changed since the cursor, in their current state. iOS reports an edit as a deletion plus a new sample with a new id. | 0.1.0 |
| **`deleted`**    | <code>DeletedSample[]</code> |                                                                                                                                       | 0.1.0 |
| **`nextCursor`** | <code>string</code>          | Store it and pass it to the next call.                                                                                                | 0.1.0 |
| **`hasMore`**    | <code>boolean</code>         | More changes are waiting: call again with `nextCursor` straight away.                                                                 | 0.1.0 |


#### DeletedSample

A deleted sample.

| Prop           | Type                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Since |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`type`**     | <code><a href="#healthtypeorpassthrough">HealthTypeOrPassthrough</a></code> |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 0.1.0 |
| **`id`**       | <code>string</code>                                                         | The deleted sample's id. On Android, a deleted series record gives one deletion whose id is the record's: remove the samples whose `id` or `seriesId` equals it. iOS `sleepSession`: the id of a deleted stage sample, so it matches a session's `id` or one of its `stageSampleIds`. HealthKit doesn't say when a deleted sample was, so a session that only lost some of its stages isn't derived again: when an id matches a stage of a session you hold, re-read that session's range. | 0.1.0 |
| **`clientId`** | <code>string</code>                                                         | iOS only: the deleted sample's `clientId`, if it had one. For a stage of a sleep session the plugin wrote, the session's `clientId`.                                                                                                                                                                                                                                                                                                                                                       | 0.1.0 |


#### GetChangesOptions

| Prop                   | Type                                   | Description                                                                                                                                                                               | Default            | Since |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----- |
| **`types`**            | <code>HealthTypeOrPassthrough[]</code> | The types to follow. A cursor only works with the types it was created for.                                                                                                               |                    | 0.1.0 |
| **`cursor`**           | <code>string</code>                    | `nextCursor` from the previous call. Without it, the call returns no changes, only a cursor marking "now": read existing data with `readSamples()` first, then follow changes from there. |                    | 0.1.0 |
| **`limit`**            | <code>number</code>                    | iOS: most changes to return per type and call (default 1,000). Health Connect sets its own page size.                                                                                     | <code>1000</code>  | 0.1.0 |
| **`excludeOwnWrites`** | <code>boolean</code>                   | Leave out upserts this app wrote. Deletions are always reported: the platforms don't say who deleted.                                                                                     | <code>false</code> | 0.1.0 |


#### SaveSamplesResult

| Prop      | Type                  | Description                                                                                                                                                                 | Since |
| --------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`ids`** | <code>string[]</code> | The stored ids, in the order of `samples`. For a period written on iOS, the id of its first day's flow sample, which is also the id `readSamples()` reports for the period. | 0.1.0 |


#### SaveSamplesOptions

| Prop          | Type                     | Since |
| ------------- | ------------------------ | ----- |
| **`samples`** | <code>NewSample[]</code> | 0.1.0 |


#### NewPassthroughSample

A new sample of a passthrough type (`hk:…`, iOS).

| Prop        | Type                                                        | Description                                                                                        | Since |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| **`type`**  | <code><a href="#passthroughtype">PassthroughType</a></code> |                                                                                                    | 0.1.0 |
| **`value`** | <code>number</code>                                         | Quantities: the amount in `unit`. Categories: HealthKit's raw value (0 for types without values).  | 0.1.0 |
| **`unit`**  | <code>string</code>                                         | Quantities: required, one of the plugin's unit ids that fits the HealthKit type (`mL`, `kcal`, …). | 0.1.0 |


#### NewQuantitySample

| Prop                      | Type                                                              | Description                                                              | Since |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| **`type`**                | <code><a href="#quantityhealthtype">QuantityHealthType</a></code> |                                                                          | 0.1.0 |
| **`value`**               | <code>number</code>                                               |                                                                          | 0.1.0 |
| **`unit`**                | <code>string</code>                                               | One of the type's units. Defaults to its canonical unit.                 | 0.1.0 |
| **`measurementLocation`** | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`testType`**            | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`measurementMethod`**   | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`relationToMeal`**      | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`mealType`**            | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`specimenSource`**      | <code>string</code>                                               |                                                                          | 0.1.0 |
| **`reason`**              | <code>string</code>                                               | `insulinDelivery`: required on iOS, which rejects the sample without it. | 0.1.0 |


#### NewCategorySample

| Prop               | Type                                                              | Description                                                                                                                                                                                                                                                      | Since |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**         | <code><a href="#categoryhealthtype">CategoryHealthType</a></code> |                                                                                                                                                                                                                                                                  | 0.1.0 |
| **`value`**        | <code>string</code>                                               | One of the type's values that this platform can store (`getSupportedTypes()`). Others reject with `INVALID_ARGUMENT` and `data.reason = 'valueUnsupportedOnPlatform'`.                                                                                           | 0.1.0 |
| **`isCycleStart`** | <code>boolean</code>                                              | `menstrualFlow`, iOS: stored as `HKMetadataKeyMenstrualCycleStart`, which HealthKit requires on every flow sample, so it defaults to `false`. Android has no such flag: write a `menstruationPeriod` instead (setting it there rejects with `INVALID_ARGUMENT`). | 0.1.0 |
| **`sensation`**    | <code>string</code>                                               | `cervicalMucus`, Android only.                                                                                                                                                                                                                                   | 0.1.0 |


#### NewEventSample

| Prop                 | Type                                                        | Description                                  | Since |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------- | ----- |
| **`type`**           | <code><a href="#eventhealthtype">EventHealthType</a></code> |                                              | 0.1.0 |
| **`protectionUsed`** | <code>boolean</code>                                        |                                              | 0.1.0 |
| **`sessionType`**    | <code>string</code>                                         | `mindfulSession`, Android only. @since 0.2.0 |       |


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


#### NewBloodPressureSample

A blood pressure reading, in mmHg. Android takes a single moment (`endDate` equal to `startDate`
or absent).

| Prop                      | Type                         | Since |
| ------------------------- | ---------------------------- | ----- |
| **`type`**                | <code>'bloodPressure'</code> | 0.1.0 |
| **`systolic`**            | <code>number</code>          | 0.1.0 |
| **`diastolic`**           | <code>number</code>          | 0.1.0 |
| **`unit`**                | <code>'mmHg'</code>          | 0.1.0 |
| **`bodyPosition`**        | <code>string</code>          | 0.1.0 |
| **`measurementLocation`** | <code>string</code>          | 0.1.0 |


#### NewSleepSession

A sleep session to write. Stages must lie inside the session, may touch but not overlap, and may
leave gaps; the plugin sorts them.

iOS writes one `sleepAnalysis` sample per stage plus one `inBed` sample spanning the whole session
(`inBed` stages you pass are folded into it), with `clientId`s `&lt;clientId&gt;:&lt;n&gt;` and
`&lt;clientId&gt;:inBed`, so writing the same session again replaces its stages. Time the stages don't
cover reads back as `inBed`. Android writes one `SleepSessionRecord`.

| Prop          | Type                        | Description                                                                | Since |
| ------------- | --------------------------- | -------------------------------------------------------------------------- | ----- |
| **`type`**    | <code>'sleepSession'</code> |                                                                            | 0.2.0 |
| **`endDate`** | <code>string</code>         | Required, after `startDate`.                                               | 0.2.0 |
| **`stages`**  | <code>SleepStage[]</code>   | Defaults to none.                                                          | 0.2.0 |
| **`title`**   | <code>string</code>         | Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`. | 0.2.0 |
| **`notes`**   | <code>string</code>         | Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`. | 0.2.0 |


#### NewWorkout

A finished workout to write. Segments and laps must lie inside it and not overlap others of their
kind (Health Connect's rules, checked on both platforms); the plugin sorts them.

`totals` are written as samples of their own over the workout's time: `activeEnergy` and
`distance` (the distance type the activity uses on iOS). They need write access to those types
too, count in the day's totals like any other sample, and are deleted with the workout. With a
`clientId`, they get `&lt;clientId&gt;:energy` and `&lt;clientId&gt;:distance`, so writing the workout again
replaces them, and a total the new version lacks is deleted.

iOS writes an `HKWorkout` through `HKWorkoutBuilder`, Android an `ExerciseSessionRecord`. On iOS a
total goes to `activeEnergy` and the activity's distance type (`distanceCycling` for cycling,
`distanceWalkingRunning` for most), split over the time between pauses since Apple Health leaves
paused time out of a workout's totals; without write access to those types the write rejects with
`PERMISSION_DENIED`.

| Prop               | Type                                                        | Description                                                                                                                                                                                                                                                                                                                                               | Since |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**         | <code>'workout'</code>                                      |                                                                                                                                                                                                                                                                                                                                                           | 0.2.0 |
| **`endDate`**      | <code>string</code>                                         | Required, after `startDate`.                                                                                                                                                                                                                                                                                                                              | 0.2.0 |
| **`activityType`** | <code><a href="#workoutactivity">WorkoutActivity</a></code> | An id this platform stores (`WORKOUT_ACTIVITIES`); others reject with `valueUnsupportedOnPlatform`.                                                                                                                                                                                                                                                       | 0.2.0 |
| **`title`**        | <code>string</code>                                         | Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`.                                                                                                                                                                                                                                                                                | 0.2.0 |
| **`notes`**        | <code>string</code>                                         | Android only: setting it on iOS rejects with `valueUnsupportedOnPlatform`.                                                                                                                                                                                                                                                                                | 0.2.0 |
| **`totals`**       | <code><a href="#workouttotals">WorkoutTotals</a></code>     | Each at most 1,000,000 (kcal, m).                                                                                                                                                                                                                                                                                                                         | 0.2.0 |
| **`segments`**     | <code>WorkoutSegment[]</code>                               |                                                                                                                                                                                                                                                                                                                                                           | 0.2.0 |
| **`laps`**         | <code>WorkoutLap[]</code>                                   | On iOS a pool swim's laps must all have the same length above 0, the pool's (`poolLapLength`): HealthKit keeps it on the workout.                                                                                                                                                                                                                         | 0.2.0 |
| **`activities`**   | <code>WorkoutActivityPeriod[]</code>                        | iOS 16+ only: setting it on Android or iOS 15 rejects with `valueUnsupportedOnPlatform`. Activities lie inside the workout and don't overlap.                                                                                                                                                                                                             | 0.2.0 |
| **`route`**        | <code>WorkoutRouteLocation[]</code>                         | The route, read back with `readWorkoutRoute`. Needs write access to routes: on iOS "Workout Routes", which the plugin requests with `workout`; on Android `WRITE_EXERCISE_ROUTE` (`requestAuthorization`'s `android.exerciseRoutes`). Without it the write rejects with `PERMISSION_DENIED` (reason `routeNotAuthorized`). An empty list writes no route. | 0.2.0 |


#### WorkoutRouteLocation

One point of a workout's route.

Writing, both platforms take Health Connect's rules: `time` at or after the workout's start and
before its end, no two points at the same time, latitude −90 to 90, longitude −180 to 180,
accuracies 0 or more. Points are stored in time order.

| Prop                     | Type                | Description                                                                                                                 | Since |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`time`**               | <code>string</code> |                                                                                                                             | 0.2.0 |
| **`latitude`**           | <code>number</code> |                                                                                                                             | 0.2.0 |
| **`longitude`**          | <code>number</code> |                                                                                                                             | 0.2.0 |
| **`altitude`**           | <code>number</code> | Metres above sea level.                                                                                                     | 0.2.0 |
| **`horizontalAccuracy`** | <code>number</code> | Metres. On iOS a point without one is written with 0: HealthKit treats a location without a horizontal accuracy as invalid. | 0.2.0 |
| **`verticalAccuracy`**   | <code>number</code> | Metres; on iOS only kept with an `altitude`.                                                                                | 0.2.0 |


#### NewNutrition

A food or meal entry to write. iOS writes a `food` correlation holding one dietary sample per
nutrient (its sync id `&lt;clientId&gt;#&lt;nutrient&gt;`), so the entry shows as one food in Apple Health and
each nutrient counts in the day's totals; Android writes one `NutritionRecord`. Re-writing with
the same `clientId` replaces the whole entry, nutrients it no longer has included, and deleting it
deletes its nutrient samples too.

| Prop            | Type                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Since |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`type`**      | <code>'nutrition'</code>                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 0.2.0 |
| **`endDate`**   | <code>string</code>                                         | On Android after `startDate` (a `NutritionRecord` covers a period); iOS also takes a single moment.                                                                                                                                                                                                                                                                                                                                                                                                   | 0.2.0 |
| **`name`**      | <code>string</code>                                         | The food's name; an empty string is dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 0.2.0 |
| **`mealType`**  | <code>string</code>                                         | Android only (`mealType` value set): setting it on iOS rejects with `valueUnsupportedOnPlatform`.                                                                                                                                                                                                                                                                                                                                                                                                     | 0.2.0 |
| **`nutrients`** | <code><a href="#nutrientamounts">NutrientAmounts</a></code> | At least one. Amounts are 0 or more and at most Health Connect's limit on both platforms (`NUTRIENTS[id].max`: 100,000 for energy and the macronutrients, 100 g for the others). Nutrients this platform doesn't store (`NUTRIENTS[id].ios` / `.android` is `null`: iOS has no `energyFromFat`, `unsaturatedFat`, `transFat` or `folicAcid`) reject with `valueUnsupportedOnPlatform`. On iOS each needs write access to its dietary type, else the write rejects with `PERMISSION_DENIED` naming it. | 0.2.0 |


#### DeleteSamplesResult

| Prop          | Type                | Since |
| ------------- | ------------------- | ----- |
| **`deleted`** | <code>number</code> | 0.1.0 |


#### DeleteSamplesOptions

Pass exactly one of `ids`, `clientIds`, or `startDate` + `endDate`.

| Prop            | Type                                                                        | Description                                                                                                                                                        | Since |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`type`**      | <code><a href="#healthtypeorpassthrough">HealthTypeOrPassthrough</a></code> |                                                                                                                                                                    | 0.1.0 |
| **`ids`**       | <code>string[]</code>                                                       | <a href="#sample">Sample</a> ids. On Android, the id of a point in a series record (`&lt;seriesId&gt;#&lt;index&gt;`) deletes the whole record, every point of it. | 0.1.0 |
| **`clientIds`** | <code>string[]</code>                                                       |                                                                                                                                                                    | 0.1.0 |
| **`startDate`** | <code>string</code>                                                         | Deletes this app's samples that overlap `startDate`–`endDate`.                                                                                                     | 0.1.0 |
| **`endDate`**   | <code>string</code>                                                         |                                                                                                                                                                    | 0.1.0 |


#### ReadWorkoutRouteResult

| Prop            | Type                                | Description                                                                                                                                                        | Since |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **`locations`** | <code>WorkoutRouteLocation[]</code> | In time order; empty when the workout has no route. On iOS, a workout with several routes gives all their points, and a route the user didn't share reads as none. | 0.2.0 |


#### ReadWorkoutRouteOptions

| Prop            | Type                                       | Description         | Since |
| --------------- | ------------------------------------------ | ------------------- | ----- |
| **`workoutId`** | <code>string</code>                        | The workout's `id`. | 0.2.0 |
| **`android`**   | <code>{ requestConsent?: boolean; }</code> |                     | 0.2.0 |


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


#### AggregateMetric

A statistic `aggregate()` can compute.

<code>'sum' | 'avg' | 'min' | 'max' | 'count' | 'duration'</code>


#### UnsupportedReason

Why a type can't be read or written here.

- `notOnPlatform`: this platform has no such type.
- `osVersion`: iOS, the type needs a newer iOS (see `minOS`).
- `featureUnavailable`: Android, this device's Health Connect doesn't have the feature the type needs.
- `readOnly`: the type can be read but the platform doesn't let apps write it.
- `aggregateOnly`: the platform has no samples of the type, only aggregates (`totalEnergy` on iOS,
  `basalEnergy` on Android).

<code>'notOnPlatform' | 'osVersion' | 'featureUnavailable' | 'readOnly' | 'aggregateOnly'</code>


#### AuthorizationStatusMap

Status per type, for the types passed in.

<code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#healthtypeorpassthrough">HealthTypeOrPassthrough</a>, <a href="#authorizationstatus">AuthorizationStatus</a>&gt;&gt;</code>


#### Partial

Make all properties in T optional

<code>{ [P in keyof T]?: T[P]; }</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>


#### HealthTypeOrPassthrough

Any type a call accepts: a unified type id (see <a href="#healthtype">`HealthType`</a> and docs/supported-types.md) or a
passthrough id.

<code><a href="#healthtype">HealthType</a> | <a href="#passthroughtype">PassthroughType</a></code>


#### PassthroughType

A native type the registry doesn't cover yet: `hk:` plus a HealthKit quantity or category
identifier (`hk:HKCategoryTypeIdentifierHandwashingEvent`), on iOS. Values stay native: quantities in
a unit you name, categories as HealthKit's raw integers. `hc:` plus a Health Connect record class
is reserved: every record of the Health Connect library the plugin uses is registered, so `hc:`
ids reject with `UNSUPPORTED_TYPE` for now.

<code>`hk:${string}` | `hc:${string}`</code>


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

<code><a href="#passthroughsample">PassthroughSample</a> | <a href="#quantitysample">QuantitySample</a> | <a href="#categorysample">CategorySample</a> | <a href="#eventsample">EventSample</a> | <a href="#menstruationperiodsample">MenstruationPeriodSample</a> | <a href="#skintemperaturesample">SkinTemperatureSample</a> | <a href="#bloodpressuresample">BloodPressureSample</a> | <a href="#sleepsessionsample">SleepSessionSample</a> | <a href="#workoutsample">WorkoutSample</a> | <a href="#nutritionsample">NutritionSample</a></code>


#### QuantityHealthType

Types whose samples are a number with a unit.

<code>'basalBodyTemperature' | 'wristTemperature' | 'steps' | 'distance' | 'distanceWalkingRunning' | 'distanceCycling' | 'distanceSwimming' | 'distanceWheelchair' | 'distanceDownhillSnowSports' | 'distanceCrossCountrySkiing' | 'distancePaddleSports' | 'distanceRowing' | 'distanceSkatingSports' | 'activeEnergy' | 'basalEnergy' | 'basalMetabolicRate' | 'totalEnergy' | 'floorsClimbed' | 'elevationGained' | 'wheelchairPushes' | 'stepsCadence' | 'speed' | 'walkingSpeed' | 'runningSpeed' | 'cyclingSpeed' | 'crossCountrySkiingSpeed' | 'paddleSportsSpeed' | 'rowingSpeed' | 'power' | 'runningPower' | 'cyclingPower' | 'cyclingFunctionalThresholdPower' | 'cyclingCadence' | 'vo2Max' | 'exerciseTime' | 'standTime' | 'moveTime' | 'physicalEffort' | 'workoutEffortScore' | 'estimatedWorkoutEffortScore' | 'walkingStepLength' | 'walkingAsymmetry' | 'walkingDoubleSupport' | 'stairAscentSpeed' | 'stairDescentSpeed' | 'sixMinuteWalkTestDistance' | 'runningStrideLength' | 'runningVerticalOscillation' | 'runningGroundContactTime' | 'walkingSteadiness' | 'swimmingStrokeCount' | 'heartRate' | 'restingHeartRate' | 'walkingHeartRateAverage' | 'heartRateVariabilitySdnn' | 'heartRateVariabilityRmssd' | 'heartRateRecovery' | 'oxygenSaturation' | 'respiratoryRate' | 'bodyTemperature' | 'bloodGlucose' | 'atrialFibrillationBurden' | 'peripheralPerfusionIndex' | 'breathingDisturbances' | 'weight' | 'height' | 'bodyFat' | 'leanBodyMass' | 'boneMass' | 'bodyWaterMass' | 'bmi' | 'waistCircumference' | 'electrodermalActivity' | 'forcedVitalCapacity' | 'forcedExpiratoryVolume1' | 'peakExpiratoryFlowRate' | 'inhalerUsage' | 'bloodAlcoholContent' | 'numberOfAlcoholicBeverages' | 'numberOfTimesFallen' | 'uvExposure' | 'timeInDaylight' | 'environmentalAudioExposure' | 'headphoneAudioExposure' | 'environmentalSoundReduction' | 'underwaterDepth' | 'waterTemperature' | 'insulinDelivery' | 'nikeFuel' | 'hydration' | 'dietaryEnergy' | 'dietaryEnergyFromFat' | 'dietaryProtein' | 'dietaryCarbohydrates' | 'dietaryFiber' | 'dietarySugar' | 'dietaryTotalFat' | 'dietarySaturatedFat' | 'dietaryMonounsaturatedFat' | 'dietaryPolyunsaturatedFat' | 'dietaryUnsaturatedFat' | 'dietaryTransFat' | 'dietaryCholesterol' | 'dietarySodium' | 'dietaryPotassium' | 'dietaryCalcium' | 'dietaryIron' | 'dietaryMagnesium' | 'dietaryPhosphorus' | 'dietaryZinc' | 'dietaryCopper' | 'dietaryManganese' | 'dietarySelenium' | 'dietaryChromium' | 'dietaryMolybdenum' | 'dietaryIodine' | 'dietaryChloride' | 'dietaryVitaminA' | 'dietaryVitaminB6' | 'dietaryVitaminB12' | 'dietaryVitaminC' | 'dietaryVitaminD' | 'dietaryVitaminE' | 'dietaryVitaminK' | 'dietaryThiamin' | 'dietaryRiboflavin' | 'dietaryNiacin' | 'dietaryPantothenicAcid' | 'dietaryBiotin' | 'dietaryFolate' | 'dietaryFolicAcid' | 'dietaryCaffeine'</code>


#### CategoryHealthType

Types whose samples hold one value from a fixed set (flow level, test result, severity…).

<code>'menstrualFlow' | 'cervicalMucus' | 'ovulationTest' | 'pregnancyTest' | 'progesteroneTest' | 'contraceptive' | 'bleedingDuringPregnancy' | 'bleedingAfterPregnancy' | 'bleedingAfterMenopause' | 'menopausalState' | 'abdominalCramps' | 'acne' | 'appetiteChanges' | 'bladderIncontinence' | 'bloating' | 'breastPain' | 'chills' | 'constipation' | 'diarrhea' | 'drySkin' | 'fatigue' | 'hairLoss' | 'headache' | 'hotFlashes' | 'lowerBackPain' | 'memoryLapse' | 'moodChanges' | 'nausea' | 'nightSweats' | 'pelvicPain' | 'sleepChanges' | 'vaginalDryness' | 'standHour' | 'walkingSteadinessEvent' | 'lowCardioFitnessEvent' | 'environmentalAudioExposureEvent' | 'headphoneAudioExposureEvent'</code>


#### EventHealthType

Types whose samples have no value, only a time range (the event happened).

<code>'intermenstrualBleeding' | 'sexualActivity' | 'pregnancy' | 'lactation' | 'infrequentMenstrualCycles' | 'irregularMenstrualCycles' | 'persistentIntermenstrualBleeding' | 'prolongedMenstrualPeriods' | 'highHeartRateEvent' | 'lowHeartRateEvent' | 'irregularHeartRhythmEvent' | 'hypertensionEvent' | 'sleepApneaEvent' | 'mindfulSession'</code>


#### WorkoutActivity

A workout's activity type. Which platforms store it is in {@link WORKOUT_ACTIVITIES}.

<code>(typeof WORKOUT_ACTIVITY_IDS)[number]</code>


#### NutrientAmounts

<a href="#nutrient">Nutrient</a> amounts by nutrient id, in each nutrient's canonical unit (`NUTRIENTS[id].unit`: `kcal`
for `energy` and `energyFromFat`, `g` for the rest; `0.0005` g of vitamin C is 500 mg).

<code><a href="#partial">Partial</a>&lt;<a href="#record">Record</a>&lt;<a href="#nutrient">Nutrient</a>, number&gt;&gt;</code>


#### Nutrient

A nutrient of a nutrition entry. Which platforms store it is in {@link NUTRIENTS}.

<code>(typeof NUTRIENT_IDS)[number]</code>


#### AggregateBucketUnit

Bucket length for `aggregate()`.

<code>'minute' | 'hour' | 'day' | 'week' | 'month'</code>


#### NewSample

<code><a href="#newpassthroughsample">NewPassthroughSample</a> | <a href="#newquantitysample">NewQuantitySample</a> | <a href="#newcategorysample">NewCategorySample</a> | <a href="#neweventsample">NewEventSample</a> | <a href="#newmenstruationperiod">NewMenstruationPeriod</a> | <a href="#newskintemperaturesample">NewSkinTemperatureSample</a> | <a href="#newbloodpressuresample">NewBloodPressureSample</a> | <a href="#newsleepsession">NewSleepSession</a> | <a href="#newworkout">NewWorkout</a> | <a href="#newnutrition">NewNutrition</a></code>

</docgen-api>
