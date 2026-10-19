# Privacy and store review

Health data gets extra scrutiny from Apple, Google, regulators and users, and reproductive data
most of all. This page lists what the plugin guarantees, and what your app must do to pass review.
It isn't legal advice: check the current guidelines and your own obligations.

## What the plugin guarantees

- **No network calls, no analytics, no storage of its own.** Health data only goes where your app
  sends it.
- **No health values in logs**, unless you turn on `debugLogging` (for debugging only).
- **No permissions declared for you.** On Android the plugin's manifest has no health permissions;
  your app only gets what it declares and asks for.
- **No crash on a missing declaration.** A missing `Info.plist` string or manifest permission
  rejects with `MISSING_DECLARATION` instead of terminating the app.
- Nothing stored in iCloud (nothing stored at all).

## Capacitor's own logging

**Capacitor logs every plugin call's arguments and results in debug builds**, health values
included, to the Xcode console and logcat. Keep `loggingBehavior` at its default (`"debug"`) so
release builds don't log, or set it to `"none"` in `capacitor.config` to silence it everywhere.

## App Store

1. **HealthKit capability and usage strings**: see [iOS setup](setup-ios.md). Usage strings must
   say specifically what your app does with the data.
2. **Guideline 2.5.1**: use HealthKit for health and fitness purposes, and **mention the Health
   integration** in your App Store description and in your UI.
3. **Guideline 5.1.3**:
   - no advertising, marketing or data-mining use of health data, and no disclosure to third
     parties without the user's consent;
   - don't write false or inaccurate data into HealthKit;
   - **don't store personal health information in iCloud**.
4. **A privacy policy** is required for any app using HealthKit.
5. **App Privacy details** (the "nutrition label" in App Store Connect): declare **Health** data if
   anything read from HealthKit leaves the device. Data processed only on the device isn't
   "collected".
6. Don't add `healthkit` to `UIRequiredDeviceCapabilities` unless you want to exclude devices without
   Health; call `isAvailable()` instead.

## Google Play

1. **Declare only the permissions you use**: see [Android setup](setup-android.md). Play rejects
   health permissions that no user-facing feature needs.
2. **Rationale screen with your privacy policy**: the plugin's default screen opens
   `privacyPolicyUrl`. It must be the same policy as your Play listing.
3. **Health apps declaration** (Play Console → App content): list every Health Connect permission
   with a justification tied to a visible feature. "Needed for app functionality" is a known
   rejection reason. Re-file whenever you add or drop a permission. Access is tied to the package
   name, so each package id you ship (for example staging and production) needs its own.
4. **Heightened scrutiny** applies to reproductive health data, and also to blood pressure, skin
   temperature and symptoms. Tie each to a visible feature. Menstrual cycle tracking for wellness is
   an approved use case.
5. **Prohibited**: ads (including personalised ads) based on Health Connect data, selling or
   transferring it to third parties, using it for credit, insurance or employment decisions.
6. **Data safety form**: declare the health data you collect or share. A privacy policy is required
   both in the app and on the listing.

## For apps handling reproductive data

- **Don't forward health data to analytics, advertising or attribution SDKs.** Both Apple (5.1.3)
  and Google's Health Connect policy forbid it, and regulators have acted against cycle-tracking
  apps that did. Check what your SDKs collect automatically (screen names, event parameters).
- **Treat sharing between users as disclosure.** Partner or family features that show one user's
  cycle data to another need explicit, specific consent.
- **Keep debug logging out of release builds**, both the plugin's `debugLogging` and Capacitor's
  `loggingBehavior`.
