import Foundation
import HealthKit

/// `readSamples`, `saveSamples` and `deleteSamples` for every registered type.
final class Samples {
    static let defaultLimit = 1000
    static let maxLimit = 10000

    private let store: HKHealthStore

    init(store: HKHealthStore) {
        self.store = store
    }

    // MARK: - Read

    func read(_ options: JSONFields) async throws -> [String: Any] {
        let typeId = try options.string("type")
        let (entry, type) = try HealthTypes.resolve(typeId)
        let start = try options.date("startDate")
        let end = try options.date("endDate")
        let limit = min(max(options.optionalInt("limit") ?? Self.defaultLimit, 1), Self.maxLimit)
        let ascending = options.optionalBool("ascending") ?? true
        let unit = options.optionalString("unit")
        if let unit, !entry.units.contains(unit) {
            throw HealthError.invalidArgument("unit", "isn't a unit of \(typeId)")
        }
        if entry.derivedFrom != nil {
            throw HealthError(.nativeError, "\(typeId) reads aren't implemented yet.")
        }

        var predicates = [HKQuery.predicateForSamples(withStart: start, end: end, options: [])]
        if let sourceIds = options.strings("sourceIds") {
            let sources = try await store.sources(of: type).filter { sourceIds.contains($0.bundleIdentifier) }
            if sources.isEmpty { return ["samples": [Any]()] }
            predicates.append(HKQuery.predicateForObjects(from: sources))
        }
        let cursor = try options.optionalString("cursor").map { try ReadCursor.decode($0, typeId: typeId) }
        if let cursor {
            predicates.append(NSPredicate(format: ascending ? "%K >= %@" : "%K <= %@", HKPredicateKeyPathStartDate, cursor.startDate as NSDate))
        }
        let skip = cursor?.skip ?? 0
        let fetched = try await store.samples(
            of: type,
            predicate: NSCompoundPredicate(andPredicateWithSubpredicates: predicates),
            limit: skip + limit + 1,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)]
        )
        let page = Array(fetched.dropFirst(skip).prefix(limit))
        var result: [String: Any] = ["samples": page.map { SampleCodec.encode($0, entry: entry, unit: unit) }]
        let next = ReadCursor.next(typeId: typeId, pageStarts: page.map(\.startDate), hasMore: fetched.count > skip + limit, previous: cursor)
        if let next { result["nextCursor"] = next.encoded() }
        HealthLog.debug("readSamples \(typeId): \(page.count) samples")
        return result
    }

    // MARK: - Save

    func save(_ samples: [[String: Any]]) async throws -> [String: Any] {
        guard !samples.isEmpty else { throw HealthError.invalidArgument("samples", "must be a non-empty array") }
        var objects: [HKSample] = []
        var clientIds: [String?] = []
        for (index, json) in samples.enumerated() {
            let fields = JSONFields(json, path: "samples[\(index)]")
            let (entry, type) = try HealthTypes.resolveWritable(try fields.string("type"))
            if entry.derivedFrom != nil {
                throw HealthError(.nativeError, "\(entry.typeId) writes aren't implemented yet.")
            }
            objects.append(try SampleCodec.decode(fields, entry: entry, type: type))
            clientIds.append(fields.optionalString("clientId"))
        }
        try await store.save(objects)
        return ["ids": try await storedIds(objects, clientIds: clientIds)]
    }

    /// HealthKit ignores a lower sync version and replaces an equal one with a new UUID, yet `save` hands
    /// back the in-memory UUIDs either way (T06 S1–S2), so upserted samples are looked up again (#28).
    private func storedIds(_ objects: [HKSample], clientIds: [String?]) async throws -> [String] {
        var byType: [HKSampleType: [String]] = [:]
        for (object, clientId) in zip(objects, clientIds) {
            if let clientId { byType[object.sampleType, default: []].append(clientId) }
        }
        var stored: [String: String] = [:]
        for (type, ids) in byType {
            stored.merge(try await store.ownSampleIds(of: type, clientIds: ids)) { $1 }
        }
        return zip(objects, clientIds).map { object, clientId in
            clientId.flatMap { stored[$0] } ?? object.uuid.uuidString
        }
    }

    // MARK: - Delete

    func delete(_ options: JSONFields) async throws -> [String: Any] {
        let typeId = try options.string("type")
        let (entry, type) = try HealthTypes.resolveWritable(typeId)
        if entry.derivedFrom != nil {
            throw HealthError(.nativeError, "\(typeId) deletes aren't implemented yet.")
        }
        return ["deleted": try await store.deleteOwnObjects(of: type, matching: try Self.deletePredicate(options))]
    }

    static func deletePredicate(_ options: JSONFields) throws -> NSPredicate {
        if let ids = options.strings("ids") {
            return HKQuery.predicateForObjects(with: Set(ids.compactMap(UUID.init(uuidString:))))
        }
        if let clientIds = options.strings("clientIds") {
            return HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: clientIds)
        }
        return HKQuery.predicateForSamples(withStart: try options.date("startDate"), end: try options.date("endDate"), options: [])
    }
}
