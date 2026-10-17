import Foundation
import HealthKit

/// The `getChanges` cursor on iOS: one archived `HKQueryAnchor` per type, `{ v: 1, anchors: { key: base64 } }`
/// as base64 JSON. Opaque to apps. The key is the type id, or `typeId/memberId` for each member of a combined id.
struct ChangesCursor: Equatable {
    let anchors: [String: String]

    static func key(typeId: String, member: String?) -> String {
        member.map { "\(typeId)/\($0)" } ?? typeId
    }

    static func typeId(ofKey key: String) -> String {
        String(key.prefix { $0 != "/" })
    }

    func encoded() -> String {
        let json: [String: Any] = ["v": 1, "anchors": anchors]
        return ((try? JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])) ?? Data()).base64EncodedString()
    }

    static func decode(_ string: String, types: [String]) throws -> ChangesCursor {
        guard let data = Data(base64Encoded: string),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["v"] as? Int == 1, let anchors = json["anchors"] as? [String: String] else {
            throw HealthError.invalidArgument("cursor", "isn't a getChanges cursor")
        }
        guard Set(anchors.keys.map(typeId(ofKey:))) == Set(types) else {
            throw HealthError.invalidArgument("cursor", "was created for other types", reason: "cursorMismatch")
        }
        return ChangesCursor(anchors: anchors)
    }

    static func archive(_ anchor: HKQueryAnchor) throws -> String {
        try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true).base64EncodedString()
    }

    static func unarchive(_ string: String) throws -> HKQueryAnchor {
        guard let data = Data(base64Encoded: string),
              let anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else {
            throw HealthError.invalidArgument("cursor", "isn't a getChanges cursor")
        }
        return anchor
    }
}

/// `getChanges` (R8, decision #17): one anchored query per type.
final class Changes {
    private let store: HKHealthStore

    init(store: HKHealthStore) {
        self.store = store
    }

    func changes(_ options: JSONFields) async throws -> [String: Any] {
        guard let types = options.strings("types"), !types.isEmpty else {
            throw HealthError.invalidArgument("types", "must be a non-empty array of types")
        }
        var resolved: [(entry: RegistryEntry, key: String, type: HKSampleType)] = []
        for typeId in types {
            let (entry, _) = try HealthTypes.resolve(typeId)
            try HealthTypes.requireSamples(entry)
            // A period is derived from several flow samples; its changes can't be expressed per sample.
            if entry.derivedFrom != nil {
                throw HealthError(
                    .unsupportedType,
                    "\(typeId) changes aren't available on iOS: follow \(entry.derivedFrom ?? "") and re-read periods.",
                    data: ["type": typeId, "reason": "derivedType"]
                )
            }
            let combined = !entry.members.isEmpty
            for (member, type) in HealthTypes.readTypes(for: entry) {
                resolved.append((entry, ChangesCursor.key(typeId: typeId, member: combined ? member.typeId : nil), type))
            }
        }
        guard let cursorString = options.optionalString("cursor") else {
            var anchors: [String: String] = [:]
            for (_, key, type) in resolved { anchors[key] = try ChangesCursor.archive(try await currentAnchor(type)) }
            return ["upserted": [Any](), "deleted": [Any](), "nextCursor": ChangesCursor(anchors: anchors).encoded(), "hasMore": false]
        }

        let cursor = try ChangesCursor.decode(cursorString, types: types)
        let limit = min(max(options.optionalInt("limit") ?? Samples.defaultLimit, 1), Samples.maxLimit)
        let excludeOwn = options.optionalBool("excludeOwnWrites") ?? false
        let ownSource = HKSource.default()
        var upserted: [[String: Any]] = []
        var deleted: [[String: Any]] = []
        var anchors: [String: String] = [:]
        var hasMore = false
        for (entry, key, type) in resolved {
            // A member that's new since the cursor was made (an iOS update) starts from now.
            let anchor = if let archived = cursor.anchors[key] {
                try ChangesCursor.unarchive(archived)
            } else {
                try await currentAnchor(type)
            }
            let page = try await anchoredQuery(type, anchor: anchor, predicate: nil, limit: limit)
            let changed = page.samples.filter { !excludeOwn || $0.sourceRevision.source != ownSource }
            if entry.typeId == SleepSessions.typeId {
                // A session is derived from several samples: report the sessions holding changed samples, whole
                // (decision #65). Deleted entries name the deleted sample: a session id or one of its stageSampleIds.
                upserted += try await SleepSessions(store: store).sessions(containing: changed)
            } else {
                upserted += changed.map { SampleCodec.encode($0, entry: entry) }
            }
            deleted += page.deleted.map { object in
                var json: [String: Any] = ["type": entry.typeId, "id": object.uuid.uuidString]
                // Deleted objects keep their sync identifier (T06 S4).
                if let clientId = object.metadata?[HKMetadataKeySyncIdentifier] as? String {
                    // A stage sample of a session the plugin wrote reports the session's clientId.
                    json["clientId"] = entry.typeId == SleepSessions.typeId ? SleepDerivation.split(clientId: clientId)?.session ?? clientId : clientId
                }
                return json
            }
            anchors[key] = try ChangesCursor.archive(page.anchor ?? anchor)
            // HealthKit doesn't say whether more is waiting; a full page means there may be.
            if page.samples.count + page.deleted.count >= limit { hasMore = true }
        }
        HealthLog.debug("getChanges: \(upserted.count) upserted, \(deleted.count) deleted")
        return ["upserted": upserted, "deleted": deleted, "nextCursor": ChangesCursor(anchors: anchors).encoded(), "hasMore": hasMore]
    }

    /// An anchor for "now" without reading history: a nil anchor returns every sample and every tombstone
    /// ever stored (T06 S3), so the query only matches samples starting in the future.
    private func currentAnchor(_ type: HKSampleType) async throws -> HKQueryAnchor {
        let future = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(100 * 365 * 86_400), end: nil, options: .strictStartDate)
        let page = try await anchoredQuery(type, anchor: nil, predicate: future, limit: HKObjectQueryNoLimit)
        return page.anchor ?? HKQueryAnchor(fromValue: 0)
    }

    private struct Page {
        let samples: [HKSample]
        let deleted: [HKDeletedObject]
        let anchor: HKQueryAnchor?
    }

    private func anchoredQuery(_ type: HKSampleType, anchor: HKQueryAnchor?, predicate: NSPredicate?, limit: Int) async throws -> Page {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: type, predicate: predicate, anchor: anchor, limit: limit
            ) { _, samples, deleted, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: Page(samples: samples ?? [], deleted: deleted ?? [], anchor: newAnchor))
                }
            }
            store.execute(query)
        }
    }
}
