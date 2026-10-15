# Google Health Connect: facts and full catalog

Researched 2026-10-15 by a research agent in the planning session. Method: npm registry metadata and published tarballs (not READMEs), Apple's documentation JSON, the published `connect-client` AARs on Google Maven, and developer.android.com. Anything not confirmed against a primary source is marked **[unverified]**. Re-check before relying on version numbers; they move.

## C. Google Health Connect

### C1. `androidx.health.connect:connect-client` versions and requirements (from Google Maven artifacts)

| Version | Date | AAR `minSdkVersion` | `minCompileSdk` | min AGP |
|---|---|---|---|---|
| **1.1.0** (latest stable) | 2025-10-08 | **26** | **36** | 8.9.1 |
| 1.2.0-alpha04 / -alpha05 | 2026-04-22 / 2026-08-12 | 26 (the alpha05 notes say "minSdk 24", **contradicting the artifact**) | – | – |
| **1.2.0-alpha06** (latest overall) | 2026-08-26 | **26** | **37** | **9.1.0** |

- Transitive dependencies (alpha06): `kotlinx-coroutines-android` 1.9.0, `kotlin-stdlib` 2.1.20, Guava 32 (android), `androidx.activity` 1.2.0, `core-ktx` 1.12.0.
- **For a typical Capacitor 8 app (compileSdk 36, AGP 8.9–8.13, minSdk often below 26):**
  - Use **1.1.0**.
  - minSdk below 26: either raise the app to 26, or add `<uses-sdk tools:overrideLibrary="androidx.health.connect.client"/>` and never touch HC below API 28.
  - The HC app/module needs **API 28+** ("SDK supports Android 8 (API 26)+, the Health Connect app is only compatible with Android 9 (API 28)+").
  - The Capacitor 8 default app minSdk is 24.
- Release notes, 1.2.x alphas:
  - Skin temperature and mindfulness backwards compatibility (alpha01).
  - ActivityIntensity API (alpha01, Android 14+).
  - `getChanges(token, pageSize)` and richer exercise fields (alpha03).
  - Matchmaking API (alpha04).
- Sources: https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml, https://developer.android.com/jetpack/androidx/releases/health-connect

### C2. Cycle-tracking records (Jetpack 1.1.0+)

| Record | Kind | Key fields / constants | Read permission | Write permission |
|---|---|---|---|---|
| `MenstruationFlowRecord` | Instantaneous | `flow`: FLOW_UNKNOWN, FLOW_LIGHT, FLOW_MEDIUM, FLOW_HEAVY (**no "none"/spotting**) | `android.permission.health.READ_MENSTRUATION` | `android.permission.health.WRITE_MENSTRUATION` |
| `MenstruationPeriodRecord` | Interval | start/end only. The class has a `MAX_DURATION` limit (**[unverified]**, believed to be 31 days) | `READ_MENSTRUATION` (shared) | `WRITE_MENSTRUATION` |
| `IntermenstrualBleedingRecord` | Instantaneous | time only | `…READ_INTERMENSTRUAL_BLEEDING` | `…WRITE_INTERMENSTRUAL_BLEEDING` |
| `CervicalMucusRecord` | Instantaneous | `appearance`: UNKNOWN/DRY/STICKY/CREAMY/WATERY/EGG_WHITE/UNUSUAL; `sensation`: UNKNOWN/LIGHT/MEDIUM/HEAVY | `…READ_CERVICAL_MUCUS` | `…WRITE_CERVICAL_MUCUS` |
| `OvulationTestRecord` | Instantaneous | `result`: POSITIVE/HIGH/NEGATIVE/INCONCLUSIVE | `…READ_OVULATION_TEST` | `…WRITE_OVULATION_TEST` |
| `SexualActivityRecord` | Instantaneous | `protectionUsed`: PROTECTED/UNPROTECTED/UNKNOWN | `…READ_SEXUAL_ACTIVITY` | `…WRITE_SEXUAL_ACTIVITY` |
| `BasalBodyTemperatureRecord` | Instantaneous | `temperature` (Temperature), `measurementLocation` | `…READ_BASAL_BODY_TEMPERATURE` | `…WRITE_BASAL_BODY_TEMPERATURE` |
| `BodyTemperatureRecord` | Instantaneous | temperature, location | `…READ_BODY_TEMPERATURE` | `…WRITE_BODY_TEMPERATURE` |
| `SkinTemperatureRecord` | Interval | `baseline` + list of `deltas`, location (wrist/finger/toe). Gated by `FEATURE_SKIN_TEMPERATURE` | `…READ_SKIN_TEMPERATURE` | `…WRITE_SKIN_TEMPERATURE` |

