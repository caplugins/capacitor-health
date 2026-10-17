import XCTest
@testable import CapacitorHealthPlugin

final class AvailabilityTests: XCTestCase {
    func testAvailable() {
        let result = Availability.result(isHealthDataAvailable: true)
        XCTAssertEqual(result["available"] as? Bool, true)
        XCTAssertEqual(result["status"] as? String, "available")
    }

    func testNotSupported() {
        let result = Availability.result(isHealthDataAvailable: false)
        XCTAssertEqual(result["available"] as? Bool, false)
        XCTAssertEqual(result["status"] as? String, "notSupported")
    }

    func testPluginExposesEveryMethod() {
        let names = Set(CapacitorHealthPlugin().pluginMethods.map(\.name))
        XCTAssertEqual(names, [
            "isAvailable",
            "getSupportedTypes",
            "requestAuthorization",
            "checkAuthorization",
            "openHealthSettings",
            "openHealthConnectInstall",
            "readSamples",
            "aggregate",
            "getChanges",
            "saveSamples",
            "deleteSamples"
        ])
    }
}
