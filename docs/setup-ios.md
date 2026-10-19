# iOS setup

The plugin uses Apple **HealthKit**. It runs on **iOS 15 and later**, builds with **Xcode 27 or
later** (it uses iOS 27 SDK APIs, guarded by availability checks), and works with both Swift
Package Manager (the default for new Capacitor 8 apps) and CocoaPods. `npx cap sync` wires up
whichever one your app uses; there is nothing to add to a `Podfile` or to Xcode's package list by
hand.

## 1. Add the HealthKit capability

In Xcode, select your app target → **Signing & Capabilities** → **+ Capability** → **HealthKit**.

This adds the `com.apple.developer.healthkit` entitlement to your `.entitlements` file (and
`com.apple.developer.healthkit.access` as an empty array). Leave **Clinical Health Records** and
**Background Delivery** unticked: the plugin uses neither, and App Review rejects capabilities an
app doesn't use.

Your App ID in the Apple Developer portal needs HealthKit enabled too. Xcode does this for you with
automatic signing; with manual signing, enable it on the App ID and regenerate the provisioning
profiles.

## 2. Add the usage strings to `Info.plist`

```xml
<key>NSHealthShareUsageDescription</key>
<string>We read your cycle data from Apple Health to show your history and predictions.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>We save the periods and symptoms you log to Apple Health.</string>
```

| Key | Needed to |
|---|---|
| `NSHealthShareUsageDescription` | read any type |
| `NSHealthUpdateUsageDescription` | write any type |

Say specifically what your app does with the data: App Review rejects vague strings ("This app
uses your health data"). HealthKit terminates an app that requests access without the matching
string. The plugin checks first, and `requestAuthorization()` rejects with `MISSING_DECLARATION`
instead, with `data.missing` naming the key to add.

## 3. Check it works

```ts
import { CapacitorHealth } from '@caplugins/capacitor-health';

const { available, status } = await CapacitorHealth.isAvailable();
// iPhone: { available: true, status: 'available' }
```

HealthKit is available on iPhone and on iPad from iPadOS 17. Elsewhere (older iPads, the web)
`isAvailable()` reports `notSupported` and every other call rejects with `UNAVAILABLE`.

## Things to know on iOS

- **Read access is never revealed.** HealthKit doesn't tell apps whether the user allowed reading
  a type. A denied read returns no data, exactly like a type with no data. See
  [Permissions](permissions.md#ios).
- **Types newer than the running iOS** (for example `menopausalState`, iOS 27) report
  `supported: false` with `reason: 'osVersion'` and `minOS` in `getSupportedTypes()`, and reject
  with `UNSUPPORTED_TYPE`. Check `getSupportedTypes()` before showing a feature that depends on one.
- **The health store is encrypted while the device is locked.** Calls made then reject with
  `DEVICE_LOCKED`; try again after the user unlocks.
- **The simulator has HealthKit and the Health app**, so you can develop without a device. See
  [Testing your integration](testing.md#ios-simulator).

## App Store review

Before you submit, read [Privacy and store review](privacy-and-store-review.md#app-store). In short:
mention the Health integration in your App Store description and in your UI, have a privacy policy,
never use health data for advertising, and don't store it in iCloud.
