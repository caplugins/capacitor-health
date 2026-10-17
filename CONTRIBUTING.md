# Contributing

The design record lives in [`docs/`](docs/README.md); the next piece of work is the first unchecked
task in [`docs/tasks.md`](docs/tasks.md). Read [`CLAUDE.md`](CLAUDE.md) for the standing rules
(no health permissions in the plugin manifest, no logging of health values, every type goes
through the registry, gate by OS version).

## Setup

```bash
npm install
```

To build the native code you also need:

- **Android:** JDK 21 and the Android SDK. Android Studio's bundled JDK works:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` and
  `export ANDROID_HOME="$HOME/Library/Android/sdk"` (or an `android/local.properties` with `sdk.dir`).
- **iOS:** Xcode 26 or later (the plugin is built against the iOS 27 SDK) and an iPhone 17 Pro
  simulator on the latest runtime, or set `IOS_DESTINATION` (see below).
- **SwiftLint:** `brew install swiftlint`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Compiles `src/` to `dist/` and regenerates the API section of `README.md` from the JSDoc in `src/definitions.ts`. |
| `npm test` | TypeScript unit tests (Vitest, `src/**/*.test.ts`). |
| `npm run test:ios` | XCTest on a simulator. Defaults to `iPhone 17 Pro` on the latest runtime; override with `IOS_DESTINATION="platform=iOS Simulator,id=<udid>"`. |
| `npm run test:android` | JUnit tests (`android/src/test`), using `FakeHealthConnectClient` from `connect-testing`. |
| `npm run verify` | Builds the web, Android and iOS code (Android also runs its unit tests). Run it before opening a PR. Also per platform: `verify:web`, `verify:android`, `verify:ios`. |
| `npm run lint` / `npm run fmt` | Checks / fixes formatting with ESLint, Prettier and SwiftLint. |

The iOS scripts pass `-packageAuthorizationProvider netrc` so Swift Package resolution doesn't wait
on a keychain prompt for github.com credentials. The only package dependency is public.

## Making changes

- **Docs:** edit the JSDoc in `src/definitions.ts`, then run `npm run build`. Don't edit the API
  section of `README.md` by hand; it's between the `docgen` markers and gets overwritten.
- **Adding a method:** add it to `src/definitions.ts`, `src/web.ts`, `CapacitorHealthPlugin.kt` (as a
  `@PluginMethod`) and `CapacitorHealthPlugin.swift` (both the method and the `pluginMethods`
  list). A method missing from one platform rejects with "not implemented" at runtime.
- **Adding a type:** add it to [`registry/types.json`](registry/types.json) (format:
  [`registry/schema.json`](registry/schema.json)), not to a bridge method, then run
  `npm run registry:gen` and commit the generated files. `npm test` and `npm run test:ios` check the
  entry against the schema and the HealthKit SDK; `npm run registry:coverage` shows what's left. See
  [`docs/04-type-mapping.md`](docs/04-type-mapping.md) and the per-type acceptance checklist in
  [`docs/06-testing.md`](docs/06-testing.md).
- **Android plugin methods must not throw.** Capacitor rethrows exceptions from `@PluginMethod`s on
  its plugin thread, which crashes the app. Catch and `call.reject(...)` with an error code instead.
- **Dependency versions:** Android defaults are in the `ext` block of `android/build.gradle` and can
  be overridden from an app's `variables.gradle`. `connect-testing` pins its own `connect-client`
  version, so bump the two together; `HealthConnectTestingSmokeTest` fails if they drift apart.
- **Commits:** conventional style (`feat(ios): …`, `fix(android): …`, `docs: …`).

## Releasing

1. Update `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Run `npm run verify`, `npm run lint` and the tests.
3. Publish. `prepublishOnly` runs the build first.

   ```bash
   npm publish
   ```

4. Tag the release and push the tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
