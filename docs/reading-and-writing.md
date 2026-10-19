# Reading and writing data

## Types

Every call names a **type**: a camelCase id that means the same thing on both platforms
(`menstrualFlow`, `steps`, `heartRate`). The plugin maps it to the HealthKit identifier or the Health
Connect record. The full list, with each type's HealthKit and Health Connect counterpart,
permissions and values or units, is in [Supported types](supported-types.md).

Not every type exists on both platforms, and some only exist on newer OS versions. Ask the device:

```ts
const { types } = await CapacitorHealth.getSupportedTypes();
const flow = types.find((t) => t.type === 'menstrualFlow');
// { type: 'menstrualFlow', supported: true, readable: true, writable: true,
//   aggregatable: false, values: ['unspecified', 'light', 'medium', 'heavy', 'none'] }   (iOS)
```

When `supported`, `readable` or `writable` is `false`, `reason` says why: `notOnPlatform`,
`osVersion` (with `minOS`), `featureUnavailable`, `readOnly` or `aggregateOnly`. Using an unsupported
type rejects with `UNSUPPORTED_TYPE`.

## Dates and time zones

All dates are **ISO 8601 strings with an offset**: `2026-10-15T08:00:00+05:30` (or `Z`). Dates
without an offset, epoch numbers and `Date` objects reject with `INVALID_ARGUMENT`. Use
`date.toISOString()` if you have a `Date`.

- **Reads** return dates in the zone the sample was recorded in when the platform knows it (Health
  Connect always; HealthKit when the writer stored a time zone), otherwise in the device's current
  zone. `zoneOffset` is set when the platform recorded one. Times are kept to the millisecond.
- **Writes:** Android stores the offsets of the dates you pass. On iOS, pass an IANA `timeZone`
  (`'Asia/Kolkata'`) to store it as `HKMetadataKeyTimeZone`, which Apple Health uses to show the
  sample in its local time.
- **Ranges** (`startDate`–`endDate`) match samples that **overlap** them. One exception: on Android,
  records that cover a period of time (`steps`, `distance`, the energy types, `floorsClimbed`,
  `elevationGained`, `wheelchairPushes`, `skinTemperature`) match by **start time**, as Health
  Connect does.

## Reading

```ts
const { samples, nextCursor } = await CapacitorHealth.readSamples({
  type: 'basalBodyTemperature',
  startDate: '2026-09-01T00:00:00+05:30',
  endDate: '2026-10-01T00:00:00+05:30',
  unit: 'degC',          // optional: quantity unit, defaults to the canonical one
  limit: 500,            // optional: page size, default 1,000, max 10,000
  ascending: false,      // optional: newest first (default oldest first)
  sourceIds: ['com.example.thermometer'], // optional: only these apps
});
```

**Paging.** When `nextCursor` is set there may be more: call again with the **same options** plus
`cursor: nextCursor`, until it's absent.

```ts
import { CapacitorHealth, type ReadSamplesOptions, type Sample } from '@caplugins/capacitor-health';

async function readAll(options: ReadSamplesOptions) {
  const all: Sample[] = [];
  let cursor: string | undefined;
  do {
    const page = await CapacitorHealth.readSamples({ ...options, cursor });
    all.push(...page.samples);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
```

