# CLAUDE.md: @caplugins/capacitor-health

A Capacitor 8 plugin for **Apple HealthKit (iOS) and Google Health Connect (Android)** that covers
**every data type both platforms offer, read and write**, with reproductive / cycle health as a
first-class citizen. Public MIT package on npm under `@caplugins` (same scope as
`@caplugins/capacitor-meta-sdk` and `@caplugins/capacitor-clevertap`); repo
`caplugins/capacitor-health` on GitHub.

**Status (2026-10-17): M0 nearly done (spikes and registry in; T10 closes it).** The next piece of
work is always the first unchecked task in [docs/tasks.md](docs/tasks.md).

## Read first

| File | Read it when… |
|---|---|
| [docs/01-background.md](docs/01-background.md) | you need the why: the gap in existing plugins, what to borrow, house style |
| [docs/02-requirements.md](docs/02-requirements.md) | you're deciding scope: product decisions D1–D5, requirements R1–R18, open questions |
| [docs/03-architecture.md](docs/03-architecture.md) | you're writing code: registry, data model, API draft, per-platform notes |
| [docs/04-type-mapping.md](docs/04-type-mapping.md) | you're adding or mapping a type (HealthKit ⇄ Health Connect) |
| [docs/tasks.md](docs/tasks.md) | you're picking the next piece of work: the first unchecked task |
| [docs/05-roadmap.md](docs/05-roadmap.md) | you need a milestone's scope (M0 → M4) |
| [docs/06-testing.md](docs/06-testing.md) | you're testing: unit, fixtures, simulator/emulator recipes, testing inside a real app |
| [docs/07-store-compliance.md](docs/07-store-compliance.md) | you're writing setup docs or touching permissions, entitlements, manifests |
| [docs/decisions.md](docs/decisions.md) | before re-opening a design question. Append every decision you make |
| [docs/reference/](docs/README.md#reference-raw-facts-with-sources) | raw facts: HealthKit catalog (generated from the iOS 27 SDK), Health Connect catalog and policy, HealthKit behaviour and Capacitor scaffolding, prior art |

## Standing rules

- **App-agnostic.** No consuming app's names, ids, paths, copy or assumptions anywhere in this
  repo: code, README, docs, tests or fixtures. How a specific app integrates the plugin belongs in
  that app's repo.
- **The plugin has no sync policy** (decision D4): no scheduling, caching, conflict resolution or
  background work unless a later milestone explicitly adds it. Provide primitives.
- **Never declare health permissions in the plugin's AndroidManifest.** Apps declare what they use;
  the plugin checks at runtime and fails with `MISSING_DECLARATION`.
- **Never log health values**, in native or JS code, except behind the opt-in `debugLogging` config
  flag. No analytics, no network calls.
- **Every type goes through the registry.** Don't hand-code a type in a bridge method. Edit
  `registry/types.json`, run `npm run registry:gen`, commit the generated files; never edit those by
  hand. If a type needs bespoke logic (workouts, sleep, menstruation periods, correlations), put it
  in the `Special/` area and still register it (kind `special`).
- **Gate by OS version.** iOS floor is 15.0; any newer HealthKit symbol must sit inside
  `if #available`. Android gates newer records with Health Connect feature checks.
- **iOS read permission is unknowable.** Never write code or docs that claim to know whether
  HealthKit read access was granted.
- **Facts marked [verify] in the docs are unconfirmed.** Confirm against the SDK, the docs or a
  device before relying on them, then remove the tag and note the source.
- When a design question gets settled, record it in [docs/decisions.md](docs/decisions.md) and
  update the doc it came from. Keep `docs/` current: it's the design record, not a scratchpad.

## Conventions (match `~/opensource/capacitor-clevertap`, the newest @caplugins plugin)

- Layout: `src/` (TS + `definitions.ts` as docgen source), `ios/Sources/CapacitorHealthPlugin`,
  `ios/Tests/…`, `android/src/main/kotlin/com/caplugins/health`, `example-app/`.
- iOS ships **both** `Package.swift` (SPM) and `CapluginsCapacitorHealth.podspec` (CocoaPods
  is still common in existing Capacitor apps; new Capacitor 8 apps default to SPM).
- Android in **Kotlin** (scaffold with `--android-lang kotlin`), coroutines, never `runBlocking`.
  `androidx.health.connect:connect-client` pinned to **1.1.0**, plugin `minSdk 26`. Dependency
  versions overridable from the app's `variables.gradle` `ext` (see how the CleverTap plugin reads
  `rootProject.ext`).
- Scripts: `build` (clean → docgen → tsc → rollup), `verify` (`registry:check`, `verify:ios`,
  `verify:android`, `verify:web`), `lint`, `fmt`, `registry:gen` / `registry:check` /
  `registry:coverage`. Ionic eslint / prettier (+ java plugin) / swiftlint configs.
- `peerDependencies`: `@capacitor/core ^8.0.0`. Author `Vish <hello@iamvishnu.dev>`, MIT,
  `publishConfig.access: public`, CHANGELOG kept per release.
- Commits: conventional style (`feat(ios): …`, `fix(android): …`, `docs: …`).
- Package manager: **npm** inside this repo (matches the template and the CleverTap plugin).

## Environment facts

- Xcode with the **iOS 27.0 SDK** is installed. Regenerate the HealthKit catalog with
  `python3 scripts/healthkit-catalog.py "$(xcrun --sdk iphoneos --show-sdk-path)/System/Library/Frameworks/HealthKit.framework/Headers"`.
- iOS simulators: iPhone 17 Pro on iOS 27.0 (`npm run test:ios` default) and on iOS 26.5. Android
  AVD: `Pixel_7_Pro_API_34` (no lock screen; start it with a window). More recipes in
  [docs/06-testing.md](docs/06-testing.md).
- Gradle needs JDK 21: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
  and `ANDROID_HOME=~/Library/Android/sdk` (the shell default is JDK 17).
- `xcodebuild` without `-packageAuthorizationProvider netrc` hangs at "Resolve Package Graph" on a
  github.com keychain prompt. The npm iOS scripts pass the flag; pass it in ad-hoc commands too.
- To try the plugin inside a real app, install it from an `npm pack` tarball, not a link (links
  confuse Capacitor's native project resolution).
- `~/Downloads` is blocked by macOS privacy even unsandboxed: ask the user to move files into the
  repo instead.
