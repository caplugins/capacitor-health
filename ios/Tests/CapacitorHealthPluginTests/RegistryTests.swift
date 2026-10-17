import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// Checks the generated registry against the running HealthKit (RegistryRawValuesTests pins the raw values).
final class RegistryTests: XCTestCase {
    func testIdsAreUnique() {
        XCTAssertEqual(Registry.byId.count, Registry.entries.count)
    }

    func testEveryAvailableIdentifierResolves() {
        for entry in Registry.entries where entry.isAvailable() {
            let type: HKSampleType? = entry.isQuantity
                ? HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: entry.identifier))
                : HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: entry.identifier))
            XCTAssertNotNil(type, entry.typeId)
        }
    }

    func testIOS27TypesAreAvailableOnTheIOS27Simulator() throws {
        guard #available(iOS 27.0, *) else { throw XCTSkip("needs the iOS 27 simulator") }
        XCTAssertTrue(Registry.entries.allSatisfy { $0.isAvailable() })
    }

    func testReferencesResolve() {
        for entry in Registry.entries {
            if let valueSet = entry.valueSet {
                XCTAssertNotNil(Registry.valueSets[valueSet], "\(entry.typeId).valueSet")
            }
            if let source = entry.derivedFrom {
                XCTAssertNotNil(Registry.byId[source], "\(entry.typeId).derivedFrom")
            }
            for field in entry.fields {
                if let valueSet = field.valueSet {
                    XCTAssertNotNil(Registry.valueSets[valueSet], "\(entry.typeId).\(field.name)")
                }
            }
        }
    }

    func testUnitsParse() {
        for entry in Registry.entries {
            guard let unit = entry.unit else { continue }
            // An unknown unit string raises an Objective-C exception, so only round-trip known ones.
            XCTAssertEqual(HKUnit(from: unit).unitString, unit, entry.typeId)
        }
    }
}
