import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// The M2 quantity, category and combined-id paths (T26).
final class QuantityCodecTests: XCTestCase {
    private let noon = "2026-10-01T12:00:00.000+05:30"

    private func decode(_ json: [String: Any]) throws -> HKSample {
        let typeId = try XCTUnwrap(json["type"] as? String)
        let (entry, type) = try HealthTypes.resolveWritable(typeId)
        return try SampleCodec.decode(JSONFields(json, path: "samples[0]"), entry: entry, type: type)
    }

    private func quantity(_ typeId: String, _ value: Double, _ unit: String, extra: [String: Any] = [:]) throws -> HKQuantitySample {
        let json = ["type": typeId, "startDate": noon, "value": value, "unit": unit].merging(extra) { $1 }
        let sample = try decode(json)
        return try XCTUnwrap(sample as? HKQuantitySample)
    }

    private func read(_ sample: HKSample, as typeId: String, unit: String? = nil) throws -> [String: Any] {
        SampleCodec.encode(sample, entry: try XCTUnwrap(Registry.byId[typeId]), unit: unit)
    }

    /// What HealthKit won't save without: required fields (their set's first value), a duration.
    private func requiredFields(_ entry: RegistryEntry) -> [String: Any] {
        var fields: [String: Any] = entry.intervalOnly ? ["endDate": "2026-10-01T12:30:00.000+05:30"] : [:]
        for field in entry.fields where field.requiredOnWrite && field.type == .enumeration {
            fields[field.name] = field.valueSet.flatMap { Registry.valueSets[$0]?.values.first }
        }
        return fields
    }

