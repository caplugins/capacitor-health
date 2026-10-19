# Android setup

The plugin uses Google **Health Connect** through `androidx.health.connect:connect-client` 1.1.0.
Health Connect runs on **Android 9 (API 28) and later**: it's part of the system from Android 14,
and a separate app from Google Play on Android 9–13.

## 1. Declare the permissions you use

The plugin declares **no** health permissions. Add the ones your features need to
`android/app/src/main/AndroidManifest.xml`, and only those: Google Play rejects health permissions
that no user-facing feature needs.

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.health.READ_MENSTRUATION" />
    <uses-permission android:name="android.permission.health.WRITE_MENSTRUATION" />
    <uses-permission android:name="android.permission.health.READ_OVULATION_TEST" />
    <uses-permission android:name="android.permission.health.WRITE_OVULATION_TEST" />

    <!-- Optional: data from before the 30 days preceding the first grant -->
    <uses-permission android:name="android.permission.health.READ_HEALTH_DATA_HISTORY" />
    <!-- Optional: only if your app reads in its own background work -->
    <uses-permission android:name="android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND" />
    …
</manifest>
```

Every type's read and write permission is listed in [Supported types](supported-types.md). Some
types share one: `menstrualFlow` and `menstruationPeriod` both use `READ_MENSTRUATION` /
`WRITE_MENSTRUATION`.

When you request a type whose permission isn't declared, `requestAuthorization()` rejects with
`MISSING_DECLARATION` and `data.missing` lists the permissions to add. Nothing is requested in that
case.

## 2. Set your privacy policy URL

Health Connect only shows its permission dialog to apps that have a **permissions-rationale
screen**, and links to that screen from the dialog. The plugin ships a default screen, which opens
your privacy policy in the browser. Set its URL in `capacitor.config.ts` (or `.json`):

```ts
const config: CapacitorConfig = {
  plugins: {
    CapacitorHealth: {
      privacyPolicyUrl: 'https://example.com/privacy',
    },
  },
};
```

Use the same policy as your Play Store listing. Without the setting, the screen closes straight
away; the permission dialog still shows, but its privacy-policy link leads nowhere.

### Using your own rationale screen

To show your own screen instead, remove the plugin's in your app's manifest and declare yours with
the same intent filters:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
    <application>
        <activity android:name="com.caplugins.health.PermissionsRationaleActivity" tools:node="remove" />
        <activity-alias android:name="com.caplugins.health.ViewPermissionUsageActivity" tools:node="remove" />

        <!-- Your screen. Android 13 and lower: -->
        <activity android:name=".PrivacyPolicyActivity" android:exported="true">
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
        </activity>
        <!-- Android 14 and higher: -->
        <activity-alias
            android:name=".ViewPermissionUsageActivity"
            android:exported="true"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE"
            android:targetActivity=".PrivacyPolicyActivity">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
    </application>
</manifest>
```

## 3. Check the SDK levels

Health Connect's library needs:

| Setting (`android/variables.gradle`) | Needed | New Capacitor 8 apps |
|---|---|---|
| `compileSdkVersion` | 36 or later | 36 ✓ |
| Android Gradle Plugin | 8.9.1 or later | ✓ |
| `minSdkVersion` | **26** or later | 24 ✗ |

Capacitor 8 apps start at `minSdkVersion` 24, so the manifest merge fails until you either:

- raise `minSdkVersion` to 26 in `android/variables.gradle` (simplest), or
- keep 24 and add this to your app's manifest; the plugin never touches Health Connect below API 28:

  ```xml
  <uses-sdk tools:overrideLibrary="androidx.health.connect.client,com.caplugins.health" />
  ```

Below Android 9, `isAvailable()` reports `notSupported` and every other call rejects with
`UNAVAILABLE`.

### Overriding dependency versions

The plugin reads these from your app's `android/variables.gradle` `ext` block, falling back to
its defaults:

| Variable | Default |
|---|---|
| `androidxHealthConnectVersion` | `1.1.0` |
| `kotlinxCoroutinesVersion` | `1.10.2` |
| `androidxCoreKTXVersion` | `1.17.0` |
| `androidxAppCompatVersion` | `1.7.1` |

The plugin is built and tested against `connect-client` 1.1.0. Newer 1.2 alpha versions need
`compileSdk` 37 and AGP 9.1.

## 4. Handle Health Connect not being installed (Android 9–13)

On Android 14 and later Health Connect is always there. On Android 9–13 users may not have the app,
or may have an old version:

```ts
const { available, status } = await CapacitorHealth.isAvailable();
if (status === 'notInstalled' || status === 'updateRequired') {
  // Explain why, then:
  await CapacitorHealth.openHealthConnectInstall(); // opens Health Connect in the Play Store
}
```

Calls made while it's missing reject with `NOT_INSTALLED` or `UPDATE_REQUIRED`. Some types depend on
features newer than the installed Health Connect: `skinTemperature`, for example, is only available
on Android 14 and later. Those report `supported: false` with `reason: 'featureUnavailable'` in
`getSupportedTypes()`.

## Things to know on Android

- **Grants are exact**, but `notGranted` doesn't say whether the user was never asked or refused.
- **The permission dialog stops appearing after the user refuses twice.** See
  [Permissions](permissions.md#android).
- **Data from before the first grant:** without `READ_HEALTH_DATA_HISTORY`, apps can only read data
  from the 30 days before they were first granted access.
- **Reading in the background:** on Android 14 and later, an app in the background can only read
  its own records unless it holds `READ_HEALTH_DATA_IN_BACKGROUND`. The plugin doesn't run any
  background work itself.
- **Rate limits:** Health Connect limits how often an app can call it. When the limit is hit,
  calls reject with `RATE_LIMITED`; back off and try later.

## Google Play review

Before you submit, read [Privacy and store review](privacy-and-store-review.md#google-play). You
must fill in the **Health apps declaration** in the Play Console, justifying every Health Connect
permission with a visible feature.
