# Errors

Every rejection from the plugin has a stable `code`, a `message` that never contains health values,
and optional `data`:

```ts
import { CapacitorHealth, type HealthError } from '@caplugins/capacitor-health';

try {
  await CapacitorHealth.saveSamples({ samples });
} catch (e) {
  const { code, message, data } = e as HealthError;
  switch (code) {
    case 'PERMISSION_DENIED':
      // explain, then offer CapacitorHealth.openHealthSettings()
      break;
    case 'INVALID_ARGUMENT':
      console.warn(`Bad ${data?.field}: ${data?.reason ?? message}`);
      break;
    default:
      throw e;
  }
}
```

## Codes

| Code | When | What to do |
|---|---|---|
| `UNAVAILABLE` | Health data can't be used here: the web, an unsupported device, Android below 9. | Check `isAvailable()` first and hide health features. |
| `NOT_INSTALLED` | Android 9–13: the Health Connect app isn't installed. | `openHealthConnectInstall()` |
| `UPDATE_REQUIRED` | Android: Health Connect is too old. | `openHealthConnectInstall()` |
| `MISSING_DECLARATION` | The app doesn't declare what the call needs: an Android manifest permission or an iOS `Info.plist` usage string. `data.missing` lists what to add. | Fix the app's setup. A development-time error. |
| `PERMISSION_DENIED` | The user hasn't granted the access the call needs. On iOS only for writes: a denied read returns no data instead. | Explain, then `requestAuthorization()` or `openHealthSettings()`. |
| `UNSUPPORTED_TYPE` | The type doesn't exist on this platform, OS version or Health Connect version, or the call doesn't support it (an aggregate-only type in `readSamples()`). `data.reason` says why. | Check `getSupportedTypes()`. |
| `READ_ONLY_TYPE` | Writing a type the platform computes itself. | Don't write it. |
| `INVALID_ARGUMENT` | An argument is malformed or out of range. `data.field` names it (`samples[1].value`), `data.reason` gives a machine-readable reason. | Fix the input. |
| `CURSOR_EXPIRED` | Android: a `getChanges()` cursor wasn't used for about 30 days. | Re-read with `readSamples()` and start a new cursor. See [Syncing](syncing.md#expired-cursors-android). |
| `RATE_LIMITED` | Android: Health Connect's rate limit was hit. | Back off and retry later. |
| `DEVICE_LOCKED` | iOS: the health store is encrypted while the device is locked. | Retry after the user unlocks. |
| `NATIVE_ERROR` | Anything else. `message` carries the platform's message, `data.nativeCode` its code. | Report it. |

## `data`

| Field | |
|---|---|
| `type` | The type the error is about. |
| `field` | The argument at fault, as a path: `samples[2].value`, `metrics[0]`, `cursor`. |
| `reason` | A machine-readable detail (below). |
| `missing` | `MISSING_DECLARATION`: the permissions or `Info.plist` keys to add. |
| `nativeCode` | The platform's own error code, when there is one. |

## Common `reason`s

| Reason | Code | Meaning |
|---|---|---|
| `notOnPlatform`, `osVersion`, `featureUnavailable`, `aggregateOnly` | `UNSUPPORTED_TYPE` | As in `getSupportedTypes()`. |
| `unknownType` | `UNSUPPORTED_TYPE` | Not a type id the plugin knows (a typo, or a type from a newer version). |
| `notAggregatable` | `UNSUPPORTED_TYPE` | `aggregate()` on a type with no aggregates on this platform. |
| `derivedType` | `UNSUPPORTED_TYPE` | iOS: `menstruationPeriod` can't be followed with `getChanges()`. |
| `valueUnsupportedOnPlatform` | `INVALID_ARGUMENT` | A valid value this platform can't store (flow `none` on Android). |
| `outOfRange` | `INVALID_ARGUMENT` | Outside the platform's allowed range. |
| `intervalOnly`, `instantOnly` | `INVALID_ARGUMENT` | The type needs a time range, or a single moment. |
| `wholeNumberOnly` | `INVALID_ARGUMENT` | Android: `steps`, `wheelchairPushes`, `restingHeartRate`. |
| `metricUnsupported` | `INVALID_ARGUMENT` | `aggregate()` metric the type doesn't have. |
| `cursorMismatch` | `INVALID_ARGUMENT` | A cursor used with other types (or another type, for `readSamples()`). |
| `registeredType` | `INVALID_ARGUMENT` | An `hk:` id for a type that has a unified id; `data.type` names it. |

## Validation happens first

Every argument is validated in JavaScript before anything reaches the platform, so mistakes are
caught the same way on both platforms and never reach HealthKit (which terminates apps on some
invalid objects). A batch in `saveSamples()` is validated as a whole: if one sample is invalid,
nothing is written.
