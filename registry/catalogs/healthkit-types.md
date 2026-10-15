# HealthKit type catalog (iOS 27.0 SDK)

Generated on 2026-10-15 from the Xcode SDK headers on the dev Mac
(`HealthKit.framework/Headers/HKTypeIdentifiers.h` and `HKCategoryValues.h`, **iPhoneOS 27.0 SDK**) by
[`scripts/healthkit-catalog.py`](../../scripts/healthkit-catalog.py). The headers are the source of truth:
regenerate this file whenever Xcode is updated, and diff it to spot new types.

```bash
python3 scripts/healthkit-catalog.py "$(xcrun --sdk iphoneos --show-sdk-path)/System/Library/Frameworks/HealthKit.framework/Headers"
```

(The script prints the identifier tables; the enum table and the "special object types" list below were
added by hand. Re-check them against `HKCategoryValues.h` / `HKTypeIdentifiers.h` too.)

- **iOS** = first iOS version with the identifier. Our floor is iOS 15 (the Capacitor 8 plugin template's deployment target),
  so anything newer needs an `#available` check and must report "unsupported" on older OS versions.
- **Notes** = the header's own comment. For quantity types that's the canonical unit and aggregation
  style (`Cumulative` → sum; `Discrete (Arithmetic|Temporally Weighted|Equivalent Continuous Level)` →
  avg/min/max). For category types it's the value enum (see [Category value enums](#category-value-enums)).
- Totals: 121 quantity, 72 category, 6 characteristic, 2 correlation, 1 document, 2 scored assessment,
  plus the special object types listed at the end.


## Quantity types (121)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Body Measurements | `AppleSleepingWristTemperature` | 16.0 | degC, Discrete (Arithmetic) |
| Body Measurements | `BodyFatPercentage` | 8.0 | %, Discrete (Arithmetic) |
| Body Measurements | `BodyMass` | 8.0 | kg, Discrete (Arithmetic) |
| Body Measurements | `BodyMassIndex` | 8.0 | count, Discrete (Arithmetic) |
| Body Measurements | `ElectrodermalActivity` | 8.0 | S, Discrete (Arithmetic) |
| Body Measurements | `Height` | 8.0 | m, Discrete (Arithmetic) |
| Body Measurements | `LeanBodyMass` | 8.0 | kg, Discrete (Arithmetic) |
| Body Measurements | `WaistCircumference` | 11.0 | m, Discrete (Arithmetic) |
| Fitness | `ActiveEnergyBurned` | 8.0 | kcal, Cumulative |
| Fitness | `AppleExerciseTime` | 9.3 | min, Cumulative |
| Fitness | `AppleMoveTime` | 14.5 | min, Cumulative |
| Fitness | `AppleStandTime` | 13.0 | min, Cumulative |
| Fitness | `BasalEnergyBurned` | 8.0 | kcal, Cumulative |
| Fitness | `CrossCountrySkiingSpeed` | 18.0 | m/s, Discrete (Arithmetic) |
| Fitness | `CyclingCadence` | 17.0 | count/min, Discrete (Temporally Weighted) |
| Fitness | `CyclingFunctionalThresholdPower` | 17.0 | W, Discrete (Arithmetic) |
| Fitness | `CyclingPower` | 17.0 | W, Discrete (Temporally Weighted) |
| Fitness | `CyclingSpeed` | 17.0 | m/s, Discrete (Temporally Weighted) |
| Fitness | `DistanceCrossCountrySkiing` | 18.0 | m, Cumulative |
| Fitness | `DistanceCycling` | 8.0 | m, Cumulative |
| Fitness | `DistanceDownhillSnowSports` | 11.2 | m, Cumulative |
| Fitness | `DistancePaddleSports` | 18.0 | m, Cumulative |
| Fitness | `DistanceRowing` | 18.0 | m, Cumulative |
| Fitness | `DistanceSkatingSports` | 18.0 | m, Cumulative |
| Fitness | `DistanceSwimming` | 10.0 | m, Cumulative |
| Fitness | `DistanceWalkingRunning` | 8.0 | m, Cumulative |
| Fitness | `DistanceWheelchair` | 10.0 | m, Cumulative |
| Fitness | `EstimatedWorkoutEffortScore` | 18.0 | appleEffortScore, Discrete (Arithmetic) |
| Fitness | `FlightsClimbed` | 8.0 | count, Cumulative |
| Fitness | `NikeFuel` | 8.0 | count, Cumulative |
| Fitness | `PaddleSportsSpeed` | 18.0 | m/s, Discrete (Arithmetic) |
| Fitness | `PhysicalEffort` | 17.0 | kcal/(kg*hr), Discrete (Arithmetic) |
| Fitness | `PushCount` | 10.0 | count, Cumulative |
| Fitness | `RowingSpeed` | 18.0 | m/s, Discrete (Arithmetic) |
| Fitness | `RunningPower` | 16.0 | W, Discrete (Arithmetic) |
| Fitness | `RunningSpeed` | 16.0 | m/s, Discrete (Arithmetic) |
| Fitness | `StepCount` | 8.0 | count, Cumulative |
| Fitness | `SwimmingStrokeCount` | 10.0 | count, Cumulative |
| Fitness | `UnderwaterDepth` | 16.0 | m, Discrete (Arithmetic) |
| Fitness | `WorkoutEffortScore` | 18.0 | appleEffortScore, Discrete (Arithmetic) |
| Hearing Health | `EnvironmentalAudioExposure` | 13.0 | dBASPL, Discrete (Equivalent Continuous Level) |
| Hearing Health | `EnvironmentalSoundReduction` | 16.0 | dBASPL, Discrete (Equivalent Continuous Level) |
| Hearing Health | `HeadphoneAudioExposure` | 13.0 | dBASPL, Discrete (Equivalent Continuous Level) |
| Heart | `AtrialFibrillationBurden` | 16.0 | %, Discrete (Temporally Weighted) |
| Heart | `HeartRate` | 8.0 | count/s, Discrete (Temporally Weighted) |
| Heart | `HeartRateRecoveryOneMinute` | 16.0 | count/min, Discrete (Arithmetic) |
| Heart | `HeartRateVariabilityRMSSD` | 27.0 | ms, Discrete (Arithmetic) |
| Heart | `HeartRateVariabilitySDNN` | 11.0 | ms, Discrete (Arithmetic) |
| Heart | `PeripheralPerfusionIndex` | 8.0 | %, Discrete (Arithmetic) |
| Heart | `RestingHeartRate` | 11.0 | count/min, Discrete (Temporally Weighted) |
| Heart | `VO2Max` | 11.0 | ml/(kg*min), Discrete (Arithmetic) |
| Heart | `WalkingHeartRateAverage` | 11.0 | count/min, Discrete (Temporally Weighted) |
| Mobility | `AppleWalkingSteadiness` | 15.0 | %, Discrete (Arithmetic) |
| Mobility | `RunningGroundContactTime` | 16.0 | ms, Discrete (Arithmetic) |
| Mobility | `RunningStrideLength` | 16.0 | m, Discrete (Arithmetic) |
| Mobility | `RunningVerticalOscillation` | 16.0 | cm, Discrete (Arithmetic) |
| Mobility | `SixMinuteWalkTestDistance` | 14.0 | m, Discrete (Arithmetic) |
| Mobility | `StairAscentSpeed` | 14.0 | m/s, Discrete (Arithmetic) |
| Mobility | `StairDescentSpeed` | 14.0 | m/s, Discrete (Arithmetic) |
| Mobility | `WalkingAsymmetryPercentage` | 14.0 | %, Discrete (Arithmetic) |
| Mobility | `WalkingDoubleSupportPercentage` | 14.0 | %, Discrete (Arithmetic) |
| Mobility | `WalkingSpeed` | 14.0 | m/s, Discrete (Arithmetic) |
| Mobility | `WalkingStepLength` | 14.0 | m, Discrete (Arithmetic) |
| Nutrition | `DietaryBiotin` | 8.0 | g, Cumulative |
| Nutrition | `DietaryCaffeine` | 8.0 | g, Cumulative |
| Nutrition | `DietaryCalcium` | 8.0 | g, Cumulative |
| Nutrition | `DietaryCarbohydrates` | 8.0 | g, Cumulative |
| Nutrition | `DietaryChloride` | 8.0 | g, Cumulative |
| Nutrition | `DietaryCholesterol` | 8.0 | g, Cumulative |
| Nutrition | `DietaryChromium` | 8.0 | g, Cumulative |
| Nutrition | `DietaryCopper` | 8.0 | g, Cumulative |
| Nutrition | `DietaryEnergyConsumed` | 8.0 | kcal, Cumulative |
| Nutrition | `DietaryFatMonounsaturated` | 8.0 | g, Cumulative |
| Nutrition | `DietaryFatPolyunsaturated` | 8.0 | g, Cumulative |
| Nutrition | `DietaryFatSaturated` | 8.0 | g, Cumulative |
| Nutrition | `DietaryFatTotal` | 8.0 | g, Cumulative |
| Nutrition | `DietaryFiber` | 8.0 | g, Cumulative |
| Nutrition | `DietaryFolate` | 8.0 | g, Cumulative |
| Nutrition | `DietaryIodine` | 8.0 | g, Cumulative |
| Nutrition | `DietaryIron` | 8.0 | g, Cumulative |
| Nutrition | `DietaryMagnesium` | 8.0 | g, Cumulative |
| Nutrition | `DietaryManganese` | 8.0 | g, Cumulative |
| Nutrition | `DietaryMolybdenum` | 8.0 | g, Cumulative |
| Nutrition | `DietaryNiacin` | 8.0 | g, Cumulative |
| Nutrition | `DietaryPantothenicAcid` | 8.0 | g, Cumulative |
| Nutrition | `DietaryPhosphorus` | 8.0 | g, Cumulative |
| Nutrition | `DietaryPotassium` | 8.0 | g, Cumulative |
| Nutrition | `DietaryProtein` | 8.0 | g, Cumulative |
| Nutrition | `DietaryRiboflavin` | 8.0 | g, Cumulative |
| Nutrition | `DietarySelenium` | 8.0 | g, Cumulative |
| Nutrition | `DietarySodium` | 8.0 | g, Cumulative |
| Nutrition | `DietarySugar` | 8.0 | g, Cumulative |
| Nutrition | `DietaryThiamin` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminA` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminB12` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminB6` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminC` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminD` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminE` | 8.0 | g, Cumulative |
| Nutrition | `DietaryVitaminK` | 8.0 | g, Cumulative |
| Nutrition | `DietaryWater` | 9.0 | mL, Cumulative |
| Nutrition | `DietaryZinc` | 8.0 | g, Cumulative |
| Other | `BloodAlcoholContent` | 8.0 | %, Discrete (Arithmetic) |
| Other | `BloodPressureDiastolic` | 8.0 | mmHg, Discrete (Arithmetic) |
| Other | `BloodPressureSystolic` | 8.0 | mmHg, Discrete (Arithmetic) |
| Other | `InsulinDelivery` | 11.0 | IU, Cumulative |
| Other | `NumberOfAlcoholicBeverages` | 15.0 | count, Cumulative |
| Other | `NumberOfTimesFallen` | 8.0 | count, Cumulative |
| Other | `TimeInDaylight` | 17.0 | min, Cumulative |
| Other | `UVExposure` | 9.0 | , Discrete (Arithmetic) |
| Other | `WaterTemperature` | 16.0 | degC, Discrete (Arithmetic) |
| Reproductive Health | `BasalBodyTemperature` | 9.0 | degC, Discrete (Arithmetic) |
| Respiratory | `AppleSleepingBreathingDisturbances` | 18.0 | count, Discrete (Arithmetic) |
| Respiratory | `ForcedExpiratoryVolume1` | 8.0 | L, Discrete (Arithmetic) |
| Respiratory | `ForcedVitalCapacity` | 8.0 | L, Discrete (Arithmetic) |
| Respiratory | `InhalerUsage` | 8.0 | count, Cumulative |
| Respiratory | `OxygenSaturation` | 8.0 | %, Discrete (Arithmetic) |
| Respiratory | `PeakExpiratoryFlowRate` | 8.0 | L/min, Discrete (Arithmetic) |
| Respiratory | `RespiratoryRate` | 8.0 | count/s, Discrete (Arithmetic) |
| Vital Signs | `BloodGlucose` | 8.0 | mg/dL, Discrete (Arithmetic) |
| Vital Signs | `BodyTemperature` | 8.0 | degC, Discrete (Arithmetic) |

## Category types (72)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Fitness | `AppleStandHour` | 9.0 | HKCategoryValueAppleStandHour |
| Hearing Health | `EnvironmentalAudioExposureEvent` | 14.0 | HKCategoryValueEnvironmentalAudioExposureEvent |
| Hearing Health | `HeadphoneAudioExposureEvent` | 14.2 | HKCategoryValueHeadphoneAudioExposureEvent |
| Heart | `HighHeartRateEvent` | 12.2 | HKCategoryValue |
| Heart | `HypertensionEvent` | 26.2 | HKCategoryValue |
| Heart | `IrregularHeartRhythmEvent` | 12.2 | HKCategoryValue |
| Heart | `LowCardioFitnessEvent` | 14.3 | HKCategoryValueLowCardioFitnessEvent |
| Heart | `LowHeartRateEvent` | 12.2 | HKCategoryValue |
| Mental Wellbeing | `MindfulSession` | 10.0 | HKCategoryValue |
| Mobility | `AppleWalkingSteadinessEvent` | 15.0 | HKCategoryValueAppleWalkingSteadinessEvent |
| Other | `HandwashingEvent` | 14.0 | HKCategoryValue |
| Other | `ToothbrushingEvent` | 13.0 | HKCategoryValue |
| Reproductive Health | `BleedingAfterMenopause` | 27.0 | HKCategoryValueVaginalBleeding |
| Reproductive Health | `BleedingAfterPregnancy` | 18.0 | HKCategoryValueVaginalBleeding |
| Reproductive Health | `BleedingDuringPregnancy` | 18.0 | HKCategoryValueVaginalBleeding |
| Reproductive Health | `CervicalMucusQuality` | 9.0 | HKCategoryValueCervicalMucusQuality |
| Reproductive Health | `Contraceptive` | 14.3 | HKCategoryValueContraceptive |
| Reproductive Health | `InfrequentMenstrualCycles` | 16.0 | HKCategoryValue |
| Reproductive Health | `IntermenstrualBleeding` | 9.0 | HKCategoryValue |
| Reproductive Health | `IrregularMenstrualCycles` | 16.0 | HKCategoryValue |
| Reproductive Health | `Lactation` | 14.3 | HKCategoryValue |
| Reproductive Health | `MenopausalState` | 27.0 | HKCategoryValueMenopausalState |
| Reproductive Health | `MenstrualFlow` | 9.0 | HKCategoryValueVaginalBleeding |
| Reproductive Health | `OvulationTestResult` | 9.0 | HKCategoryValueOvulationTestResult |
| Reproductive Health | `PersistentIntermenstrualBleeding` | 16.0 | HKCategoryValue |
| Reproductive Health | `Pregnancy` | 14.3 | HKCategoryValue |
| Reproductive Health | `PregnancyTestResult` | 15.0 | HKCategoryValuePregnancyTestResult |
| Reproductive Health | `ProgesteroneTestResult` | 15.0 | HKCategoryValueProgesteroneTestResult |
| Reproductive Health | `ProlongedMenstrualPeriods` | 16.0 | HKCategoryValue |
| Reproductive Health | `SexualActivity` | 9.0 | HKCategoryValue |
| Respiratory | `SleepApneaEvent` | 18.0 | HKCategoryValue |
| Sleep | `SleepAnalysis` | 8.0 | HKCategoryValueSleepAnalysis |
| Symptoms | `AbdominalCramps` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Acne` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `AppetiteChanges` | 13.6 | HKCategoryValueAppetiteChanges |
| Symptoms | `BladderIncontinence` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `Bloating` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `BreastPain` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `ChestTightnessOrPain` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Chills` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Constipation` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Coughing` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Diarrhea` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Dizziness` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `DrySkin` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `Fainting` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Fatigue` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Fever` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `GeneralizedBodyAche` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `HairLoss` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `Headache` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Heartburn` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `HotFlashes` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `LossOfSmell` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `LossOfTaste` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `LowerBackPain` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `MemoryLapse` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `MoodChanges` | 13.6 | HKCategoryValuePresence |
| Symptoms | `Nausea` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `NightSweats` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `PelvicPain` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `RapidPoundingOrFlutteringHeartbeat` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `RunnyNose` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `ShortnessOfBreath` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `SinusCongestion` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `SkippedHeartbeat` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `SleepChanges` | 13.6 | HKCategoryValuePresence |
| Symptoms | `SoreThroat` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `VaginalDryness` | 14.0 | HKCategoryValueSeverity |
| Symptoms | `Vomiting` | 13.6 | HKCategoryValueSeverity |
| Symptoms | `Wheezing` | 13.6 | HKCategoryValueSeverity |
| Medication Tracking | `AudioExposureEvent` | 13.0 | **deprecated 14.0** |

## Characteristic types (6)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Me | `ActivityMoveMode` | 14.0 | HKActivityMoveModeObject |
| Me | `BiologicalSex` | 8.0 | HKBiologicalSexObject |
| Me | `BloodType` | 8.0 | HKBloodTypeObject |
| Me | `DateOfBirth` | 8.0 | NSDateComponents |
| Me | `FitzpatrickSkinType` | 9.0 | HKFitzpatrickSkinTypeObject |
| Me | `WheelchairUse` | 10.0 | HKWheelchairUseObject |

## Correlation types (2)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Heart | `BloodPressure` | 8.0 |  |
| Other | `Food` | 8.0 |  |

## Document types (1)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Clinical Documents | `CDA` | 10.0 |  |

## Scored assessment types (2)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Mental Wellbeing | `GAD7` | 18.0 |  |
| Mental Wellbeing | `PHQ9` | 18.0 |  |

## Other sample types (4)

| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |
|---|---|---|---|
| Heart | `HeartbeatSeries` | 13.0 |  |
| Mental Wellbeing | `StateOfMind` | 18.0 |  |
| Medication Tracking | `MedicationDoseEvent` | 26.0 |  |
| Medication Tracking | `UserAnnotatedMedicationConcept` | 26.0 |  |


## Special object types (not plain quantity/category samples)

These identifiers are `NSString` constants, not part of the typed enums above. Each needs its own
read/write code path.

| Identifier | iOS | What it is |
|---|---|---|
| `HKWorkoutTypeIdentifier` | 8.0 | `HKWorkout` (activity type, duration, totals, events, activities). Write with `HKWorkoutBuilder` |
| `HKWorkoutRouteTypeIdentifier` | 11.0 | `HKWorkoutRoute` (CLLocation series attached to a workout). Write with `HKWorkoutRouteBuilder` |
| `HKDataTypeIdentifierHeartbeatSeries` | 13.0 | `HKHeartbeatSeriesSample` (beat-to-beat timestamps) |
| `HKVisionPrescriptionTypeIdentifier` | 16.0 | Glasses / contact-lens prescriptions (per-object authorization) |
| `HKDataTypeIdentifierStateOfMind` | 18.0 | `HKStateOfMind` (valence, labels, associations) |
| `HKMedicationDoseEventTypeIdentifierMedicationDoseEvent` | 26.0 | Medication dose events (read-only for third parties [verify]) |
| `HKDataTypeIdentifierUserAnnotatedMedicationConcept` | 26.0 | The user's medication list (read-only, per-object authorization [verify]) |

Also outside `HKTypeIdentifiers.h`: `HKElectrocardiogramType` (ECG, read-only), `HKAudiogramSampleType`,
`HKClinicalType` (clinical records, separate entitlement), `HKActivitySummaryType`.

## Category value enums

| Enum | iOS | Cases |
|---|---|---|
| `HKCategoryValue` | 9.0 | `NotApplicable`=0 |
| `HKCategoryValueAppetiteChanges` | 13.6 | `Unspecified`=0, `NoChange`=1, `Decreased`=2, `Increased`=3 |
| `HKCategoryValueAppleStandHour` | 9.0 | `Stood`=0, `Idle`=1 |
| `HKCategoryValueAppleWalkingSteadinessEvent` | 15.0 | `InitialLow`=1, `InitialVeryLow`=2, `RepeatLow`=3, `RepeatVeryLow`=4 |
| `HKCategoryValueCervicalMucusQuality` | 9.0 | `Dry`=1, `Sticky`=2, `Creamy`=3, `Watery`=4, `EggWhite`=5 |
| `HKCategoryValueContraceptive` | 14.3 | `Unspecified`=1, `Implant`=2, `Injection`=3, `IntrauterineDevice`=4, `IntravaginalRing`=5, `Oral`=6, `Patch`=7 |
| `HKCategoryValueEnvironmentalAudioExposureEvent` | 14.0 | `MomentaryLimit`=1 |
| `HKCategoryValueHeadphoneAudioExposureEvent` | 14.2 | `SevenDayLimit`=1 |
| `HKCategoryValueLowCardioFitnessEvent` | 14.3 | `LowFitness`=1 |
| `HKCategoryValueMenopausalState` | 27.0 | `Menopause`=1, `Perimenopause`=2, `None`=3 |
| `HKCategoryValueMenstrualFlow` | 9.0 **deprecated** (use `HKCategoryValueVaginalBleeding`) | `Unspecified`=1, `Light`=2, `Medium`=3, `Heavy`=4, `None`=5 (iOS 12) |
| `HKCategoryValueOvulationTestResult` | 9.0 | `Negative`=1, `LuteinizingHormoneSurge`=2 (iOS 13; replaces deprecated `Positive`=2), `Indeterminate`=3, `EstrogenSurge`=4 (iOS 13) |
| `HKCategoryValuePregnancyTestResult` | 15.0 | `Negative`=1, `Positive`=2, `Indeterminate`=3 |
| `HKCategoryValuePresence` | 13.6 | `Present`=0, `NotPresent`=1 |
| `HKCategoryValueProgesteroneTestResult` | 15.0 | `Negative`=1, `Positive`=2, `Indeterminate`=3 |
| `HKCategoryValueSeverity` | 13.6 | `Unspecified`=0, `NotPresent`=1, `Mild`=2, `Moderate`=3, `Severe`=4 |
| `HKCategoryValueSleepAnalysis` | 8.0 | `InBed`=0, `AsleepUnspecified`=1 (iOS 16; replaces deprecated `Asleep`=1), `Awake`=2 (iOS 10), `AsleepCore`=3, `AsleepDeep`=4, `AsleepREM`=5 (all iOS 16) |
| `HKCategoryValueVaginalBleeding` | 18.0 | `Unspecified`=1, `Light`=2, `Medium`=3, `Heavy`=4, `None`=5 |
| `HKCategoryValueAudioExposureEvent` | 13.0 **deprecated** | `LoudEnvironment`=1 |

## Metadata keys we rely on

| Key | iOS | Why it matters |
|---|---|---|
| `HKMetadataKeyMenstrualCycleStart` | 9.0 | Bool on `menstrualFlow` samples: marks day 1 of a period. Apple Health uses it to group flow days into periods. Required when writing flow samples |
| `HKMetadataKeySyncIdentifier` + `HKMetadataKeySyncVersion` | 11.0 | Idempotent upsert: a save with the same sync id and a higher version replaces the old object. Maps to Health Connect's `clientRecordId` / `clientRecordVersion` |
| `HKMetadataKeyExternalUUID` | 8.0 | Free-form external id (no upsert semantics) |
| `HKMetadataKeyWasUserEntered` | 8.0 | Manual entry vs. device-measured. Maps to Health Connect `recordingMethod` |
| `HKMetadataKeyTimeZone` | 8.0 | Original time zone. Health Connect stores a zone offset on every record |
| `HKMetadataKeySexualActivityProtectionUsed` | 9.0 | Bool on `sexualActivity` samples |

