import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

final class HealthErrorTests: XCTestCase {
    private func healthKitError(_ code: Int, _ message: String = "message") -> NSError {
        NSError(domain: HKErrorDomain, code: code, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func mapped(_ code: Int, _ message: String = "message") -> HealthError {
        HealthError.from(healthKitError(code, message))
    }

    func testRawCodesUsedWithoutSymbolsMatchTheSDK() {
        if #available(iOS 17.0, *) {
            XCTAssertEqual(HKError.Code.errorDataSizeExceeded.rawValue, 13)
        }
        if #available(iOS 18.0, *) {
            XCTAssertEqual(HKError.Code.errorNotPermissibleForGuestUserMode.rawValue, 15)
        }
    }

    func testMapsHealthKitCodes() {
        XCTAssertEqual(mapped(HKError.Code.errorHealthDataUnavailable.rawValue).code, .unavailable)
        XCTAssertEqual(mapped(HKError.Code.errorHealthDataRestricted.rawValue).code, .unavailable)
        XCTAssertEqual(mapped(15).code, .unavailable)
        XCTAssertEqual(mapped(HKError.Code.errorAuthorizationDenied.rawValue).code, .permissionDenied)
        XCTAssertEqual(mapped(HKError.Code.errorAuthorizationNotDetermined.rawValue).code, .permissionDenied)
        XCTAssertEqual(mapped(HKError.Code.errorRequiredAuthorizationDenied.rawValue).code, .permissionDenied)
        XCTAssertEqual(mapped(HKError.Code.errorDatabaseInaccessible.rawValue).code, .deviceLocked)
        XCTAssertEqual(mapped(HKError.Code.errorInvalidArgument.rawValue).code, .invalidArgument)
        XCTAssertEqual(mapped(13).code, .invalidArgument)
        XCTAssertEqual(mapped(HKError.Code.errorUserCanceled.rawValue).code, .nativeError)
    }

    func testKeepsTheNativeCode() {
        XCTAssertEqual(mapped(HKError.Code.errorDatabaseInaccessible.rawValue).data["nativeCode"] as? Int, 6)
    }

    func testMissingEntitlementIsAMissingDeclaration() {
        let error = mapped(HKError.Code.errorAuthorizationDenied.rawValue, "Missing com.apple.developer.healthkit entitlement.")
        XCTAssertEqual(error.code, .missingDeclaration)
        XCTAssertEqual(error.data["missing"] as? [String], ["com.apple.developer.healthkit"])
    }

    func testDoesNotPassOnInvalidArgumentMessages() {
        let error = mapped(HKError.Code.errorInvalidArgument.rawValue, "Value 4 is invalid")
        XCTAssertFalse(error.message.contains("4"))
    }

    func testOtherDomainsAreNativeErrors() {
        let error = HealthError.from(NSError(domain: "other", code: 42, userInfo: [NSLocalizedDescriptionKey: "boom"]))
        XCTAssertEqual(error.code, .nativeError)
        XCTAssertEqual(error.message, "boom")
        XCTAssertEqual(error.data["nativeCode"] as? Int, 42)
    }

    func testPassesHealthErrorsThrough() {
        let error = HealthError.from(HealthError.invalidArgument("limit", "is too big"))
        XCTAssertEqual(error.code, .invalidArgument)
        XCTAssertEqual(error.data["field"] as? String, "limit")
    }
}
