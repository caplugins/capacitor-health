# Coming from another health plugin

If your app used another HealthKit or Health Connect plugin, these are the differences to plan for.

## Concepts

| | Other plugins (typically) | This plugin |
|---|---|---|
| Types | HealthKit identifiers or Health Connect record names, different per platform | One camelCase id on both (`menstrualFlow`, `basalBodyTemperature`). See [Supported types](supported-types.md). |
| Values | Platform integers (`HKCategoryValueMenstrualFlow.heavy` = 4, `FLOW_HEAVY` = 3) | Names: `unspecified \| light \| medium \| heavy \| none`; an LH-surge ovulation test is `lhSurge`. Health Connect's `RESULT_HIGH` reads as `estrogenSurge`. |
| Dates | Epoch milliseconds or `Date` objects | ISO 8601 strings with an offset |
| Periods | Android only, or not at all | `menstruationPeriod` on both platforms. See [Reproductive health](reproductive-health.md). |
| Totals | Sum of raw samples | `aggregate()`, with the platform's overlap removal |
| Incremental sync | Re-read everything | `getChanges()` with a cursor |
| Android permissions | Declared by the plugin | Declared by your app, only the ones you use |

## Migrating stored data

- **Upserts use `clientId` / `clientVersion`**, which are HealthKit's sync identifier and version and
  Health Connect's `clientRecordId` and version. If your previous plugin set those, samples you wrote
  before keep their `clientId` and re-writing them updates rather than duplicates. If it didn't,
  re-syncing data you wrote earlier creates duplicates. Delete your app's old samples first
  (`deleteSamples` with a range), or match them by date and value before writing.
- **Ids are the platforms' own** (HealthKit UUIDs, Health Connect record ids), so ids you stored from
  another plugin usually still match. On iOS an updated sample gets a new id; see
  [Reading and writing](reading-and-writing.md#idempotent-writes-with-clientid).
- **Android permissions**: copy the `<uses-permission>` entries for the types you use into your app's
  manifest, and remove any the previous plugin's setup added that you no longer need. Add the
  [rationale screen URL](setup-android.md#2-set-your-privacy-policy-url).

## Uninstalling the previous plugin

Remove it with your package manager and run `npx cap sync` so its native code is dropped from the
iOS and Android projects. If you added the previous plugin's permissions-rationale
activity to your Android manifest by hand, remove it: this plugin brings its own.
