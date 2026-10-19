# Aggregates

`aggregate()` returns totals and statistics (daily steps, average heart rate, weekly active
energy), computed by HealthKit or Health Connect.

## Why not add up samples yourself?

A phone and a watch both count the same walk. Summing `readSamples()` results counts it twice.
`aggregate()` lets the platform remove the overlap, the same way Apple Health and Health Connect do
for their own totals, so your numbers match what the user sees there.

## Usage

```ts
const { buckets } = await CapacitorHealth.aggregate({
  type: 'steps',
  startDate: '2026-10-10T00:00:00+05:30', // local midnight, for calendar days
  endDate: '2026-10-17T00:00:00+05:30',
  metrics: ['sum'],
  bucket: { unit: 'day' },                // optional; without it: one bucket for the whole range
});

for (const day of buckets) {
  console.log(day.startDate, day.values.sum ?? 0); // empty days come back with no values
}
```

```ts
// Average, lowest and highest resting heart rate per week, in the last 12 weeks
await CapacitorHealth.aggregate({
  type: 'restingHeartRate',
  startDate: '2026-07-27T00:00:00+05:30', // a Monday
  endDate: '2026-10-19T00:00:00+05:30',
  metrics: ['avg', 'min', 'max'],
  bucket: { unit: 'week' },
});
```

## Metrics

| Metric | For |
|---|---|
| `sum` | Cumulative types: steps, distance, energy, floors, … |
| `avg`, `min`, `max` | Everything else: heart rate, weight, temperature, … |
| `count` | Number of readings, where Health Connect has it (heart rate) |
| `duration` | Reserved for session types in a later release |

Which metrics a type supports on the device is in `getSupportedTypes()`: `aggregatable` and
`metrics`. Asking for one it doesn't support rejects with `INVALID_ARGUMENT` (`data.reason: 'metricUnsupported'`).

## Buckets

- Buckets start at `startDate` and the last stops at `endDate`. `size` makes them longer:
  `{ unit: 'hour', size: 6 }`.
- **Minute and hour** buckets are exact lengths of time.
- **Day, week and month** buckets follow the calendar in the **device's time zone**: a day across a
  daylight-saving change lasts 23 or 25 hours. For calendar-aligned buckets, start at local
  midnight (or on a Monday, or on the 1st).
- **Every bucket comes back**, empty ones with no values (`values.sum` is `undefined`, not `0`).
- A range may hold up to 5,000 buckets.

## Options

- `unit`: the unit of `sum`, `avg`, `min` and `max`, as for reads. Defaults to the canonical unit.
- `sourceIds`: only data from these apps (bundle ids / package names).

## Platform differences

- **Overlap removal.** HealthKit removes overlap between sources for every type. Health Connect
  removes it only for activity types (steps, distance, energy, floors, elevation, wheelchair
  pushes), using the user's data-source priority; other types aggregate every app's data. So the
  same data can give different averages on the two platforms.
- **Android local days.** Health Connect places each record by the offset it was written with, so a
  record written while travelling counts toward that local day.
- **Combined ids on iOS.** `distance` and `totalEnergy` sum their member types. `speed` and `power`
  give `min` and `max` but no `avg`, which HealthKit can't combine across types; aggregate a split id
  (`walkingSpeed`) for its average.
- **Aggregate-only types.** `totalEnergy` on iOS and `basalEnergy` on Android have no samples, only
  aggregates.

## Permissions

`aggregate()` needs read access to the type, like `readSamples()`. On iOS a denied read looks like
no data. On Android, Health Connect's limit on data from before the first grant applies (see
`requestAuthorization()`'s `android.history`).
