import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

private final class FakeStore: HealthStoreAuthorizing {
    var requested: (share: Set<HKSampleType>, read: Set<HKObjectType>)?
    var shareStatus: HKAuthorizationStatus = .notDetermined
    var requestStatus: HKAuthorizationRequestStatus = .shouldRequest
    var earliestDates: [HKObjectType: Date] = [:]

    func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws {
        requested = (toShare, read)
        shareStatus = .sharingAuthorized
        requestStatus = .unnecessary
    }

    func authorizationStatus(for type: HKObjectType) -> HKAuthorizationStatus { shareStatus }

    func statusForAuthorizationRequest(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws -> HKAuthorizationRequestStatus {
        requestStatus
    }

    func earliestAuthorizedSampleDates(for types: Set<HKObjectType>) async throws -> [HKObjectType: Date] {
        earliestDates.filter { types.contains($0.key) }
    }
}

final class AuthorizationTests: XCTestCase {
    private let fullInfo: [String: Any] = [
        "NSHealthShareUsageDescription": "Reads your cycle data.",
        "NSHealthUpdateUsageDescription": "Saves your cycle data."
    ]
    private let flow = HKObjectType.categoryType(forIdentifier: .menstrualFlow)

    func testReadStatusNeverClaimsAccess() {
        XCTAssertEqual(Authorization.readStatus(.shouldRequest), "notDetermined")
        XCTAssertEqual(Authorization.readStatus(.unnecessary), "unknown")
        XCTAssertEqual(Authorization.readStatus(.unknown), "unknown")
    }

    func testWriteStatus() {
        XCTAssertEqual(Authorization.writeStatus(.notDetermined), "notDetermined")
        XCTAssertEqual(Authorization.writeStatus(.sharingDenied), "notGranted")
        XCTAssertEqual(Authorization.writeStatus(.sharingAuthorized), "granted")
    }

    func testMissingUsageDescriptions() {
        XCTAssertEqual(
            Authorization.missingUsageDescriptions(read: true, write: true, info: [:]),
            ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"]
        )
        XCTAssertEqual(
            Authorization.missingUsageDescriptions(read: false, write: true, info: ["NSHealthUpdateUsageDescription": ""]),
            ["NSHealthUpdateUsageDescription"]
        )
        XCTAssertEqual(Authorization.missingUsageDescriptions(read: true, write: true, info: fullInfo), [])
    }

    func testRequestRejectsMissingDeclarationsBeforeTouchingHealthKit() async {
        let store = FakeStore()
        let authorization = Authorization(store: store, infoDictionary: { ["NSHealthShareUsageDescription": "x"] })
        do {
            _ = try await authorization.request(read: ["menstrualFlow"], write: ["menstrualFlow"])
            XCTFail("expected MISSING_DECLARATION")
        } catch {
            let error = HealthError.from(error)
            XCTAssertEqual(error.code, .missingDeclaration)
            XCTAssertEqual(error.data["missing"] as? [String], ["NSHealthUpdateUsageDescription"])
        }
        XCTAssertNil(store.requested)
    }

    func testRequestReportsStatusesAfterTheSheet() async throws {
        let store = FakeStore()
        let authorization = Authorization(store: store, infoDictionary: { self.fullInfo })
        let result = try await authorization.request(
            read: ["menstrualFlow", "menstruationPeriod", "skinTemperature"],
            write: ["menstrualFlow", "skinTemperature"]
        )
        XCTAssertEqual(store.requested?.read.count, 1, "flow and period share one HealthKit type")
        XCTAssertEqual(store.requested?.share.count, 1)
        XCTAssertEqual(result["read"] as? [String: String], [
            "menstrualFlow": "unknown",
            "menstruationPeriod": "unknown",
            "skinTemperature": "unsupported"
        ])
        XCTAssertEqual(result["write"] as? [String: String], ["menstrualFlow": "granted", "skinTemperature": "unsupported"])
        XCTAssertNil(result["earliestAuthorizedDates"])
    }

    func testRequestNeverAsksToShareReadOnlyTypes() async {
        let store = FakeStore()
        let authorization = Authorization(store: store, infoDictionary: { self.fullInfo })
        do {
            _ = try await authorization.request(read: [], write: ["wristTemperature"])
            XCTFail("expected READ_ONLY_TYPE")
        } catch {
            XCTAssertEqual(HealthError.from(error).code, .readOnlyType)
        }
        XCTAssertNil(store.requested)
    }

    func testOnlyUnsupportedTypesSkipTheSheet() async throws {
        let store = FakeStore()
        let authorization = Authorization(store: store, infoDictionary: { [:] })
        let result = try await authorization.request(read: ["skinTemperature"], write: [])
        XCTAssertNil(store.requested)
        XCTAssertEqual(result["read"] as? [String: String], ["skinTemperature": "unsupported"])
    }

    func testCheckBeforeAsking() async throws {
        let authorization = Authorization(store: FakeStore(), infoDictionary: { self.fullInfo })
        let result = try await authorization.check(read: ["ovulationTest"], write: ["ovulationTest"])
        XCTAssertEqual(result["read"] as? [String: String], ["ovulationTest": "notDetermined"])
        XCTAssertEqual(result["write"] as? [String: String], ["ovulationTest": "notDetermined"])
    }

    func testReportsEarliestAuthorizedDatesForEveryIdOfTheType() async throws {
        let store = FakeStore()
        let flow = try XCTUnwrap(flow)
        store.earliestDates = [flow: Date(timeIntervalSince1970: 1_790_000_000)]
        let authorization = Authorization(store: store, infoDictionary: { self.fullInfo })
        let result = try await authorization.check(read: ["menstrualFlow", "menstruationPeriod", "acne"], write: [])
        let dates = try XCTUnwrap(result["earliestAuthorizedDates"] as? [String: String])
        XCTAssertEqual(Set(dates.keys), ["menstrualFlow", "menstruationPeriod"])
        XCTAssertEqual(DateCoding.date(from: dates["menstrualFlow"] ?? ""), Date(timeIntervalSince1970: 1_790_000_000))
    }
}