On iOS, a type the user didn't allow reading returns no samples (see
[Permissions](permissions.md#ios)). On Android it rejects with `PERMISSION_DENIED`.

## The sample shape

Every sample has:

| Field | |
|---|---|
| `id` | The platform's id for the sample. Use it to delete. |
| `type`, `kind` | The type id, and `quantity`, `category`, `event` or `special`. |
| `startDate`, `endDate` | Equal for single-moment samples. |
| `value` | A number (quantities, in `unit`), a named value (categories, e.g. `'heavy'`); absent for events. |
| `unit` | Quantities only. |
| `source` | The app that wrote it: `{ id, name? }`, with the bundle id / package name as `id` and the app name on iOS. |
| `device` | The device that recorded it, when the writer said: name, manufacturer, model, and type (Android) or hardware and software versions (iOS). |
| `recordingMethod` | `manual`, `automatic`, `active` or `unknown`. |
| `clientId`, `clientVersion` | The writer's own id and version, when it set one (see below). |
| `seriesId` | Android: the series record a point belongs to (see below). |
| `zoneOffset` | The offset the sample was recorded in, when the platform stored one. |
| `platform`, `native` | `'ios'` or `'android'`, and the native type plus raw value. |
| `metadata` | Native fields the shared shape has no place for, under `hk.` / `hc.` keys. |

Some types add typed fields:

| Field | Types |
|---|---|
| `isCycleStart` | `menstrualFlow` (see [Reproductive health](reproductive-health.md#menstrual-flow)) |
| `sensation` | `cervicalMucus` (Android) |
| `measurementLocation` | `basalBodyTemperature`, `bodyTemperature`, `skinTemperature` |
| `protectionUsed` | `sexualActivity` |
| `testType` / `measurementMethod` | `vo2Max` (iOS / Android) |
| `relationToMeal`, `mealType`, `specimenSource` | `bloodGlucose` (the last two Android only) |
| `reason` | `insulinDelivery` (iOS, required on write) |
| `systolic`, `diastolic`, `bodyPosition` | `bloodPressure` (see [Supported types](supported-types.md#blood-pressure)) |

`menstruationPeriod` and `skinTemperature` have their own shapes; see their pages.

### Values and units

- **Quantities** come in the type's canonical unit unless you pass `unit`. `getSupportedTypes()`
  lists each type's units, canonical first. Percentages are 0–100 on both platforms.
- **Categories** use names, not numbers: flow is `unspecified | light | medium | heavy | none`, an
  LH-surge ovulation test is `lhSurge`.
- **Platform-only values** exist, like flow `none` (iOS) or cervical mucus `unusual` (Android). Reads
  never invent them. Writing one on the other platform rejects with `INVALID_ARGUMENT` and
  `data.reason: 'valueUnsupportedOnPlatform'`. `getSupportedTypes()` lists the values each platform
  can store.

### Watch data and series

- **HealthKit** sometimes stores many readings as one sample (Apple Watch data). It reads as one
  sample whose value is HealthKit's sum or average, with `metadata['hk.count']` holding the number of
  readings.
- **Health Connect** stores `heartRate`, `speed`, `power`, `stepsCadence` and `cyclingCadence` as
  series records holding many points. Each point reads as its own sample (`startDate` = `endDate`).
  Points of a record with several get ids `<seriesId>#<index>` and a `seriesId`, and share the
  record's `clientId`. For these types `limit` counts records, so a page can hold more samples.

**Don't add up raw samples for totals**: a phone and a watch can both record the same walk. Use
[Aggregates](aggregates.md).

## Writing

```ts
const { ids } = await CapacitorHealth.saveSamples({
  samples: [
    {
      type: 'basalBodyTemperature',
      startDate: '2026-10-15T06:30:00+05:30',
      value: 36.6,
      unit: 'degC',
      measurementLocation: 'mouth',
      clientId: 'bbt-2026-10-15',
      timeZone: 'Asia/Kolkata', // optional, iOS
    },
    { type: 'ovulationTest', startDate: '2026-10-14T08:00:00+05:30', value: 'lhSurge', clientId: 'opk-2026-10-14' },
  ],
});
```

- `ids` holds the stored ids, in the order of `samples`.
- `endDate` defaults to `startDate`. Types that cover a period of time need one.
- `recordingMethod` says whether the user typed the value in (`manual`) or a device measured it
  (`automatic`, `active`). It defaults to `unknown`. iOS only stores `manual` (as "user entered").
- All samples are validated before any is written. A batch either passes validation as a whole or
  rejects with `INVALID_ARGUMENT` naming the field (`data.field`, e.g. `samples[1].value`).

### Idempotent writes with `clientId`

Give each sample a `clientId`: a stable id from your own data model. Writing the same `clientId`
again **replaces** the stored sample instead of adding a second one, when `clientVersion` is equal
or higher (default `1`). A lower `clientVersion` is ignored. This makes retries and re-syncs safe.

Under the hood this is HealthKit's sync identifier and version, and Health Connect's
`clientRecordId` and `clientRecordVersion`.

- **iOS replaces a sample's `id` when it's updated** (HealthKit samples are immutable); the
  `clientId` stays. Health Connect keeps the id. So store `clientId`s, not `id`s, for your own data.
- Don't re-save unchanged samples: on iOS every save is a delete plus an insert, which shows up in
  [`getChanges`](syncing.md).

### Platform rules checked before writing

The plugin checks the rules each platform enforces, so a bad value rejects with `INVALID_ARGUMENT`
and a `data.reason` rather than crashing or failing obscurely:

| `data.reason` | When |
|---|---|
| `valueUnsupportedOnPlatform` | A value this platform has no equivalent for. |
| `outOfRange` | Outside the platform's range: a weight above 1,000 kg on Android, a percentage above 100, an effort score outside 0–10 on iOS. |
| `intervalOnly` | The type needs an `endDate` after `startDate` (Android records that cover a period; iOS audio exposure samples, which need at least one second). |
| `instantOnly` | Android single-moment records (weight, height, body temperature, …) need `endDate` equal to `startDate` or none. |
| `wholeNumberOnly` | Android `steps`, `wheelchairPushes` and `restingHeartRate`. |

Read-only types (Apple-computed ones like `wristTemperature`, `exerciseTime`, the heart and audio
events) reject writes with `READ_ONLY_TYPE`.

## Deleting

```ts
await CapacitorHealth.deleteSamples({ type: 'ovulationTest', clientIds: ['opk-2026-10-14'] });
await CapacitorHealth.deleteSamples({ type: 'ovulationTest', ids: [sample.id] });
await CapacitorHealth.deleteSamples({
  type: 'ovulationTest',
  startDate: '2026-10-01T00:00:00+05:30',
  endDate: '2026-11-01T00:00:00+05:30',
});
```

- Pass one of `ids`, `clientIds` or a `startDate`–`endDate` range. A range deletes your app's samples
  that overlap it.
- **An app can only delete what it wrote.** Other apps' samples are left alone, and ids or
  `clientIds` that match nothing are skipped; neither is an error. The result says how many were
  deleted.
- On Android, passing other apps' ids costs extra Health Connect calls (one each on Android 14+), so
  pass only your own (`sample.source.id`) when you can.
- On Android, deleting a series point's id (`<seriesId>#<index>`) deletes the whole record, every
  point of it.

## Passthrough ids (iOS)

For a HealthKit type the plugin doesn't have an id for yet, pass `hk:` plus its identifier:

```ts
await CapacitorHealth.readSamples({
  type: 'hk:HKQuantityTypeIdentifierDietaryWater',
  startDate, endDate,
  unit: 'mL',
});
```

See [Supported types → Passthrough ids](supported-types.md#passthrough-ids-hk).
