import Foundation
import HealthKit

/// `readSamples`, `saveSamples` and `deleteSamples` for every registered type.
final class Samples {
    static let defaultLimit = 1000
    static let maxLimit = 10000

    private let store: HKHealthStore
    private lazy var periods = try? MenstruationPeriods(store: store)

    init(store: HKHealthStore) {
        self.store = store
    }

    private func periodService() throws -> MenstruationPeriods {
        guard let periods else { throw HealthError.unsupportedType("menstruationPeriod", reason: "osVersion") }
        return periods
    }

    // MARK: - Read

    func read(_ options: JSONFields) async throws -> [String: Any] {
        let typeId = try options.string("type")
        let (entry, _) = try HealthTypes.resolve(typeId)
        try HealthTypes.requireSamples(entry)
        let start = try options.date("startDate")
        let end = try options.date("endDate")
        let limit = min(max(options.optionalInt("limit") ?? Self.defaultLimit, 1), Self.maxLimit)
        let ascending = options.optionalBool("ascending") ?? true
        let unit = options.optionalString("unit")
        if let unit, !entry.units.contains(unit) {
            throw HealthError.invalidArgument("unit", "isn't a unit of \(typeId)")
        }
        if entry.derivedFrom != nil {
            return try await periodService().read(options, start: start, end: end, limit: limit, ascending: ascending)
        }

        let cursor = try options.optionalString("cursor").map { try ReadCursor.decode($0, typeId: typeId) }
        var predicates = [HKQuery.predicateForSamples(withStart: start, end: end, options: [])]
        if let cursor {
            predicates.append(NSPredicate(format: ascending ? "%K >= %@" : "%K <= %@", HKPredicateKeyPathStartDate, cursor.startDate as NSDate))
        }
        let skip = cursor?.skip ?? 0
        let sourceIds = options.strings("sourceIds")
        // A combined id queries each member; every list is fetched as deep as a single type would be.
        var lists: [[HKSample]] = []
        for (_, type) in HealthTypes.readTypes(for: entry) {
            var typePredicates = predicates
            if let sourceIds {
                let sources = try await store.sources(of: type).filter { sourceIds.contains($0.bundleIdentifier) }
                if sources.isEmpty { continue }
                typePredicates.append(HKQuery.predicateForObjects(from: sources))
            }
            lists.append(try await store.samples(
                of: type,
                predicate: NSCompoundPredicate(andPredicateWithSubpredicates: typePredicates),
                limit: skip + limit + 1,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)]
            ))
        }
        let fetched = Self.merge(lists, ascending: ascending)
        let page = Array(fetched.dropFirst(skip).prefix(limit))
        var result: [String: Any] = ["samples": page.map { SampleCodec.encode($0, entry: entry, unit: unit) }]
        let next = ReadCursor.next(typeId: typeId, pageStarts: page.map(\.startDate), hasMore: fetched.count > skip + limit, previous: cursor)
        if let next { result["nextCursor"] = next.encoded() }
        HealthLog.debug("readSamples \(typeId): \(page.count) samples")
        return result
    }

    /// Lists sorted by start date, merged in one deterministic order: by start date, then by list, then by
    /// position in the list. Paging relies on ties keeping their order from page to page.
    static func merge(_ lists: [[HKSample]], ascending: Bool) -> [HKSample] {
        guard lists.count > 1 else { return lists.first ?? [] }
        let keyed = lists.enumerated().flatMap { list, samples in samples.enumerated().map { (list, $0, $1) } }
        return keyed.sorted { lhs, rhs in
            if lhs.2.startDate != rhs.2.startDate { return ascending == (lhs.2.startDate < rhs.2.startDate) }
            return (lhs.0, lhs.1) < (rhs.0, rhs.1)
        }.map(\.2)
    }

    // MARK: - Save

    func save(_ samples: [[String: Any]]) async throws -> [String: Any] {
        guard !samples.isEmpty else { throw HealthError.invalidArgument("samples", "must be a non-empty array") }
        // Each input sample becomes one object, or one per day for a period (decision #29).
        var groups: [(objects: [HKSample], periodClientId: String?)] = []
        for (index, json) in samples.enumerated() {
            let fields = JSONFields(json, path: "samples[\(index)]")
            let (entry, type) = try HealthTypes.resolveWritable(try fields.string("type"))
            if entry.derivedFrom != nil {
                groups.append((try periodService().expand(fields), fields.optionalString("clientId")))
            } else {
                groups.append(([try SampleCodec.decode(fields, entry: entry, type: type)], nil))
            }
        }
        let objects = groups.flatMap(\.objects)
        try await store.save(objects)
        for group in groups {
            guard let clientId = group.periodClientId else { continue }
            let kept = Set(group.objects.compactMap { $0.metadata?[HKMetadataKeySyncIdentifier] as? String })
            let version = (group.objects.first?.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 1
            try await periodService().deleteDroppedDays(clientId: clientId, version: version, kept: kept, around: group.objects)
        }
        let firsts = groups.compactMap(\.objects.first)
        return ["ids": try await storedIds(firsts)]
    }

    /// HealthKit ignores a lower sync version and replaces an equal one with a new UUID, yet `save` hands
    /// back the in-memory UUIDs either way (T06 S1–S2), so upserted samples are looked up again (#28).
    private func storedIds(_ objects: [HKSample]) async throws -> [String] {
        let clientIds = objects.map { $0.metadata?[HKMetadataKeySyncIdentifier] as? String }
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
            return ["deleted": try await periodService().delete(options)]
        }
        let predicate = try Self.deletePredicate(options)
        if let correlationType = type as? HKCorrelationType {
            return ["deleted": try await store.deleteOwnCorrelations(of: correlationType, matching: predicate)]
        }
        var types = [type]
        if !entry.members.isEmpty {
            // A combined id deletes from every member the app may write; HealthKit rejects deletes from the others.
            let members = HealthTypes.readTypes(for: entry).map(\.1).filter { store.authorizationStatus(for: $0) == .sharingAuthorized }
            if !members.isEmpty { types = members }
        }
        var deleted = 0
        for type in types {
            deleted += try await store.deleteOwnObjects(of: type, matching: predicate)
        }
        return ["deleted": deleted]
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