**Framework-only on Android 17 / API 37 (not in Jetpack 1.2.0-alpha06):**
- `MenstrualCyclePhaseRecord`: interval, per day, `PHASE_FOLLICULAR` / `PHASE_LUTEAL`, "not intended for predictive use". Added API 37 / U-ext 22. Permissions `READ_/WRITE_MENSTRUAL_CYCLE_PHASE`.
- `SymptomRecord`: API 37 / U-ext 21. `SYMPTOM_TYPE_*` (cramps, bloating, acne, breast tenderness, mood change, headache, fatigue, pelvic pain, vaginal dryness and others) and `SEVERITY_MILD/MODERATE/SEVERE/UNSPECIFIED`. **One permission per symptom**, e.g. `READ_SYMPTOM_CRAMPS`.
- `AlcoholConsumptionRecord`: API 37.
- Reaching these from a plugin today would need direct `android.health.connect.HealthConnectManager` framework calls, gated on `SdkExtensions.getExtensionVersion(UPSIDE_DOWN_CAKE) >= 21/22`, until Jetpack adds them **[inference]**.
- Sources: https://developer.android.com/reference/android/health/connect/HealthPermissions, https://developer.android.com/reference/android/health/connect/datatypes/MenstrualCyclePhaseRecord, https://developer.android.com/reference/android/health/connect/datatypes/SymptomRecord

### C3. History limit
- By default an app can read data only from **30 days before any permission was first granted**.
  - Android 14+: no limit on reading **your own** data.
  - Android ≤13: the 30-day limit applies to all data.
- Older reads need `android.permission.health.READ_HEALTH_DATA_HISTORY`, gated by `HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY`.
  - It was added in 1.1.0-alpha10 and extended to Android ≤13 (APK) in 1.1.0-alpha11.
  - In the framework it is API 35 / U-ext 13.
- Uninstalling the app revokes everything; the 30-day window restarts on re-grant.
- Source: https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data

### C4. Background reads
- Uses `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`, gated by `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` via `healthConnectClient.features.getFeatureStatus(...) == FEATURE_STATUS_AVAILABLE`.
- Google's sample uses a `CoroutineWorker` with `PeriodicWorkRequestBuilder(1, HOURS)` and `enqueueUniquePeriodicWork(KEEP)`.
- Without it, reads only work in the foreground. Consider a foreground service for long reads.
- Source: same as C3.

### C5. Changes API
- `getChangesToken(ChangesTokenRequest(recordTypes=…))` then `getChanges(token)`, which returns `changes`, `nextChangesToken` and `hasMore`. Use one token **per data type**, so that a revoked permission does not break all tokens.
- Change types:
  - `UpsertionChange` carries the full record. Skip records whose `dataOrigin` is your own package.
  - `DeletionChange` carries **only the id, not the type**. Store HC ids, or use single-type tokens.
- **An unused token expires within 30 days.** Recovery: re-read the last 30 days and dedupe by id or `clientRecordId`.
- `getChanges(token, pageSize)` was added in 1.2.0-alpha03.
- Writes use `clientRecordId` + `clientRecordVersion` for idempotent upserts. A higher version overwrites the existing record.
- Source: https://developer.android.com/health-and-fitness/guides/health-connect/develop/sync-data

### C6. Availability
- Android 14+: HC is a framework module (it cannot be uninstalled).
- Android 9–13: HC is the Play app `com.google.android.apps.healthdata` (released 2022-11-11).
- Work profiles are not supported.
- `HealthConnectClient.getSdkStatus(context)` returns one of `SDK_UNAVAILABLE`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` or `SDK_AVAILABLE` (constants confirmed in the jar; their int values are **[unverified]**).
- On `PROVIDER_UPDATE_REQUIRED`, Google's sample opens `market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding` with `setPackage("com.android.vending")` and `putExtra("overlay", true)` / `putExtra("callerId", packageName)` (found via search of the get-started doc; **[unverified verbatim]**).
- Sources: https://developer.android.com/health-and-fitness/guides/health-connect/plan/availability, https://developer.android.com/health-and-fitness/health-connect/get-started

### C7. Manifest requirements
```xml
<uses-permission android:name="android.permission.health.READ_MENSTRUATION"/> <!-- etc., one per type -->
<queries><package android:name="com.google.android.apps.healthdata"/></queries>
<!-- Android ≤13 -->
<activity android:name=".PermissionsRationaleActivity" android:exported="true">
  <intent-filter><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/></intent-filter>
