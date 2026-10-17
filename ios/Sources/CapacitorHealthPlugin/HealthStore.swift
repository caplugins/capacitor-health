import Foundation
import HealthKit

/// The `HKHealthStore` calls the plugin's authorization code makes, behind a protocol so tests can fake them.
protocol HealthStoreAuthorizing: AnyObject {
    func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws
    func authorizationStatus(for type: HKObjectType) -> HKAuthorizationStatus
    func statusForAuthorizationRequest(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws -> HKAuthorizationRequestStatus
    /// iOS 27+: the start of the history the user shared, for types with limited read access. Empty before iOS 27.
    func earliestAuthorizedSampleDates(for types: Set<HKObjectType>) async throws -> [HKObjectType: Date]
}

extension HKHealthStore: HealthStoreAuthorizing {
    func earliestAuthorizedSampleDates(for types: Set<HKObjectType>) async throws -> [HKObjectType: Date] {
        guard #available(iOS 27.0, *), !types.isEmpty else { return [:] }
        return try await withCheckedThrowingContinuation { continuation in
            getEarliestAuthorizedSampleDate(for: types) { dates, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: dates ?? [:])
                }
            }
        }
    }
}
