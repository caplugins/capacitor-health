# Reproductive health

Cycle and reproductive data is where HealthKit and Health Connect differ the most, and where apps
most need the two to behave the same. This page explains how the plugin unifies them, and the rules
it follows where they don't line up.

## The types

| Type | iOS | Android | Notes |
|---|---|---|---|
| `menstrualFlow` | ✓ | ✓ | One sample per day of bleeding. Values `unspecified`, `light`, `medium`, `heavy`, `none` (iOS only). |
| `menstruationPeriod` | derived | ✓ | A whole period. See [below](#menstruation-periods). |
| `intermenstrualBleeding` | ✓ | ✓ | Spotting. An event: no value. |
| `cervicalMucus` | ✓ | ✓ | `dry`, `sticky`, `creamy`, `watery`, `eggWhite`, plus `unusual` and `unknown` on Android. Android also has `sensation`. |
| `ovulationTest` | ✓ | ✓ | `negative`, `lhSurge`, `estrogenSurge`, `indeterminate`. |
| `sexualActivity` | ✓ | ✓ | An event, with optional `protectionUsed`. |
| `basalBodyTemperature` | ✓ | ✓ | `degC` / `degF`, with optional `measurementLocation`. |
| `wristTemperature` | ✓ read-only | — | Apple Watch's sleeping wrist temperature (iOS 16+). |
| `skinTemperature` | — | ✓ | A baseline plus timed deltas (Android 14+). |
| `pregnancyTest`, `progesteroneTest` | ✓ | — | `negative`, `positive`, `indeterminate` (iOS 15+). |
| `contraceptive` | ✓ | — | `unspecified`, `implant`, `injection`, `intrauterineDevice`, `intravaginalRing`, `oral`, `patch`. |
| `pregnancy`, `lactation` | ✓ | — | Events covering a span of time. |
| `bleedingDuringPregnancy`, `bleedingAfterPregnancy` | ✓ | — | iOS 18+. Flow values. |
| `bleedingAfterMenopause`, `menopausalState` | ✓ | — | iOS 27+. |
| `infrequentMenstrualCycles`, `irregularMenstrualCycles`, `persistentIntermenstrualBleeding`, `prolongedMenstrualPeriods` | ✓ read-only | — | Apple Health's cycle-deviation notifications (iOS 16+). |
| 22 symptoms (`abdominalCramps`, `acne`, `bloating`, `headache`, `moodChanges`, …) | ✓ | — | The symptoms of Apple Health's Cycle Tracking. Severity `notPresent`, `mild`, `moderate`, `severe`; `moodChanges` and `sleepChanges` are `present` / `notPresent`, `appetiteChanges` is `noChange` / `decreased` / `increased`. |

The exact identifiers, permissions and values are in [Supported types](supported-types.md).
Platform-only values (flow `none`, mucus `unusual`) are reported, never invented, and writing one on
the other platform rejects with `data.reason: 'valueUnsupportedOnPlatform'`.

## Menstrual flow

A `menstrualFlow` sample is one day of bleeding. It has an `isCycleStart` flag, which means
different things on each platform:

- **iOS** stores the flag the writer set (`HKMetadataKeyMenstrualCycleStart`). HealthKit requires it
  on every flow sample, so the plugin writes `false` unless you pass `true`. **Apple Health itself
  writes `false` even on the first day of a period**, so don't rely on the flag to find periods
  from other apps; read `menstruationPeriod` instead.
- **Android** has no such flag. The plugin computes it on read: `true` when a period from the same
  app starts that day, `false` when one covers the day but started earlier, absent otherwise.
  Setting `isCycleStart` on Android rejects with `INVALID_ARGUMENT`: write a `menstruationPeriod`
  instead.

## Menstruation periods

Health Connect stores periods as records (`MenstruationPeriodRecord`). HealthKit has no period
object: Apple Health shows periods by grouping flow days. To give apps one model, the plugin reads
and writes `menstruationPeriod` on both platforms, deriving it from flow samples on iOS. The rules
below are a contract, covered by test fixtures in
[`fixtures/menstruation`](../fixtures/menstruation).

```ts
// Read
const { samples } = await CapacitorHealth.readSamples({
  type: 'menstruationPeriod',
  startDate: '2026-07-01T00:00:00+05:30',
  endDate: '2026-10-01T00:00:00+05:30',
});
for (const p of samples) {
  if (p.type === 'menstruationPeriod') console.log(p.firstDay, p.lastDay, p.derived);
}

// Write: a period from 1 to 5 October, with flow for the first two days
await CapacitorHealth.saveSamples({
  samples: [{
    type: 'menstruationPeriod',
    startDate: '2026-10-01T09:00:00+05:30',
    endDate: '2026-10-05T09:00:00+05:30',
    clientId: 'period-2026-10-01',
    flow: { '2026-10-01': 'heavy', '2026-10-02': 'medium' },
    recordingMethod: 'manual',
  }],
});
```

A period has `firstDay` and `lastDay` (local dates, inclusive), plus `startDate` (local midnight of
the first day) and `endDate` (23:59:59.999 of the last). When writing, **only the local dates of
`startDate` and `endDate` matter**.

### Reading on iOS

1. Flow samples are mapped to local days, in each sample's stored time zone, else the device's.
2. A sample with a duration covers each day from its start up to, but not including, its end, so a
   sample ending at midnight doesn't add a day.
3. Samples with flow `none` are ignored.
4. A new period starts after **two or more blank days** (one blank day stays inside a period), or at
   a sample flagged `isCycleStart`. The gap rule comes first, because Apple Health writes the flag as
   `false` even on day 1.
5. The plugin looks 15 days before your range, so a period that started earlier is returned whole.
6. A derived period has `derived: true`, the ids of its flow samples in `flowSampleIds`, and its
   first sample's `id` and `source`.

**Periods merge days from every app**, as Apple Health does. If another app logged days next to
yours, they form one period, whose `id`, `source` and `clientId` come from its first day. So look
periods up **by date**, not only by `clientId`.

### Writing on iOS

A period becomes **one flow sample per day at local noon**: `unspecified` unless you pass `flow` for
that day, day 1 flagged as cycle start, each with `clientId` `<your clientId>:<yyyy-mm-dd>`. This is
the shape Apple Health writes itself, so the period appears there as you'd expect.

- Writing the same period again updates it, and **a shorter period deletes the days it no longer
  covers**.
- `saveSamples()` returns the id of the first day's flow sample, which is also the id `readSamples()`
  reports for the period.

### Android

- One `MenstruationPeriodRecord` from local midnight of the first day to 23:59:59.999 of the last,
  at most **31 days** (Health Connect's limit).
- Days listed in `flow` also become flow records, which belong to the period: re-writing it replaces
  them, deleting it deletes them.
- Reads map a period ending exactly at midnight to the day before.

### Deleting periods

`deleteSamples({ type: 'menstruationPeriod', … })` counts periods. On iOS it deletes your app's flow
samples of the matched periods; other apps' days stay.

### Following changes

On iOS, follow `menstrualFlow` with `getChanges()` and re-read the periods around the changed days;
`menstruationPeriod` itself can't be followed there. See [Syncing](syncing.md#menstruation-periods).

## A cycle tracker, end to end

```ts
import { CapacitorHealth, type HealthType } from '@caplugins/capacitor-health';

const READ: HealthType[] = ['menstruationPeriod', 'menstrualFlow', 'basalBodyTemperature', 'ovulationTest', 'cervicalMucus'];
const WRITE: HealthType[] = ['menstruationPeriod', 'menstrualFlow', 'ovulationTest'];

// Keep only the types this device has
const { types } = await CapacitorHealth.getSupportedTypes();
const has = (t: HealthType) => types.some((s) => s.type === t && s.supported);
await CapacitorHealth.requestAuthorization({ read: READ.filter(has), write: WRITE.filter(has) });

// Import history (readAll: see Reading and writing → Paging)
const periods = await readAll({ type: 'menstruationPeriod', startDate: yearAgo, endDate: now });

// Log today's flow by re-writing the current period through today. Pass every day's flow, not
// just today's: on iOS days missing from `flow` are written as `unspecified`.
await CapacitorHealth.saveSamples({
  samples: [{
    type: 'menstruationPeriod',
    startDate: periodStart,
    endDate: today,
    clientId: `period-${periodStart.slice(0, 10)}`,
    flow: flowByDay, // { '2026-10-01': 'heavy', '2026-10-02': 'medium', … }
    recordingMethod: 'manual',
  }],
});
```

Declare `READ_MENSTRUATION`, `WRITE_MENSTRUATION`, `READ_BASAL_BODY_TEMPERATURE`,
`READ_OVULATION_TEST`, `WRITE_OVULATION_TEST` and `READ_CERVICAL_MUCUS` in the Android manifest
for this example.

## Privacy

Reproductive data is among the most sensitive data an app can hold, and both stores review it
closely. Read [Privacy and store review](privacy-and-store-review.md) before shipping.
