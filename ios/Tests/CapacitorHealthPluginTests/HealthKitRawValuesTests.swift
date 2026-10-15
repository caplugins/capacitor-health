import HealthKit
import XCTest

/// Pins the runtime strings of HealthKit constants the plugin relies on. Metadata keys don't match
/// their symbol names (iOS 8/9 keys are short, e.g. "HKMenstrualCycleStart"), so anything that
/// stores or compares keys as strings, like the registry, must use these values. Recorded in T06.
final class HealthKitRawValuesTests: XCTestCase {
    func testIdentifierRawValueMatchesSymbolName() {
        XCTAssertEqual(HKCategoryTypeIdentifier.menstrualFlow.rawValue, "HKCategoryTypeIdentifierMenstrualFlow")
    }

    func testMetadataKeyRawValues() {
        XCTAssertEqual(HKMetadataKeyMenstrualCycleStart, "HKMenstrualCycleStart")
        XCTAssertEqual(HKMetadataKeySyncIdentifier, "HKMetadataKeySyncIdentifier")
        XCTAssertEqual(HKMetadataKeySyncVersion, "HKMetadataKeySyncVersion")
        XCTAssertEqual(HKMetadataKeyTimeZone, "HKTimeZone")
        XCTAssertEqual(HKMetadataKeyWasUserEntered, "HKWasUserEntered")
        XCTAssertEqual(HKMetadataKeyExternalUUID, "HKExternalUUID")
        XCTAssertEqual(HKMetadataKeySexualActivityProtectionUsed, "HKSexualActivityProtectionUsed")
    }
}
