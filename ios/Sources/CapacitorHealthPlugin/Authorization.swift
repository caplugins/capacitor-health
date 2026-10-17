import Foundation
import HealthKit

/// `requestAuthorization` and `checkAuthorization` (R2–R4, decision #37).
///
/// iOS never reveals read access: read status is `notDetermined` until the app has asked, `unknown` after.
final class Authorization {
    static let readUsageKey = "NSHealthShareUsageDescription"
    static let writeUsageKey = "NSHealthUpdateUsageDescription"

    private let store: HealthStoreAuthorizing
    private let infoDictionary: () -> [String: Any]?

    init(store: HealthStoreAuthorizing, infoDictionary: @escaping () -> [String: Any]? = { Bundle.main.infoDictionary }) {
        self.store = store
        self.infoDictionary = infoDictionary
    }

    // MARK: - Rules

    static func writeStatus(_ status: HKAuthorizationStatus) -> String {
        switch status {
        case .sharingAuthorized: return "granted"
        case .sharingDenied: return "notGranted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notGranted"
        }
    }

    /// HealthKit only says whether asking would show the sheet; whether reading was allowed stays hidden.
    static func readStatus(_ status: HKAuthorizationRequestStatus) -> String {
        status == .shouldRequest ? "notDetermined" : "unknown"
    }

    /// `Info.plist` keys HealthKit needs before it shows the sheet. Without them it raises an
    /// Objective-C exception that crashes the app, so the plugin checks first.
    static func missingUsageDescriptions(read: Bool, write: Bool, info: [String: Any]?) -> [String] {
        var missing: [String] = []
        let has = { (key: String) in ((info?[key] as? String) ?? "").isEmpty == false }
        if read && !has(readUsageKey) { missing.append(readUsageKey) }
        if write && !has(writeUsageKey) { missing.append(writeUsageKey) }
        return missing
    }

    // MARK: - Calls

    func request(read: [String], write: [String]) async throws -> [String: Any] {
        let readTypes = Set(read.compactMap { try? HealthTypes.resolve($0).1 }.map { $0 as HKObjectType })
        var shareTypes = Set<HKSampleType>()
        for typeId in write {
            guard let entry = Registry.byId[typeId], HealthTypes.sampleType(for: entry) != nil else { continue }
            // Asking to share a type HealthKit disallows raises an exception, so this must never get through.
            shareTypes.insert(try HealthTypes.resolveWritable(typeId).1)
        }
        let missing = Self.missingUsageDescriptions(read: !readTypes.isEmpty, write: !shareTypes.isEmpty, info: infoDictionary())
        if !missing.isEmpty {
            throw HealthError(
                .missingDeclaration,
                "Add \(missing.joined(separator: " and ")) to the app's Info.plist.",
                data: ["missing": missing]
            )
        }
        if !readTypes.isEmpty || !shareTypes.isEmpty {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
        }
        return try await check(read: read, write: write)
    }

    func check(read: [String], write: [String]) async throws -> [String: Any] {
        var readStatuses: [String: String] = [:]
        var readTypes: [HKObjectType: String] = [:]
        for typeId in read {
            guard let (_, type) = try? HealthTypes.resolve(typeId) else {
                readStatuses[typeId] = "unsupported"
                continue
            }
            let status = try await store.statusForAuthorizationRequest(toShare: [], read: [type])
            readStatuses[typeId] = Self.readStatus(status)
            readTypes[type] = typeId
        }

        var writeStatuses: [String: String] = [:]
        for typeId in write {
            guard let (_, type) = try? HealthTypes.resolve(typeId) else {
                writeStatuses[typeId] = "unsupported"
                continue
            }
            writeStatuses[typeId] = Self.writeStatus(store.authorizationStatus(for: type))
        }

        var result: [String: Any] = ["read": readStatuses, "write": writeStatuses]
        let dates = try await store.earliestAuthorizedSampleDates(for: Set(readTypes.keys))
        if !dates.isEmpty {
            var byId: [String: String] = [:]
            for (type, date) in dates {
                // menstrualFlow and menstruationPeriod share a HealthKit type: report it for both.
                for typeId in read where (try? HealthTypes.resolve(typeId).1) == type {
                    byId[typeId] = DateCoding.string(from: date)
                }
            }
            result["earliestAuthorizedDates"] = byId
        }
        return result
    }
}
