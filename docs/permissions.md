# Permissions

HealthKit and Health Connect both ask the user per type, separately for reading and writing, and
both let the user change their mind at any time in system settings. They differ in what they tell
your app afterwards. This page covers both, and how to write code that works with each.

## Requesting access

```ts
const result = await CapacitorHealth.requestAuthorization({
  read: ['menstrualFlow', 'menstruationPeriod', 'basalBodyTemperature', 'steps'],
  write: ['menstrualFlow', 'menstruationPeriod'],
  android: { history: true }, // optional, Android only
});

result.read;  // { menstrualFlow: 'unknown', … } on iOS, { menstrualFlow: 'granted', … } on Android
result.write; // { menstrualFlow: 'granted', menstruationPeriod: 'notGranted' }
```

- Ask for what a feature needs, when the user reaches that feature, rather than everything at
  launch. Both stores' reviewers look for this, and users grant more when they see why.
- Types the device doesn't have come back `unsupported` and aren't requested. The call doesn't fail.
- Read-only types (Apple-computed ones like `wristTemperature`) in `write` reject with
  `READ_ONLY_TYPE`.
- A missing `Info.plist` string or manifest permission rejects with `MISSING_DECLARATION` before
  anything is shown. See [iOS setup](setup-ios.md) and [Android setup](setup-android.md).
- iOS shows its sheet only for types it hasn't asked about yet; Android only for permissions not yet
  granted. Calling `requestAuthorization()` again for the same types is harmless.

`checkAuthorization()` takes the same `read` / `write` lists and returns the same result without
showing anything.

## Statuses

| Status | Meaning |
|---|---|
| `granted` | The platform confirms access. |
| `notGranted` | The platform confirms there's no access. On Android this covers both "never asked" and "refused". |
| `notDetermined` | iOS only. Your app hasn't asked for this type yet, so `requestAuthorization()` will show the sheet. |
| `unknown` | iOS read access after your app has asked. See below. |
| `unsupported` | The type doesn't exist on this device. Nothing was requested. |

## iOS

**iOS never tells apps whether read access was granted.** This is a HealthKit privacy rule, not a
plugin limitation: an app must not be able to infer, for example, that a user is pregnant because
reading pregnancy data was denied. So:

- Read status is `notDetermined` before you ask and `unknown` after. It is **never** `granted`.
- A read the user denied returns **no data**, exactly like a type with no data. It doesn't reject.
- Write status is exact: `granted` or `notGranted`.

Design for this: treat empty results as "nothing to show", never as proof of a denial, and don't
nag. If your feature clearly expects data and finds none, a gentle hint that access can be changed
in the Health app is fine.

**iOS 27 limited history.** On iOS 27 users can share only recent history (for example the past 30
days). `result.earliestAuthorizedDates` then holds, per type, the date the shared history starts.
Data before that date is hidden from your app, not absent. Your app's own samples stay readable.

**Blood pressure** is authorized as its two member types (systolic and diastolic). HealthKit's sheet
shows them as "Blood Pressure".

## Android

- **Grants are exact**: `granted` or `notGranted`, for reads and writes.
- **Health Connect stops showing its dialog after the user refuses twice.** `requestAuthorization()`
  then returns at once with nothing new granted. When a feature needs a permission that is still
  `notGranted` after you asked, explain why and offer `openHealthSettings()`, which opens Health
  Connect's settings. Users find your app under **App permissions**.
- **History**: by default, apps can only read data from the 30 days before they were first granted
  access. Pass `android: { history: true }` (and declare `READ_HEALTH_DATA_HISTORY`) to ask for
  everything. `result.historyGranted` tells you whether it was granted.
- **Background reads**: `android: { background: true }` asks for `READ_HEALTH_DATA_IN_BACKGROUND`,
  for apps that schedule their own background work. `result.backgroundGranted` reports it.
  `getSupportedTypes().android` says whether this device's Health Connect supports either option.
- **One dialog per call.** Reopening your app from its launcher icon while the dialog is open closes
  the dialog (Capacitor's `singleTask` activity); the call then resolves with what was granted.
- **Users can revoke access at any time** in Health Connect's settings, without your app being
  restarted. Calls that need a revoked permission reject with `PERMISSION_DENIED`.

## Opening settings

```ts
await CapacitorHealth.openHealthSettings();
```

- **iOS** opens the Health app. Users find your app under **Profile → Apps**.
- **Android** opens Health Connect's settings.

## A pattern that works on both

```ts
import { CapacitorHealth, type HealthType } from '@caplugins/capacitor-health';

async function ensureAccess(read: HealthType[], write: HealthType[] = []) {
  const { read: r, write: w } = await CapacitorHealth.requestAuthorization({ read, write });

  // Writes: exact on both platforms.
  const missingWrites = write.filter((t) => w[t] === 'notGranted');

  // Reads: exact on Android; on iOS 'unknown' means "asked", so just try reading.
  const missingReads = read.filter((t) => r[t] === 'notGranted');

  return { missingReads, missingWrites };
}
```

When something is missing, show your own explanation with a button calling
`openHealthSettings()`, rather than calling `requestAuthorization()` in a loop.