    func testEveryWritableQuantityRoundTripsInEveryUnit() throws {
        var checked = 0
        for entry in Registry.entries where entry.kind == .quantity && entry.writable && entry.derivedFrom == nil {
            guard HealthTypes.sampleType(for: entry) != nil else { continue }
            let value = entry.range.map { ($0.lowerBound + $0.upperBound) / 2 } ?? 12.5
            for unit in entry.units {
                let sample = try quantity(entry.typeId, value, unit, extra: requiredFields(entry))
                let json = try read(sample, as: entry.typeId, unit: unit)
                XCTAssertEqual(json["value"] as? Double ?? 0, value, accuracy: 0.000001, "\(entry.typeId) in \(unit)")
                XCTAssertEqual(json["unit"] as? String, unit, entry.typeId)
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 100)
    }

    func testConversionsBetweenUnits() throws {
        func converted(_ typeId: String, _ value: Double, from: String, to: String) throws -> Double {
            try read(try quantity(typeId, value, from), as: typeId, unit: to)["value"] as? Double ?? .nan
        }
        XCTAssertEqual(try converted("distanceCycling", 1, from: "mi", to: "m"), 1609.344, accuracy: 0.0001)
        XCTAssertEqual(try converted("walkingSpeed", 3.6, from: "km/h", to: "m/s"), 1, accuracy: 0.000001)
        XCTAssertEqual(try converted("timeInDaylight", 1, from: "h", to: "min"), 60, accuracy: 0.000001)
        XCTAssertEqual(try converted("activeEnergy", 1, from: "kcal", to: "kJ"), 4.184, accuracy: 0.000001)
        XCTAssertEqual(try converted("weight", 1, from: "lb", to: "kg"), 0.45359237, accuracy: 0.0000001)
        XCTAssertEqual(try converted("height", 6, from: "ft", to: "cm"), 182.88, accuracy: 0.0001)
        XCTAssertEqual(try converted("bodyTemperature", 98.6, from: "degF", to: "degC"), 37, accuracy: 0.0001)
        // Glucose molar mass: 1 mmol/L = 18.0156 mg/dL.
        XCTAssertEqual(try converted("bloodGlucose", 5.5, from: "mmol/L", to: "mg/dL"), 99.0858, accuracy: 0.001)
        XCTAssertEqual(try converted("forcedVitalCapacity", 4.5, from: "L", to: "mL"), 4500, accuracy: 0.0001)
    }

    func testUnitsUseHealthKitsSpelling() throws {
        let vo2 = try quantity("vo2Max", 42, "mL/(kg·min)")
        XCTAssertEqual(vo2.quantity.doubleValue(for: HKUnit(from: "ml/kg*min")), 42, accuracy: 0.000001)
        let effort = try quantity("physicalEffort", 3.5, "kcal/(kg·h)")
        XCTAssertEqual(effort.quantity.doubleValue(for: HKUnit(from: "kcal/hr·kg")), 3.5, accuracy: 0.000001)
        let spo2 = try quantity("oxygenSaturation", 97, "%")
        XCTAssertEqual(spo2.quantity.doubleValue(for: .percent()), 0.97, accuracy: 0.000001)
    }

    func testTypedFieldsRoundTrip() throws {
        let vo2 = try quantity("vo2Max", 42, "mL/(kg·min)", extra: ["testType": "predictionNonExercise"])
        XCTAssertEqual(vo2.metadata?[HKMetadataKeyVO2MaxTestType] as? NSNumber, 3)
        XCTAssertEqual(try read(vo2, as: "vo2Max")["testType"] as? String, "predictionNonExercise")

        let glucose = try quantity("bloodGlucose", 95, "mg/dL", extra: ["relationToMeal": "afterMeal"])
        XCTAssertEqual(glucose.metadata?[HKMetadataKeyBloodGlucoseMealTime] as? NSNumber, 2)
        XCTAssertEqual(try read(glucose, as: "bloodGlucose")["relationToMeal"] as? String, "afterMeal")

        let temperature = try quantity("bodyTemperature", 37, "degC", extra: ["measurementLocation": "ear"])
        XCTAssertEqual(try read(temperature, as: "bodyTemperature")["measurementLocation"] as? String, "ear")
    }

    func testRelationToMealValuesHealthKitLacks() {
        XCTAssertThrowsError(try quantity("bloodGlucose", 95, "mg/dL", extra: ["relationToMeal": "fasting"])) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "valueUnsupportedOnPlatform")
        }
    }

    func testHealthKitRangesAndDurationsAreCheckedFirst() throws {
        XCTAssertThrowsError(try quantity("workoutEffortScore", 10.5, "appleEffortScore")) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "outOfRange")
        }
        XCTAssertNoThrow(try quantity("estimatedWorkoutEffortScore", 0, "appleEffortScore"))
        XCTAssertThrowsError(try quantity("environmentalAudioExposure", 60, "dBASPL")) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "intervalOnly")
        }
        let short = ["endDate": "2026-10-01T12:00:00.500+05:30"]
        XCTAssertThrowsError(try quantity("environmentalAudioExposure", 60, "dBASPL", extra: short))
        XCTAssertNoThrow(try quantity("headphoneAudioExposure", 70, "dBASPL", extra: ["endDate": "2026-10-01T12:00:01.000+05:30"]))
    }

    func testInsulinDeliveryNeedsAReason() throws {
        XCTAssertThrowsError(try quantity("insulinDelivery", 2, "IU")) { error in
            let error = HealthError.from(error)
            XCTAssertEqual(error.code, .invalidArgument)
            XCTAssertEqual(error.data["field"] as? String, "samples[0].reason")
            XCTAssertEqual(error.data["reason"] as? String, "required")
        }
        let bolus = try quantity("insulinDelivery", 2, "IU", extra: ["reason": "bolus"])
        XCTAssertEqual(bolus.metadata?[HKMetadataKeyInsulinDeliveryReason] as? NSNumber, 2)
        XCTAssertEqual(try read(bolus, as: "insulinDelivery")["reason"] as? String, "bolus")
    }

    func testM2CategoryValues() throws {
        let (entry, type) = try HealthTypes.resolve("environmentalAudioExposureEvent")
        let categoryType = try XCTUnwrap(type as? HKCategoryType)
        XCTAssertEqual(categoryType.identifier, "HKCategoryTypeIdentifierAudioExposureEvent")
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        let sample = HKCategorySample(type: categoryType, value: 1, start: start, end: start.addingTimeInterval(60))
        let json = SampleCodec.encode(sample, entry: entry)
        XCTAssertEqual(json["value"] as? String, "momentaryLimit")
        XCTAssertEqual((json["native"] as? [String: Any])?["value"] as? Int, 1)
        // HealthKit disallows sharing it (decision #51).
        XCTAssertThrowsError(try HealthTypes.resolveWritable("environmentalAudioExposureEvent")) { error in
            XCTAssertEqual(HealthError.from(error).code, .readOnlyType)
        }
    }

    // MARK: - Combined ids

    func testCombinedIdWritesToItsWriteMember() throws {
        let sample = try quantity("distance", 2, "km")
        XCTAssertEqual(sample.sampleType, HKQuantityType(.distanceWalkingRunning))
        let json = try read(sample, as: "distance")
        XCTAssertEqual(json["type"] as? String, "distance")
        XCTAssertEqual(json["value"] as? Double ?? 0, 2000, accuracy: 0.000001)
        XCTAssertEqual((json["native"] as? [String: Any])?["type"] as? String, "HKQuantityTypeIdentifierDistanceWalkingRunning")

        let split = try quantity("distanceCycling", 2, "km")
        XCTAssertEqual(split.sampleType, HKQuantityType(.distanceCycling))
        XCTAssertEqual(try quantity("speed", 1, "m/s").sampleType, HKQuantityType(.walkingSpeed))
    }

    func testCombinedIdsReadEveryAvailableMember() throws {
        let distance = try XCTUnwrap(Registry.byId["distance"])
        let members = HealthTypes.readTypes(for: distance)
        XCTAssertEqual(members.map(\.0.typeId), distance.members.filter { Registry.byId[$0]?.isAvailable() == true })
        XCTAssertEqual(members.first?.1, HKQuantityType(.distanceWalkingRunning))
        if #available(iOS 18.0, *) { XCTAssertEqual(members.count, 9) }

        let total = try XCTUnwrap(Registry.byId["totalEnergy"])
        XCTAssertEqual(HealthTypes.readTypes(for: total).map(\.1), [HKQuantityType(.activeEnergyBurned), HKQuantityType(.basalEnergyBurned)])
        let steps = try XCTUnwrap(Registry.byId["steps"])
        XCTAssertEqual(HealthTypes.readTypes(for: steps).map(\.1), [HKQuantityType(.stepCount)])
    }

    func testAggregateOnlyTypesHaveNoSamples() throws {
        let support = HealthTypes.support(for: "totalEnergy")
        XCTAssertEqual(support["supported"] as? Bool, true)
        XCTAssertEqual(support["readable"] as? Bool, false)
        XCTAssertEqual(support["writable"] as? Bool, false)
        XCTAssertEqual(support["reason"] as? String, "aggregateOnly")
        XCTAssertThrowsError(try HealthTypes.requireSamples(try XCTUnwrap(Registry.byId["totalEnergy"]))) { error in
            let error = HealthError.from(error)
            XCTAssertEqual(error.code, .unsupportedType)
            XCTAssertEqual(error.data["reason"] as? String, "aggregateOnly")
        }
        XCTAssertNoThrow(try HealthTypes.requireSamples(try XCTUnwrap(Registry.byId["distance"])))
    }

    /// Decision #21: basal energy is energy over an interval on iOS; the Android-only rate isn't on iOS.
    func testEnergySplit() throws {
        let basal = HealthTypes.support(for: "basalEnergy")
        XCTAssertEqual(basal["readable"] as? Bool, true)
        XCTAssertEqual(basal["writable"] as? Bool, true)
        XCTAssertEqual(basal["units"] as? [String], ["kcal", "kJ"])
        XCTAssertEqual(HealthTypes.support(for: "basalMetabolicRate")["reason"] as? String, "notOnPlatform")
        let sample = try quantity("basalEnergy", 60, "kcal")
        XCTAssertEqual(sample.sampleType, HKQuantityType(.basalEnergyBurned))
    }

    func testMergeKeepsOneOrderAcrossMembers() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        func sample(_ type: HKQuantityTypeIdentifier, _ minutes: Double, _ meters: Double) -> HKSample {
            let date = base.addingTimeInterval(minutes * 60)
            return HKQuantitySample(type: HKQuantityType(type), quantity: HKQuantity(unit: .meter(), doubleValue: meters), start: date, end: date)
        }
        let walking = [sample(.distanceWalkingRunning, 0, 1), sample(.distanceWalkingRunning, 10, 2), sample(.distanceWalkingRunning, 20, 3)]
        let cycling = [sample(.distanceCycling, 10, 4), sample(.distanceCycling, 15, 5)]
        func value(_ sample: HKSample) -> Double { (sample as? HKQuantitySample)?.quantity.doubleValue(for: .meter()) ?? 0 }

        XCTAssertEqual(Samples.merge([walking, cycling], ascending: true).map(value), [1, 2, 4, 5, 3])
        XCTAssertEqual(Samples.merge([walking.reversed(), cycling.reversed()], ascending: false).map(value), [3, 5, 2, 4, 1])
        XCTAssertEqual(Samples.merge([walking], ascending: true).map(value), [1, 2, 3])
        XCTAssertTrue(Samples.merge([], ascending: true).isEmpty)
    }

    func testChangesCursorKeysCombinedMembers() throws {
        XCTAssertEqual(ChangesCursor.key(typeId: "distance", member: "distanceCycling"), "distance/distanceCycling")
        XCTAssertEqual(ChangesCursor.key(typeId: "steps", member: nil), "steps")
        let cursor = ChangesCursor(anchors: ["distance/distanceCycling": "a", "distance/distanceSwimming": "b", "steps": "c"])
        XCTAssertEqual(try ChangesCursor.decode(cursor.encoded(), types: ["steps", "distance"]), cursor)
        XCTAssertThrowsError(try ChangesCursor.decode(cursor.encoded(), types: ["distance"]))
    }
}
