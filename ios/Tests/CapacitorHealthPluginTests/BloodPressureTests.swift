import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

private final class SharingStore: HealthStoreAuthorizing {
    var requested: (share: Set<HKSampleType>, read: Set<HKObjectType>)?
    var statuses: [HKObjectType: HKAuthorizationStatus] = [:]

    func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws { requested = (toShare, read) }
    func authorizationStatus(for type: HKObjectType) -> HKAuthorizationStatus { statuses[type] ?? .notDetermined }
    func statusForAuthorizationRequest(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws -> HKAuthorizationRequestStatus {
        .unnecessary
    }
    func earliestAuthorizedSampleDates(for types: Set<HKObjectType>) async throws -> [HKObjectType: Date] { [:] }
}

/// `bloodPressure` as an `HKCorrelation` (T29, decision #54).
final class BloodPressureTests: XCTestCase {
    private let noon = "2026-10-01T12:00:00.000+05:30"
    private let info: [String: Any] = ["NSHealthShareUsageDescription": "r", "NSHealthUpdateUsageDescription": "w"]

    private func decode(_ json: [String: Any]) throws -> HKCorrelation {
        let (entry, type) = try HealthTypes.resolveWritable("bloodPressure")
        let sample = try SampleCodec.decode(JSONFields(json, path: "samples[0]"), entry: entry, type: type)
        return try XCTUnwrap(sample as? HKCorrelation)
    }

    func testReadingRoundTrips() throws {
        let correlation = try decode([
            "type": "bloodPressure", "startDate": noon, "systolic": 121.5, "diastolic": 79,
            "clientId": "bp-1", "clientVersion": 2, "recordingMethod": "manual"
        ])
        XCTAssertEqual(correlation.correlationType, HKCorrelationType(.bloodPressure))
        XCTAssertEqual(correlation.objects.count, 2)
        XCTAssertEqual(correlation.metadata?[HKMetadataKeySyncIdentifier] as? String, "bp-1")
        let systolic = try XCTUnwrap(correlation.objects(for: HKQuantityType(.bloodPressureSystolic)).first)
        let diastolic = try XCTUnwrap(correlation.objects(for: HKQuantityType(.bloodPressureDiastolic)).first)
        // Members get their own sync identifiers so an upsert replaces them too (decision #54).
        XCTAssertEqual(systolic.metadata?[HKMetadataKeySyncIdentifier] as? String, "bp-1#systolic")
        XCTAssertEqual(diastolic.metadata?[HKMetadataKeySyncIdentifier] as? String, "bp-1#diastolic")
        XCTAssertEqual(systolic.metadata?[HKMetadataKeySyncVersion] as? NSNumber, 2)
        XCTAssertEqual(systolic.metadata?[HKMetadataKeyWasUserEntered] as? Bool, true)
        XCTAssertEqual(systolic.startDate, correlation.startDate)

        let json = SampleCodec.encode(correlation, entry: try XCTUnwrap(Registry.byId["bloodPressure"]))
        XCTAssertEqual(json["type"] as? String, "bloodPressure")
        XCTAssertEqual(json["kind"] as? String, "special")
        XCTAssertEqual(json["systolic"] as? Double ?? 0, 121.5, accuracy: 1e-9)
        XCTAssertEqual(json["diastolic"] as? Double ?? 0, 79, accuracy: 1e-9)
        XCTAssertEqual(json["unit"] as? String, "mmHg")
        XCTAssertEqual(json["clientId"] as? String, "bp-1")
        XCTAssertEqual(json["clientVersion"] as? Int, 2)
        XCTAssertEqual((json["native"] as? [String: Any])?["type"] as? String, "HKCorrelationTypeIdentifierBloodPressure")
        XCTAssertNil(json["value"])
    }

    func testRejectsMissingValuesAndOtherUnits() {
        XCTAssertThrowsError(try decode(["type": "bloodPressure", "startDate": noon, "systolic": 120])) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "samples[0].diastolic")
        }
        XCTAssertThrowsError(try decode(["type": "bloodPressure", "startDate": noon, "systolic": 120, "diastolic": 80, "unit": "kPa"]))
    }

    func testIsSupportedAndAuthorizesItsMembers() async throws {
        XCTAssertEqual(HealthTypes.support(for: "bloodPressure")["supported"] as? Bool, true)
        let store = SharingStore()
        let authorization = Authorization(store: store, infoDictionary: { self.info })
        _ = try await authorization.request(read: ["bloodPressure"], write: ["bloodPressure"])
        let members: Set<HKObjectType> = [HKQuantityType(.bloodPressureSystolic), HKQuantityType(.bloodPressureDiastolic)]
        XCTAssertEqual(store.requested?.read, members)
        XCTAssertEqual(Set(store.requested?.share.map { $0 as HKObjectType } ?? []), members)

        store.statuses = [HKQuantityType(.bloodPressureSystolic): .sharingAuthorized]
        var result = try await authorization.check(read: [], write: ["bloodPressure"])
        XCTAssertEqual(result["write"] as? [String: String], ["bloodPressure": "notDetermined"])
        store.statuses[HKQuantityType(.bloodPressureDiastolic)] = .sharingAuthorized
        result = try await authorization.check(read: [], write: ["bloodPressure"])
        XCTAssertEqual(result["write"] as? [String: String], ["bloodPressure": "granted"])
        store.statuses[HKQuantityType(.bloodPressureDiastolic)] = .sharingDenied
        result = try await authorization.check(read: [], write: ["bloodPressure"])
        XCTAssertEqual(result["write"] as? [String: String], ["bloodPressure": "notGranted"])
    }

    /// HealthKit takes any member value without raising (checked on iOS 27); out-of-range values fail the save instead.
    func testMemberValuesNeverRaise() {
        let date = Date()
        for value in [-1.0, 0, 1e7] {
            let quantity = HKQuantity(unit: .millimeterOfMercury(), doubleValue: value)
            XCTAssertNoThrow(HKQuantitySample(type: HKQuantityType(.bloodPressureSystolic), quantity: quantity, start: date, end: date), "\(value)")
        }
    }
}
