import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// `hk:` passthrough ids (T34, decision #59).
final class PassthroughTests: XCTestCase {
    private let noon = "2026-10-01T12:00:00.000+05:30"

    private func decode(_ json: [String: Any]) throws -> HKSample {
        let typeId = try XCTUnwrap(json["type"] as? String)
        let (entry, type) = try HealthTypes.resolveWritable(typeId)
        return try SampleCodec.decode(JSONFields(json, path: "samples[0]"), entry: entry, type: type)
    }

    func testQuantityUsesTheUnitsThatFit() throws {
        let water = try XCTUnwrap(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierDietaryWater"))
        XCTAssertEqual(water.units, ["L", "mL", "flOz"])
        XCTAssertEqual(water.unit, "L")
        XCTAssertTrue(water.writable)
        let sample = try XCTUnwrap(try decode(["type": "hk:HKQuantityTypeIdentifierDietaryWater", "startDate": noon, "value": 250, "unit": "mL"]) as? HKQuantitySample)
        XCTAssertEqual(sample.quantity.doubleValue(for: .liter()), 0.25, accuracy: 1e-9)
        let json = SampleCodec.encode(sample, entry: water, unit: "mL")
        XCTAssertEqual(json["type"] as? String, "hk:HKQuantityTypeIdentifierDietaryWater")
        XCTAssertEqual(json["value"] as? Double ?? 0, 250, accuracy: 1e-9)
        XCTAssertEqual(json["kind"] as? String, "quantity")
        XCTAssertThrowsError(try decode(["type": "hk:HKQuantityTypeIdentifierDietaryWater", "startDate": noon, "value": 1, "unit": "kcal"]))
    }

    func testCategoryKeepsRawValuesHealthKitAccepts() throws {
        let sleep = "hk:HKCategoryTypeIdentifierSleepAnalysis"
        let end = "2026-10-01T13:00:00.000+05:30"
        let sample = try XCTUnwrap(try decode(["type": sleep, "startDate": noon, "endDate": end, "value": 2]) as? HKCategorySample)
        XCTAssertEqual(sample.value, 2)
        XCTAssertEqual(SampleCodec.encode(sample, entry: try XCTUnwrap(HealthTypes.entry(sleep)))["value"] as? Int, 2)
        // AsleepCore (3) is iOS 16+: HealthKit raises on iOS 15, so passthrough writes leave it out.
        XCTAssertThrowsError(try decode(["type": sleep, "startDate": noon, "endDate": end, "value": 3])) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "valueUnsupportedOnPlatform")
        }
        XCTAssertThrowsError(try decode(["type": "hk:HKCategoryTypeIdentifierMindfulSession", "startDate": noon, "endDate": end, "value": 1]))
        XCTAssertNoThrow(try decode(["type": "hk:HKCategoryTypeIdentifierMindfulSession", "startDate": noon, "endDate": end]))
    }

    func testRegisteredAndUnknownIdsHaveNoPassthrough() {
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierStepCount"))
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierBloodPressureSystolic"))
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKWorkoutTypeIdentifier"))
        XCTAssertNil(HealthTypes.passthroughEntry("hc:HydrationRecord"))
        XCTAssertThrowsError(try HealthTypes.resolve("hc:HydrationRecord")) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "notOnPlatform")
        }
        let unknown = HealthTypes.passthroughEntry("hk:HKCategoryTypeIdentifierSomethingFromTheFuture")
        XCTAssertEqual(unknown?.writable, false, "identifiers outside the generated tables read only")
        XCTAssertEqual(unknown?.isAvailable(), false)
    }

    func testAuthorizationAsksForPassthroughTypes() async throws {
        XCTAssertEqual(
            HealthTypes.authorizationTypes(for: try XCTUnwrap(HealthTypes.entry("hk:HKQuantityTypeIdentifierDietaryWater"))),
            [HKQuantityType(.dietaryWater)]
        )
    }
}
