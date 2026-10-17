# Example app

Exercises every method of `@caplugins/capacitor-health` on iOS and Android. Not published to npm.

```bash
npm install
npm run sync      # build the web app and copy it + the plugin into ios/ and android/
npx cap run ios   # or: npx cap run android
```

Rebuild the plugin (`npm run build` in the repo root) before `sync` when you change its TypeScript.
The app id is `com.caplugins.health.example`. iOS has the HealthKit capability and usage strings;
Android declares the Health Connect permissions of every M1 record plus `READ_HEALTH_DATA_HISTORY`,
and sets `privacyPolicyUrl` for the plugin's rationale screen.

## Screens

| Section | What it does |
|---|---|
| Availability | `isAvailable()`, `getSupportedTypes()` |
| Permissions | `requestAuthorization()` for every type (writable ones for write), `checkAuthorization()`, `openHealthSettings()`, `openHealthConnectInstall()` |
| Samples | Pick a type and a range, then `readSamples()` (20 per page, "Next page" follows the cursor), `saveSamples()` (one sample now, a 3-day period for `menstruationPeriod`), `deleteSamples()` by range or `clientId`, and `getChanges()` without and with a cursor |
| Test data | Seeds a known reproductive dataset over the last 60 days (two periods with daily flow, daily basal body temperature with a luteal rise, ovulation tests, cervical mucus, spotting, sexual activity, and on iOS two symptoms), all with fixed `clientId`s so seeding again upserts; "Delete test data" removes it |
| Checks | Scripted checks that print `PASS` / `FAIL`: round-trip of three types (°C and °F), `getChanges`, periods (write, read back as one, shorten), sleep (write a staged night, read it back, time asleep, `getChanges`, re-write shorter and back; it also lists every session of the last 36 hours), and the per-type acceptance run behind [docs/acceptance/m1.md](../docs/acceptance/m1.md) |

Every check logs `[example] …` lines to the console (Xcode / `xcrun simctl launch --console-pty`, or
logcat's `Capacitor/Console`), and `window.example` exposes them for DevTools / Web Inspector:
`await window.example.runAcceptance('granted')`.
