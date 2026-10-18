import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// `nutrition` as a `food` correlation (T50, decision #71), without the health store.
final class NutritionTests: XCTestCase {
    private let start = "2026-10-01T08:00:00.000+05:30"
    private let end = "2026-10-01T08:20:00.000+05:30"

    private func decode(_ json: [String: Any]) throws -> HKCorrelation {
        var fields: [String: Any] = ["type": "nutrition", "startDate": start, "endDate": end]
        fields.merge(json) { $1 }
        let (entry, type) = try HealthTypes.resolveWritable("nutrition")
        let sample = try SampleCodec.decode(JSONFields(fields, path: "samples[0]"), entry: entry, type: type)
        return try XCTUnwrap(sample as? HKCorrelation)
    }

    private func reason(_ json: [String: Any], field: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        var result: String?
        XCTAssertThrowsError(try decode(json), file: file, line: line) { error in
            let error = error as? HealthError
            XCTAssertEqual(error?.data["field"] as? String, field, file: file, line: line)
            result = error?.data["reason"] as? String
        }
        return result
    }

    func testAnEntryRoundTrips() throws {
        let correlation = try decode([
            "name": "Porridge", "nutrients": ["energy": 350, "protein": 12.5, "vitaminC": 0.0005],
            "clientId": "meal-1", "clientVersion": 3, "recordingMethod": "manual"
        ])
        XCTAssertEqual(correlation.correlationType, HKCorrelationType(.food))
        XCTAssertEqual(correlation.objects.count, 3)
        XCTAssertEqual(correlation.metadata?[HKMetadataKeyFoodType] as? String, "Porridge")
        XCTAssertEqual(correlation.metadata?[HKMetadataKeySyncIdentifier] as? String, "meal-1")
        let protein = try XCTUnwrap(correlation.objects(for: HKQuantityType(.dietaryProtein)).first as? HKQuantitySample)
        // Members get their own sync ids, with the entry's version, so an upsert replaces them too (#54, #71).
        XCTAssertEqual(protein.metadata?[HKMetadataKeySyncIdentifier] as? String, "meal-1#protein")
        XCTAssertEqual(protein.metadata?[HKMetadataKeySyncVersion] as? NSNumber, 3)
        XCTAssertEqual(protein.metadata?[HKMetadataKeyWasUserEntered] as? Bool, true)
        XCTAssertEqual(protein.metadata?[HKMetadataKeyFoodType] as? String, "Porridge")
        XCTAssertEqual(protein.quantity.doubleValue(for: .gram()), 12.5)
        XCTAssertEqual(protein.startDate, correlation.startDate)
        XCTAssertEqual(protein.endDate, correlation.endDate)
        let energy = try XCTUnwrap(correlation.objects(for: HKQuantityType(.dietaryEnergyConsumed)).first as? HKQuantitySample)
        XCTAssertEqual(energy.quantity.doubleValue(for: .kilocalorie()), 350)

        let json = SampleCodec.encode(correlation, entry: try XCTUnwrap(Registry.byId["nutrition"]))
        XCTAssertEqual(json["type"] as? String, "nutrition")
        XCTAssertEqual(json["kind"] as? String, "special")
        XCTAssertEqual(json["name"] as? String, "Porridge")
        XCTAssertEqual(json["clientId"] as? String, "meal-1")
        let nutrients = try XCTUnwrap(json["nutrients"] as? [String: Double])
        XCTAssertEqual(nutrients["energy"], 350)
        XCTAssertEqual(nutrients["protein"], 12.5)
        XCTAssertEqual(try XCTUnwrap(nutrients["vitaminC"]), 0.0005, accuracy: 1e-12)
        XCTAssertEqual((json["memberSampleIds"] as? [String])?.count, 3)
        XCTAssertNil(json["value"])
        XCTAssertNil(json["unit"])
    }

    func testWithoutAClientIdMembersHaveNoSyncIds() throws {
        let correlation = try decode(["nutrients": ["sugar": 4]])
        XCTAssertNil(correlation.objects.first?.metadata?[HKMetadataKeySyncIdentifier])
        XCTAssertNil(correlation.metadata?[HKMetadataKeyFoodType])
    }

    func testRejectsWhatIOSCantStore() {
        XCTAssertEqual(reason(["nutrients": ["transFat": 1]], field: "samples[0].nutrients.transFat"), "valueUnsupportedOnPlatform")
        XCTAssertEqual(reason(["nutrients": ["energy": 1], "mealType": "lunch"], field: "samples[0].mealType"), "valueUnsupportedOnPlatform")
        XCTAssertEqual(reason(["nutrients": [String: Any]()], field: "samples[0].nutrients"), "required")
        XCTAssertEqual(reason(["nutrients": ["protein": -1]], field: "samples[0].nutrients.protein"), "outOfRange")
    }

    func testListsTheNutrientsThisIOSStores() {
        let nutrients = Nutrition.supportedNutrients()
        XCTAssertEqual(nutrients.count, 38)
        XCTAssertTrue(nutrients.contains("caffeine"))
        XCTAssertFalse(nutrients.contains("transFat"))
        XCTAssertEqual(Nutrition.memberTypes().count, 38)
        XCTAssertEqual(HealthTypes.support(for: "nutrition")["values"] as? [String], nutrients)
        // Authorization goes through the dietary types: HealthKit doesn't authorize correlation types.
        let entry = Registry.byId["nutrition"]
        XCTAssertEqual(entry.map { HealthTypes.authorizationTypes(for: $0).count }, 38)
    }

    func testAmountsOfANutrientHeldTwiceAddUp() throws {
        let date = try XCTUnwrap(DateCoding.date(from: start))
        let type = HKQuantityType(.dietarySugar)
        let objects: Set<HKSample> = [
            HKQuantitySample(type: type, quantity: HKQuantity(unit: .gram(), doubleValue: 2), start: date, end: date),
            HKQuantitySample(type: type, quantity: HKQuantity(unit: .gram(), doubleValue: 3), start: date, end: date)
        ]
        let correlation = HKCorrelation(type: HKCorrelationType(.food), start: date, end: date, objects: objects)
        let json = Nutrition.encode(correlation, entry: try XCTUnwrap(Registry.byId["nutrition"]))
        XCTAssertEqual((json["nutrients"] as? [String: Double])?["sugar"], 5)
    }
}
