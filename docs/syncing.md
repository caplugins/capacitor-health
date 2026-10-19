# Syncing with `getChanges`

Apps that keep their own copy of health data (a cycle history, a backend) need to know what changed
in HealthKit or Health Connect since they last looked: new samples from other apps, edits, and
deletions. `getChanges()` gives you exactly that, with an opaque cursor you store between calls.

The plugin has no sync policy of its own: it doesn't schedule, cache, merge or resolve conflicts.
These are building blocks; when and how you sync is up to your app.

## How it works

```ts
import { CapacitorHealth, type HealthError, type HealthType } from '@caplugins/capacitor-health';

const TYPES: HealthType[] = ['menstrualFlow', 'ovulationTest', 'basalBodyTemperature'];

// First sync: read what's there, then take a cursor marking "now".
const { nextCursor } = await CapacitorHealth.getChanges({ types: TYPES });
for (const type of TYPES) {
  const samples = await readAll({ type, startDate: since, endDate: now }); // see Reading and writing
  await store.upsert(samples);
}
await store.saveCursor(nextCursor);

// Every later sync:
let cursor = await store.loadCursor();
let more = true;
while (more) {
  const changes = await CapacitorHealth.getChanges({ types: TYPES, cursor });
  await store.upsert(changes.upserted);       // samples in their current state
  await store.remove(changes.deleted);        // { type, id, clientId? }
  cursor = changes.nextCursor;
  more = changes.hasMore;
}
await store.saveCursor(cursor);
```

1. **The first call (no cursor) returns no samples**, only a cursor marking "now". Take it before
   reading existing data with `readSamples()`, so nothing written in between is missed (at worst you
   see it twice, which is harmless if you store by id).
2. **Call again while `hasMore` is `true`.** Save the cursor only after you've stored the changes, so
   a crash mid-sync replays them instead of losing them.
3. **A cursor belongs to its list of types.** Using it with a different list rejects with
   `INVALID_ARGUMENT` (`data.reason: 'cursorMismatch'`). To follow a new type, start a new cursor for it (or for the new list) as in
   step 1.

## What you get

- `upserted`: samples added or changed, in their **current** state, in the same shape as
  `readSamples()`.
- `deleted`: `{ type, id }` for each deleted sample, plus `clientId` on iOS when the sample had one.
- `nextCursor`, `hasMore`.

Platform differences to handle:

| | iOS | Android |
|---|---|---|
| An edit | A deletion of the old sample plus a new sample with a **new id** | One upsert, same id |
| Several edits between syncs | Each one | Collapsed into one upsert |
| Page size | `limit` per type (default 1,000) | Health Connect's own |
| Cursor lifetime | Doesn't expire | **Expires after about 30 days unused** |

Because iOS changes ids on edit, match your stored records by `clientId` for samples you wrote, and
by `id` for everything else.

## Expired cursors (Android)

Health Connect drops change tokens that haven't been used for about 30 days. `getChanges()` then
rejects with `CURSOR_EXPIRED`. Recover by starting over: take a new cursor, re-read the range you
care about with `readSamples()`, and reconcile with your store. Syncing at least every few weeks
(for example whenever the app opens) avoids this.

```ts
try {
  changes = await CapacitorHealth.getChanges({ types: TYPES, cursor });
} catch (e) {
  if ((e as HealthError).code === 'CURSOR_EXPIRED') return fullResync();
  throw e;
}
```

## Your own writes

`excludeOwnWrites: true` leaves out upserts your app made, which you usually already have.
Deletions are always reported: neither platform says who deleted a sample.

## Series records (Android)

A deleted Health Connect series record (`heartRate`, `speed`, `power`, cadence) is reported once,
with the record's id. Drop the samples whose `id` or `seriesId` matches it.

## Menstruation periods

On iOS, periods are derived from flow samples, so `menstruationPeriod` can't be followed directly
and rejects with `UNSUPPORTED_TYPE` (`data.reason: 'derivedType'`) in `getChanges()`. Follow `menstrualFlow` instead and re-read
the periods around the days that changed with `readSamples({ type: 'menstruationPeriod', … })`. On
Android, `menstruationPeriod` is a real record and can be followed. See
[Reproductive health](reproductive-health.md).

## Permissions

`getChanges()` needs read access to every type in the list. On iOS, changes to types the user
didn't allow reading simply never appear. On Android, a missing permission rejects with
`PERMISSION_DENIED`; without `READ_HEALTH_DATA_HISTORY`, changes to data older than 30 days before
the first grant may not be reported.
