# Testing your integration

Health integrations fail in ways unit tests don't catch: permission sheets that never appear, empty
reads that are really denials, time-zone off-by-ones, double-counted steps. Test on a simulator or
emulator during development, and on real devices before you ship.

## iOS simulator

- **HealthKit works on the simulator**, and the simulator has the Health app: add data by hand
  there, and check what your app wrote (Browse → a category → Show All Data → the data source).
- Data that only comes from Apple Watch (wrist temperature, heart-rate variability) can't be
  generated, but your app can write the writable ones.
- **Resetting permissions**: uninstall the app (`xcrun simctl uninstall <udid> <bundle-id>`) and
  install it again; the sheet then shows again on the next request. `xcrun simctl privacy` has no
  HealthKit service, and erasing the simulator also works.
- **iOS 27 limited history** (the sheet's "Past 30 Days" option) needs an iOS 27 simulator runtime.
- **JavaScript console output** from Capacitor goes to stdout: launch with
  `xcrun simctl launch --console-pty <udid> <bundle-id>` to see it.

## Android emulator

- Use an **API 34 or later** system image: Health Connect is built in (Settings → Security &
  privacy → Privacy → Health Connect). For Android 9–13, use a **Google Play** system image and
  install Health Connect from the Play Store.
- **Seed data** with Google's Health Connect Toolbox app, or with your app.
- **Granting without the dialog** (Android 14+):
  `adb shell pm grant <package> android.permission.health.READ_STEPS`. On Android 13 and lower,
  Health Connect keeps the grants itself, so `pm grant` doesn't work there.
- **Revoking**: Health Connect → App permissions → your app, or
  `adb shell pm revoke <package> android.permission.health.READ_STEPS` (Android 14+).
- **The dialog stops appearing after two refusals.** Reset it with
  `adb shell pm clear-permission-flags <package> android.permission.health.<PERM> user-set user-fixed`.
- **Aggregates come back empty for an app granted through `pm grant`**: such an app isn't on Health
  Connect's data-source priority list yet. Open Health Connect → Manage data → Data sources and
  priority once, or grant through the dialog.
- `adb shell pm clear com.google.android.apps.healthdata` wipes the Health Connect app's data and
  grants on Android 13 and lower.

## Data from other apps

Many behaviours only show with data from more than one app: merged periods, deletes skipping
other apps' samples, aggregates removing overlap. On Android, an easy second app is a copy of your
own app built with a different application id. On iOS, write data by hand in the Health app
(its source is "Health").

## Real devices

Before you ship, run through your features on at least one iPhone and one Android phone. Some
behaviour only shows on hardware:

- Apple Watch and Wear OS data: series and watch-recorded samples, steps from phone and watch over
  the same hours (`aggregate()` must not double-count).
- Real third-party sources writing to Apple Health and Health Connect (other cycle trackers,
  Samsung Health).
- The permission flows as users see them.

## Testing a local build of the plugin

To try an unreleased build of the plugin inside your app, install it from a tarball:

```bash
# in the plugin's checkout
npm pack
```

```bash
# in your app
npm install ../capacitor-health/caplugins-capacitor-health-0.1.0.tgz
npx cap sync
```

Prefer a tarball over `npm link`: links confuse Capacitor's native project resolution.

## The example app

The repository's [`example-app/`](../example-app) exercises every call on both platforms: availability,
permissions, reading, writing and deleting, changes, aggregates, a test-data seeder, and scripted
checks that print `PASS` / `FAIL`. It's a good reference for wiring, and a quick way to see how a
device behaves. See its [README](../example-app/README.md).