</activity>
<!-- Android 14+ -->
<activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"
    android:targetActivity=".PermissionsRationaleActivity"
    android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
  <intent-filter>
    <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
    <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
  </intent-filter>
</activity-alias>
```
- The rationale activity **must show the same privacy policy as the Play listing**.
- Optional onboarding actions: `androidx.health.ACTION_SHOW_ONBOARDING` / `android.health.connect.action.SHOW_ONBOARDING`.
- Plugin note: these manifest entries can live in the plugin's own `AndroidManifest.xml`, which gets merged. cordova-plugin-health does this.
- Source: https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started

### C8. Google Play policy
- Every publish that uses HC types requires the **Health apps declaration** in Play Console → App content.
  - It needs a per-permission justification. "Needed for app functionality" is cited as a denial reason.
  - Request the minimum set of types.
  - Re-file whenever you add or drop a type. A new app version alone does not need re-filing.
  - Access is tied to the package name.
  - The legacy "Health Connect API Request form" users had to migrate by 2025-01-22.
- Approved use cases include "menstrual cycle tracking for wellness".
- **Reproductive health data (`READ_MENSTRUAL_CYCLE_PHASE` named explicitly) is "subject to heightened scrutiny".** You must tie it to a user-facing feature such as fertility tracking.
  - Alcohol, blood pressure, skin temperature and symptoms are in the same bucket.
  - Sexual activity is not called out by name **[unverified whether it's in the heightened list]**.
- Prohibited: ads (including personalised ads), selling or transfer to third parties, use for credit/insurance/employment decisions, headless apps, child-only targeting, cross-platform sync to incompatible platforms.
- A privacy policy is required both in-app and on the listing.
- New "[NEW]" permissions (alcohol, menstrual cycle phase, cough symptom) appear on the policy page. No effective dates were found.
- Sources: https://support.google.com/googleplay/android-developer/answer/12991134, https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access

### C9. Rate limits
- Google documents only **qualitative** limits:
  - Reads/changelog: a periodic limit and a daily limit.
  - Insert/update/delete: periodic and daily call limits plus memory limits for bulk and single inserts.
  - Background is stricter than foreground.
- **No numbers are published.**
- Quota errors surface as `IllegalStateException` in Google's sample ("Backoff"). Default `pageSize` is 1000; paginate with `pageToken` (it can be `""` at the end).
- Prefer aggregates and changelogs; retry writes from the point of failure.
- Source: https://developer.android.com/health-and-fitness/health-connect/rate-limiting

### C10. Kotlin coroutines
- The whole `HealthConnectClient` API is `suspend`, and permissions use the `ActivityResultContract` `PermissionController.createRequestPermissionResultContract()`.
- **Use Kotlin for the Android side.** The Capacitor 8 generator supports `--android-lang kotlin`.
- Recommended structure:
  - A plugin-scoped `CoroutineScope(SupervisorJob() + Dispatchers.Main)`, cancelled in `handleOnDestroy()`.
  - `call.resolve` / `call.reject` from inside coroutines.
  - For permissions, build the intent with `contract.createIntent(context, perms)`, launch it via Capacitor's `startActivityForResult(call, intent, "cb")` with `@ActivityCallback`, then `contract.parseResult(...)`.
- A Java plugin would need `BuildersKt.runBlocking`, which blocks the plugin thread (cordova-plugin-health does this). Avoid it.
- Testing: `androidx.health.connect:connect-testing` provides `FakeHealthConnectClient`.

---


## E. Health Connect full catalog (Jetpack `connect-client` 1.2.0-alpha06; 1.1.0 identical except ActivityIntensity)

The class list and constants come from the AAR. Permission strings come from the `HealthPermission` class and the official data-types table. "Kind" is the record interface implemented. Aggregate metrics are the companion constants found in the jar (they match the official aggregate table).

| Record | Kind | Key fields (units) | READ / WRITE (`android.permission.health.` prefix) | Aggregates | Gate |
|---|---|---|---|---|---|
| ActiveCaloriesBurned | Interval | energy (Energy) | READ/WRITE_ACTIVE_CALORIES_BURNED | ACTIVE_CALORIES_TOTAL | |
| ActivityIntensity | Interval | activityIntensityType (moderate/vigorous) | READ/WRITE_ACTIVITY_INTENSITY | DURATION_TOTAL, INTENSITY_MINUTES_TOTAL, MODERATE_DURATION_TOTAL, VIGOROUS_DURATION_TOTAL | `FEATURE_ACTIVITY_INTENSITY`; **1.2.0-alpha01+ only**; framework API 36 |
| BasalBodyTemperature | Instant | temperature, measurementLocation | READ/WRITE_BASAL_BODY_TEMPERATURE | – | |
| BasalMetabolicRate | Instant | basalMetabolicRate (Power) | READ/WRITE_BASAL_METABOLIC_RATE | BASAL_CALORIES_TOTAL | |
| BloodGlucose | Instant | level (BloodGlucose mmol/L, mg/dL), specimenSource, mealType, relationToMeal | READ/WRITE_BLOOD_GLUCOSE | – | |
| BloodPressure | Instant | systolic/diastolic (Pressure mmHg), bodyPosition, measurementLocation | READ/WRITE_BLOOD_PRESSURE | SYSTOLIC/DIASTOLIC _AVG/_MIN/_MAX | |
| BodyFat | Instant | percentage | READ/WRITE_BODY_FAT | – | |
| BodyTemperature | Instant | temperature, location | READ/WRITE_BODY_TEMPERATURE | – | |
| BodyWaterMass | Instant | mass | READ/WRITE_BODY_WATER_MASS | – | |
| BoneMass | Instant | mass | READ/WRITE_BONE_MASS | – | |
| CervicalMucus | Instant | appearance, sensation | READ/WRITE_CERVICAL_MUCUS | – | |
| CyclingPedalingCadence | Series | samples (rpm) | READ/WRITE_EXERCISE | RPM_AVG/MIN/MAX | |
| Distance | Interval | distance (Length) | READ/WRITE_DISTANCE | DISTANCE_TOTAL | |
| ElevationGained | Interval | elevation (Length) | READ/WRITE_ELEVATION_GAINED | ELEVATION_GAINED_TOTAL | |
| ExerciseSession | Interval | exerciseType, title, notes, segments, laps, route (ExerciseRoute), plannedExerciseSessionId | READ/WRITE_EXERCISE; route: **READ_EXERCISE_ROUTES** / **WRITE_EXERCISE_ROUTE** | EXERCISE_DURATION_TOTAL | |
| FloorsClimbed | Interval | floors | READ/WRITE_FLOORS_CLIMBED | FLOORS_CLIMBED_TOTAL | |
| HeartRate | Series | samples (bpm) | READ/WRITE_HEART_RATE | BPM_AVG/MIN/MAX, MEASUREMENTS_COUNT | |
| HeartRateVariabilityRmssd | Instant | heartRateVariabilityMillis | READ/WRITE_HEART_RATE_VARIABILITY | – | |
| Height | Instant | height (Length) | READ/WRITE_HEIGHT | HEIGHT_AVG/MIN/MAX | |
| Hydration | Interval | volume (Volume) | READ/WRITE_HYDRATION | VOLUME_TOTAL | |
| IntermenstrualBleeding | Instant | – | READ/WRITE_INTERMENSTRUAL_BLEEDING | – | |
| LeanBodyMass | Instant | mass | READ/WRITE_LEAN_BODY_MASS | – | |
| MenstruationFlow | Instant | flow | READ/WRITE_MENSTRUATION | – | |
| MenstruationPeriod | Interval | – | READ/WRITE_MENSTRUATION | – | |
| MindfulnessSession | Interval | mindfulnessSessionType, title, notes | READ/WRITE_MINDFULNESS | MINDFULNESS_DURATION_TOTAL | `FEATURE_MINDFULNESS_SESSION`; framework API 36 |
| Nutrition | Interval | about 40 nutrients (Mass), energy, name, mealType | READ/WRITE_NUTRITION | about 40 `*_TOTAL` (ENERGY_TOTAL, PROTEIN_TOTAL…) | |
| OvulationTest | Instant | result | READ/WRITE_OVULATION_TEST | – | |
| OxygenSaturation | Instant | percentage | READ/WRITE_OXYGEN_SATURATION | – | |
| PlannedExerciseSession | Interval | blocks/steps, exerciseType, completedExerciseSessionId | READ/WRITE_PLANNED_EXERCISE | – | `FEATURE_PLANNED_EXERCISE`; framework API 35 |
| Power | Series | samples (Power W) | READ/WRITE_POWER | POWER_AVG/MIN/MAX | |
| RespiratoryRate | Instant | rate (breaths/min) | READ/WRITE_RESPIRATORY_RATE | – | |
| RestingHeartRate | Instant | beatsPerMinute | READ/WRITE_RESTING_HEART_RATE | BPM_AVG/MIN/MAX | |
| SexualActivity | Instant | protectionUsed | READ/WRITE_SEXUAL_ACTIVITY | – | |
| SkinTemperature | Interval | baseline, deltas, location | READ/WRITE_SKIN_TEMPERATURE | TEMPERATURE_DELTA_AVG/MIN/MAX | `FEATURE_SKIN_TEMPERATURE`; framework API 35 |
| SleepSession | Interval | stages (awake, sleeping, out_of_bed, light, deep, rem, awake_in_bed, unknown), title, notes | READ/WRITE_SLEEP | SLEEP_DURATION_TOTAL | |
| Speed | Series | samples (Velocity) | READ/WRITE_SPEED | SPEED_AVG/MIN/MAX | |
| Steps | Interval | count | READ/WRITE_STEPS | COUNT_TOTAL | |
| StepsCadence | Series | samples (steps/min) | READ/WRITE_STEPS | RATE_AVG/MIN/MAX | |
| TotalCaloriesBurned | Interval | energy | READ/WRITE_TOTAL_CALORIES_BURNED | ENERGY_TOTAL | |
| Vo2Max | Instant | vo2MillilitersPerMinuteKilogram, measurementMethod | READ/WRITE_VO2_MAX | – | |
| Weight | Instant | weight (Mass) | READ/WRITE_WEIGHT | WEIGHT_AVG/MIN/MAX | |
| WheelchairPushes | Interval | count | READ/WRITE_WHEELCHAIR_PUSHES | COUNT_TOTAL | |

**Cross-cutting permissions:** `READ_HEALTH_DATA_HISTORY` and `READ_HEALTH_DATA_IN_BACKGROUND`.

**Other feature flags:** `FEATURE_EXTENDED_DEVICE_TYPES`, `FEATURE_MATCHMAKING`, `FEATURE_PERSONAL_HEALTH_RECORD`.

**Client API (from the jar):**
- Records: `readRecords`, `readRecord`, `insertRecords`, `updateRecords`, `deleteRecords`.
- Aggregates: `aggregate`, `aggregateGroupByDuration`, `aggregateGroupByPeriod`.
- Sync: `getChangesToken`, `getChanges`.
- Feature check and permissions: `getFeatures`, `getPermissionController`.
- Matchmaking: `checkIfMatchmakingIsPossible` / `createMatchmakingIntent` (1.2.0-alpha04+).
- Medical (PHR): `createMedicalDataSource`, `getMedicalDataSources`, `upsertMedicalResources`, `readMedicalResources`, `deleteMedicalResources`.

**Exercise routes:**
- Reading an `ExerciseSessionRecord` returns `ExerciseRouteResult.Data | ConsentRequired | NoData`.
- Without `READ_EXERCISE_ROUTES`, request per-session consent with `ExerciseRouteRequestContract` (launch it with the session id).
- Writing a route needs `WRITE_EXERCISE_ROUTE` together with `WRITE_EXERCISE`.

**Aggregation rules:**
- `aggregate` returns one result for the whole range.
- `aggregateGroupByDuration` takes a `Duration` slicer and accepts Instant or LocalDateTime.
- `aggregateGroupByPeriod` takes a `Period` slicer and **must use LocalDateTime**; Instant throws `IllegalStateException`.
- Empty buckets are omitted.
- `dataOriginFilter` restricts results to given apps.
- **Only Activity and Sleep are deduplicated** using the user's app-priority list. All other types sum across all apps.
- Only the records listed with aggregates above support aggregation. None of the cycle-tracking records do.

**Medical records (PHR/FHIR):**
- **Experimental:** gated by `@ExperimentalPersonalHealthRecordApi` and `FEATURE_PERSONAL_HEALTH_RECORD`.
- Available in Jetpack since 1.1.0-beta02 (2025-04-09), which requires compiling against Android 16. In the framework it is API 36 / U-ext 16.
- FHIR R4 **[unverified]**.
- Permissions: `READ_MEDICAL_DATA_{ALLERGIES_INTOLERANCES, CONDITIONS, LABORATORY_RESULTS, MEDICATIONS, PERSONAL_DETAILS, PRACTITIONER_DETAILS, PREGNANCY, PROCEDURES, SOCIAL_HISTORY, VACCINES, VISITS, VITAL_SIGNS}` plus a single `WRITE_MEDICAL_DATA`. They are shown on a separate permission screen.
- There is no changelog API for medical data yet.
- "The Play Policy for Medical Records access is still being developed."

Sources: https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types, https://developer.android.com/health-and-fitness/guides/health-connect/develop/aggregate-data, https://developer.android.com/health-and-fitness/guides/health-connect/develop/feature-availability, https://developer.android.com/health-and-fitness/health-connect/medical-records, Maven AAR `connect-client-1.2.0-alpha06.aar`.

---

