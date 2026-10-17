import Foundation
import HealthKit

/// Async wrappers for the HealthKit queries the plugin runs. The iOS 15.4 query descriptors are above the
/// iOS 15.0 floor, so these wrap the callback APIs.
extension HKHealthStore {
    func samples(
        of type: HKSampleType,
        predicate: NSPredicate?,
        limit: Int = HKObjectQueryNoLimit,
        sortDescriptors: [NSSortDescriptor]? = nil
    ) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: sortDescriptors) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }
            execute(query)
        }
    }

    func sources(of type: HKSampleType) async throws -> Set<HKSource> {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSourceQuery(sampleType: type, samplePredicate: nil) { _, sources, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: sources ?? [])
                }
            }
            execute(query)
        }
    }

    /// Deletes this app's objects of `type` matching `predicate`; HealthKit only lets apps delete their own.
    func deleteOwnObjects(of type: HKObjectType, matching predicate: NSPredicate) async throws -> Int {
        let own = NSCompoundPredicate(andPredicateWithSubpredicates: [predicate, HKQuery.predicateForObjects(from: HKSource.default())])
        return try await withCheckedThrowingContinuation { continuation in
            deleteObjects(of: type, predicate: own) { _, count, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: count)
                }
            }
        }
    }

    /// The stored ids of this app's samples with the given sync identifiers (decision #28).
    func ownSampleIds(of type: HKSampleType, clientIds: [String]) async throws -> [String: String] {
        guard !clientIds.isEmpty else { return [:] }
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: clientIds),
            HKQuery.predicateForObjects(from: HKSource.default())
        ])
        var ids: [String: String] = [:]
        for sample in try await samples(of: type, predicate: predicate) {
            if let clientId = sample.metadata?[HKMetadataKeySyncIdentifier] as? String { ids[clientId] = sample.uuid.uuidString }
        }
        return ids
    }
}
