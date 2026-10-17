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

    func testEveryCatalogQuantityIsRegistered() {
        // Since T41 every quantity identifier of the iOS 27 SDK has a unified id; a newer one reads only.
        XCTAssertTrue(Registry.passthroughQuantities.isEmpty)
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierDietaryWater"))
        let future = HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierSomethingFromTheFuture")
        XCTAssertEqual(future?.writable, false)
        XCTAssertEqual(future?.kind, .quantity)
    }

    func testCategoryKeepsRawValuesHealthKitAccepts() throws {
        let coughing = "hk:HKCategoryTypeIdentifierCoughing"
        let end = "2026-10-01T13:00:00.000+05:30"
        let sample = try XCTUnwrap(try decode(["type": coughing, "startDate": noon, "endDate": end, "value": 2]) as? HKCategorySample)
        XCTAssertEqual(sample.value, 2)
        XCTAssertEqual(SampleCodec.encode(sample, entry: try XCTUnwrap(HealthTypes.entry(coughing)))["value"] as? Int, 2)
        // HKCategoryValueSeverity ends at 4: HealthKit raises for anything beyond, so passthrough writes reject it.
        XCTAssertThrowsError(try decode(["type": coughing, "startDate": noon, "endDate": end, "value": 5])) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "valueUnsupportedOnPlatform")
        }
        XCTAssertThrowsError(try decode(["type": "hk:HKCategoryTypeIdentifierHandwashingEvent", "startDate": noon, "endDate": end, "value": 1]))
        XCTAssertNoThrow(try decode(["type": "hk:HKCategoryTypeIdentifierHandwashingEvent", "startDate": noon, "endDate": end]))
    }

    func testRegisteredAndUnknownIdsHaveNoPassthrough() {
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierStepCount"))
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKQuantityTypeIdentifierBloodPressureSystolic"))
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKCategoryTypeIdentifierMindfulSession"))
        XCTAssertNil(HealthTypes.passthroughEntry("hk:HKCategoryTypeIdentifierSleepAnalysis"), "registered as sleepSession")
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
            HealthTypes.authorizationTypes(for: try XCTUnwrap(HealthTypes.entry("hk:HKCategoryTypeIdentifierToothbrushingEvent"))),
            [HKCategoryType(.toothbrushingEvent)]
        )
    }
}
