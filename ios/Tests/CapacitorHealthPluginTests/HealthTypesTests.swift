import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

final class HealthTypesTests: XCTestCase {
    private func entry(_ typeId: String, available: Bool, writable: Bool = true) -> RegistryEntry {
        RegistryEntry(
            typeId,
            .category,
            "HKCategoryTypeIdentifierMenstrualFlow",
            minOS: available ? "9.0" : "99.0",
            isAvailable: { available },
            writable: writable,
            valueSet: "bleeding"
        )
    }

    func testGatedTypeIsUnsupportedWithOSVersionReason() {
        let registry = ["future": entry("future", available: false)]
        XCTAssertThrowsError(try HealthTypes.resolve("future", registry: registry)) { error in
            let error = HealthError.from(error)
            XCTAssertEqual(error.code, .unsupportedType)
            XCTAssertEqual(error.data["reason"] as? String, "osVersion")
            XCTAssertEqual(error.data["type"] as? String, "future")
        }
        let support = HealthTypes.support(for: "future", registry: registry)
        XCTAssertEqual(support["supported"] as? Bool, false)
        XCTAssertEqual(support["reason"] as? String, "osVersion")
        XCTAssertEqual(support["minOS"] as? String, "99.0")
    }

    func testAndroidOnlyTypeIsNotOnPlatform() {
        XCTAssertThrowsError(try HealthTypes.resolve("skinTemperature")) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "notOnPlatform")
        }
        let support = HealthTypes.support(for: "skinTemperature")
        XCTAssertEqual(support["supported"] as? Bool, false)
        XCTAssertEqual(support["reason"] as? String, "notOnPlatform")
    }

    func testReadOnlyType() throws {
        let registry = ["flags": entry("flags", available: true, writable: false)]
        XCTAssertNoThrow(try HealthTypes.resolve("flags", registry: registry))
        XCTAssertThrowsError(try HealthTypes.resolveWritable("flags", registry: registry)) { error in
            XCTAssertEqual(HealthError.from(error).code, .readOnlyType)
        }
        let support = HealthTypes.support(for: "flags", registry: registry)
        XCTAssertEqual(support["readable"] as? Bool, true)
        XCTAssertEqual(support["writable"] as? Bool, false)
        XCTAssertEqual(support["reason"] as? String, "readOnly")
    }

    func testPeriodResolvesToMenstrualFlow() throws {
        let (_, type) = try HealthTypes.resolve("menstruationPeriod")
        XCTAssertEqual(type, HKObjectType.categoryType(forIdentifier: .menstrualFlow))
    }

    func testSupportListsValuesAndUnits() {
        let flow = HealthTypes.support(for: "menstrualFlow")
        XCTAssertEqual(flow["values"] as? [String], ["unspecified", "light", "medium", "heavy", "none"])
        XCTAssertEqual(flow["aggregatable"] as? Bool, false)
        XCTAssertEqual(HealthTypes.support(for: "basalBodyTemperature")["units"] as? [String], ["degC", "degF"])
    }

    func testSupportCoversEveryTypeInRegistryOrder() {
        XCTAssertEqual(Registry.allTypeIds.count, Set(Registry.allTypeIds).count)
        XCTAssertTrue(Registry.entries.allSatisfy { Registry.allTypeIds.contains($0.typeId) })
    }

    func testIOS27TypesAreGatedBelowIOS27() throws {
        if #available(iOS 27.0, *) { throw XCTSkip("runs on simulators below iOS 27") }
        XCTAssertEqual(HealthTypes.support(for: "menopausalState")["reason"] as? String, "osVersion")
    }
}
