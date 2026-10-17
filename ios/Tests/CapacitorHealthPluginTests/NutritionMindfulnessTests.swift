import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// Hydration, single nutrients and mindful sessions on iOS (T41–T42, decision #61).
final class NutritionMindfulnessTests: XCTestCase {
    private let start = "2026-10-01T12:00:00.000+02:00"
    private let end = "2026-10-01T12:20:00.000+02:00"

    private func decode(_ json: [String: Any]) throws -> HKSample {
        let typeId = try XCTUnwrap(json["type"] as? String)
        let (entry, type) = try HealthTypes.resolveWritable(typeId)
        return try SampleCodec.decode(JSONFields(json, path: "samples[0]"), entry: entry, type: type)
    }

    func testHydrationIsDietaryWaterInMillilitres() throws {
        let sample = try XCTUnwrap(try decode(["type": "hydration", "startDate": start, "value": 8, "unit": "flOz"]) as? HKQuantitySample)
        XCTAssertEqual(sample.quantityType, HKQuantityType(.dietaryWater))
        let json = SampleCodec.encode(sample, entry: try XCTUnwrap(Registry.byId["hydration"]))
        XCTAssertEqual(json["unit"] as? String, "mL")
        XCTAssertEqual(json["value"] as? Double ?? 0, 236.588, accuracy: 0.001)
        XCTAssertEqual(Aggregation.metrics(for: try XCTUnwrap(Registry.byId["hydration"])), ["sum"])
    }

    func testEveryHealthKitNutrientIsASummableQuantity() throws {
        XCTAssertEqual(Registry.nutrients.count, 38)
        for (id, nutrient) in Registry.nutrients {
            let entry = try XCTUnwrap(Registry.byId["dietary\(id.prefix(1).uppercased())\(id.dropFirst())"], id)
            XCTAssertEqual(entry.identifier, nutrient.identifier, id)
            XCTAssertEqual(entry.unit, nutrient.unit, id)
            XCTAssertEqual(Aggregation.metrics(for: entry), ["sum"], id)
            XCTAssertEqual(HealthTypes.support(for: entry.typeId)["writable"] as? Bool, true, id)
        }
        // Health Connect-only nutrients aren't on iOS.
        XCTAssertEqual(HealthTypes.support(for: "dietaryTransFat")["reason"] as? String, "notOnPlatform")
    }

    func testVitaminsConvertBetweenMassUnits() throws {
        let sample = try XCTUnwrap(try decode(["type": "dietaryVitaminD", "startDate": start, "value": 15, "unit": "mcg"]) as? HKQuantitySample)
        XCTAssertEqual(sample.quantity.doubleValue(for: .gramUnit(with: .milli)), 0.015, accuracy: 1e-12)
        let json = SampleCodec.encode(sample, entry: try XCTUnwrap(Registry.byId["dietaryVitaminD"]), unit: "mcg")
        XCTAssertEqual(json["value"] as? Double ?? 0, 15, accuracy: 1e-9)
    }

    func testMindfulSessionIsAnEvent() throws {
        let sample = try XCTUnwrap(try decode(["type": "mindfulSession", "startDate": start, "endDate": end, "clientId": "m1"]) as? HKCategorySample)
        XCTAssertEqual(sample.categoryType, HKCategoryType(.mindfulSession))
        XCTAssertEqual(sample.value, HKCategoryValue.notApplicable.rawValue)
        let json = SampleCodec.encode(sample, entry: try XCTUnwrap(Registry.byId["mindfulSession"]))
        XCTAssertEqual(json["kind"] as? String, "event")
        XCTAssertEqual(json["clientId"] as? String, "m1")
        XCTAssertNil(json["value"])
        XCTAssertNil(json["sessionType"])
        XCTAssertEqual(HealthTypes.support(for: "mindfulSession")["aggregatable"] as? Bool, false)
    }
}
