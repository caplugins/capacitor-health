import Foundation
import HealthKit

/// `sleepSession` on iOS, which has no session object: sessions are derived from `sleepAnalysis` samples on
/// read and written as an `inBed` span plus one sample per stage (decision #64). The rules live in
/// `SleepDerivation`; this class talks to HealthKit.
final class SleepSessions {
    static let typeId = "sleepSession"
    static let stageSet = "sleepStage"
    /// Stages HealthKit only has from iOS 16 (`asleepCore`, `asleepDeep`, `asleepREM`); it raises an
    /// exception for them on iOS 15 (decision #59). Mirrors `sleepStage`'s `valueMinOS` in the registry.
    static let iOS16Stages: Set<String> = ["light", "deep", "rem"]
    /// How far either side of a re-written session to look for its old stage samples.
    static let rewriteSearch: TimeInterval = 14 * 86_400

    private let store: HKHealthStore
    private let entry: RegistryEntry
    private let type: HKCategoryType

    init(store: HKHealthStore) throws {
        self.store = store
        let (entry, type) = try HealthTypes.resolve(Self.typeId)
        guard let type = type as? HKCategoryType else { throw HealthError.unsupportedType(Self.typeId, reason: "notOnPlatform") }
        self.entry = entry
        self.type = type
    }

    /// The stage values this iOS can store.
    static func supportedStages() -> [String] {
        let all = Registry.valueSets[stageSet]?.values ?? []
        if #available(iOS 16.0, *) { return all }
        return all.filter { !iOS16Stages.contains($0) }
    }

    // MARK: - Read

    private func samples(from start: Date, to end: Date, extra: NSPredicate? = nil) async throws -> [HKCategorySample] {
        var predicates = [HKQuery.predicateForSamples(withStart: start, end: end, options: [])]
        if let extra { predicates.append(extra) }
        let samples = try await store.samples(
            of: type,
            predicate: NSCompoundPredicate(andPredicateWithSubpredicates: predicates),
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        )
        return samples.compactMap { $0 as? HKCategorySample }
    }

    /// The derivation's view of a sample. A raw value newer than the registry has no stage: it reads as its
    /// number, which no stage priority knows, so it covers time only where nothing else does.
    static func stageSample(_ sample: HKCategorySample) -> SleepDerivation.StageSample {
        SleepDerivation.StageSample(
            id: sample.uuid.uuidString,
            start: sample.startDate,
            end: sample.endDate,
            stage: SampleCodec.unifiedValue(raw: sample.value, valueSet: stageSet),
            sourceId: sample.sourceRevision.source.bundleIdentifier,
            clientId: sample.metadata?[HKMetadataKeySyncIdentifier] as? String,
            clientVersion: (sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue
        )
    }

    private func sourcePredicate(_ sourceIds: [String]?) async throws -> (NSPredicate?, empty: Bool) {
        guard let sourceIds else { return (nil, false) }
        let matching = try await store.sources(of: type).filter { sourceIds.contains($0.bundleIdentifier) }
        return matching.isEmpty ? (nil, true) : (HKQuery.predicateForObjects(from: matching), false)
    }

    /// The sessions overlapping `[start, end]`, with the samples they came from.
    func derive(from start: Date, to end: Date, sources: NSPredicate? = nil) async throws -> [(SleepDerivation.Session, [HKCategorySample])] {
        let margin = SleepDerivation.lookAround
        let samples = try await samples(from: start.addingTimeInterval(-margin), to: end.addingTimeInterval(margin), extra: sources)
        let byId = Dictionary(uniqueKeysWithValues: samples.map { ($0.uuid.uuidString, $0) })
        return SleepDerivation.sessions(samples.map(Self.stageSample), overlapping: start, end).map { session in
            (session, session.samples.compactMap { byId[$0.id] })
        }
    }

    /// A `SleepSessionSample`: the base fields of the session's id sample, its bounds and stages in that
    /// sample's recorded time zone (else the device's).
    static func encode(_ session: SleepDerivation.Session, samples: [HKCategorySample]) -> [String: Any] {
        guard let first = samples.first(where: { $0.uuid.uuidString == session.id }) ?? samples.first else { return [:] }
        var json = SampleCodec.encodeBase(first, typeId: typeId, kind: "special")
        let zone = SampleCodec.recordedTimeZone(first) ?? .current
        json["startDate"] = DateCoding.string(from: session.start, timeZone: zone)
        json["endDate"] = DateCoding.string(from: session.end, timeZone: zone)
        json["stages"] = session.stages.map { stage in
            [
                "stage": stage.stage,
                "startDate": DateCoding.string(from: stage.start, timeZone: zone),
                "endDate": DateCoding.string(from: stage.end, timeZone: zone)
            ]
        }
        json["derived"] = true
        json["stageSampleIds"] = session.samples.map(\.id)
        if let clientId = session.clientId {
            json["clientId"] = clientId
            if let version = session.clientVersion { json["clientVersion"] = version } else { json.removeValue(forKey: "clientVersion") }
        } else {
            json.removeValue(forKey: "clientId")
            json.removeValue(forKey: "clientVersion")
        }
        return json
    }

    func read(_ options: JSONFields, start: Date, end: Date, limit: Int, ascending: Bool) async throws -> [String: Any] {
        let (sources, empty) = try await sourcePredicate(options.strings("sourceIds"))
        if empty { return ["samples": [Any]()] }
        // Sorted by start, then source and id, so ties keep their order from page to page (as `Samples.read`).
        var sessions = try await derive(from: start, to: end, sources: sources)
        if !ascending { sessions.reverse() }
        let cursor = try options.optionalString("cursor").map { try ReadCursor.decode($0, typeId: entry.typeId) }
        if let cursor {
            sessions = Array(sessions.filter { ascending ? $0.0.start >= cursor.startDate : $0.0.start <= cursor.startDate }.dropFirst(cursor.skip))
        }
        let page = Array(sessions.prefix(limit))
        var result: [String: Any] = ["samples": page.map { Self.encode($0.0, samples: $0.1) }]
        let next = ReadCursor.next(typeId: entry.typeId, pageStarts: page.map(\.0.start), hasMore: sessions.count > limit, previous: cursor)
        if let next { result["nextCursor"] = next.encoded() }
        HealthLog.debug("readSamples sleepSession: \(page.count) sessions")
        return result
    }

    // MARK: - Write

    /// The HealthKit samples a validated `NewSleepSession` becomes (`SleepDerivation.expand`).
    func expand(_ fields: JSONFields) throws -> [HKCategorySample] {
        let start = try fields.date("startDate")
        let end = try fields.date("endDate")
        guard end > start else { throw HealthError.invalidArgument(fields.field("endDate"), "must be after startDate", reason: "endNotAfterStart") }
        for name in ["title", "notes"] where fields.values[name] != nil {
            throw HealthError.invalidArgument(fields.field(name), "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
        }
        let supported = Set(Self.supportedStages())
        let rawStages = fields.values["stages"] as? [[String: Any]] ?? []
        let stages = try rawStages.enumerated().map { index, json -> SleepDerivation.Stage in
            let stage = JSONFields(json, path: fields.field("stages[\(index)]"))
            let value = try stage.string("stage")
            guard supported.contains(value) else {
                throw HealthError.invalidArgument(stage.field("stage"), "can't be stored on this iOS version", reason: "valueUnsupportedOnPlatform")
            }
            return SleepDerivation.Stage(stage: value, start: try stage.date("startDate"), end: try stage.date("endDate"))
        }
        let base = try SampleCodec.baseMetadata(fields)
        let device = SampleCodec.device(fields)
        let clientId = fields.optionalString("clientId")
        return try SleepDerivation.expand(start: start, end: end, stages: stages, clientId: clientId).map { planned in
            var metadata = base
            if let clientId = planned.clientId { metadata[HKMetadataKeySyncIdentifier] = clientId }
            let raw = try SampleCodec.rawValue(planned.stage, valueSet: Self.stageSet, field: fields.field("stages"))
            return HKCategorySample(type: type, value: raw, start: planned.start, end: planned.end, device: device, metadata: metadata)
        }
    }

    /// After re-writing a session with the same clientId, deletes this app's stage samples of it that the new
    /// write no longer has. Samples stored with a higher version than this write stay: HealthKit ignored the
    /// write for them too.
    func deleteStaleStages(clientId: String, version: Int, written: [HKSample]) async throws {
        guard let first = written.map(\.startDate).min(), let last = written.map(\.endDate).max() else { return }
        let own = HKQuery.predicateForObjects(from: HKSource.default())
        let candidates = try await samples(from: first.addingTimeInterval(-Self.rewriteSearch), to: last.addingTimeInterval(Self.rewriteSearch), extra: own)
        let planned = written.map { sample in
            SleepDerivation.PlannedSample(
                stage: "", start: sample.startDate, end: sample.endDate, clientId: sample.metadata?[HKMetadataKeySyncIdentifier] as? String
            )
        }
        let ownStages = candidates.map(Self.stageSample).filter { sample in
            sample.clientId.flatMap(SleepDerivation.split)?.session == clientId && (sample.clientVersion ?? 0) <= version
        }
        let stale = Set(SleepDerivation.stale(ownStages, keeping: planned).compactMap { UUID(uuidString: $0.id) })
        guard !stale.isEmpty else { return }
        _ = try await store.deleteOwnObjects(of: type, matching: HKQuery.predicateForObjects(with: stale))
    }

    // MARK: - Delete

    /// Deletes this app's samples of the matching sessions. Returns how many sessions lost samples.
    func delete(_ options: JSONFields) async throws -> Int {
        let ownSource = HKSource.default()
        let own = HKQuery.predicateForObjects(from: ownSource)
        var targets: [Set<UUID>] = []
        if let clientIds = options.strings("clientIds") {
            let samples = try await store.samples(of: type, predicate: own)
            for clientId in clientIds {
                let ids = samples.filter { sample in
                    (sample.metadata?[HKMetadataKeySyncIdentifier] as? String).flatMap(SleepDerivation.split)?.session == clientId
                }.map(\.uuid)
                targets.append(Set(ids))
            }
        } else if let ids = options.strings("ids") {
            for id in ids {
                guard let uuid = UUID(uuidString: id),
                      let sample = try await store.samples(of: type, predicate: HKQuery.predicateForObjects(with: [uuid])).first else { continue }
                let match = try await derive(from: sample.startDate, to: sample.endDate).first { $0.0.id == id }
                targets.append(Set(match?.1.filter { $0.sourceRevision.source == ownSource }.map(\.uuid) ?? []))
            }
        } else {
            let sessions = try await derive(from: try options.date("startDate"), to: try options.date("endDate"))
            targets = sessions.map { Set($0.1.filter { $0.sourceRevision.source == ownSource }.map(\.uuid)) }
        }
        var deleted = 0
        for uuids in targets where !uuids.isEmpty {
            if try await store.deleteOwnObjects(of: type, matching: HKQuery.predicateForObjects(with: uuids)) > 0 { deleted += 1 }
        }
        return deleted
    }

    // MARK: - Changes

    /// The sessions that contain any of `changed` (samples an anchored query returned), derived whole.
    func sessions(containing changed: [HKSample]) async throws -> [[String: Any]] {
        guard let first = changed.map(\.startDate).min(), let last = changed.map(\.endDate).max() else { return [] }
        let ids = Set(changed.map(\.uuid.uuidString))
        return try await derive(from: first, to: last)
            .filter { session in session.0.samples.contains { ids.contains($0.id) } }
            .map { Self.encode($0.0, samples: $0.1) }
    }

    // MARK: - Aggregate

    /// Seconds asleep per bucket (`duration`), from sessions of every source (or `sourceIds`), with time two
    /// apps both call asleep counted once. A bucket no session overlaps has no value.
    func timeAsleep(_ buckets: [Aggregation.Bucket], sourceIds: [String]?) async throws -> [[String: Double]] {
        guard let start = buckets.first?.start, let end = buckets.last?.end else { return [] }
        let (sources, empty) = try await sourcePredicate(sourceIds)
        if empty { return buckets.map { _ in [:] } }
        let sessions = try await derive(from: start, to: end, sources: sources).map(\.0)
        return SleepDerivation.timeAsleep(sessions, buckets: buckets.map { ($0.start, $0.end) })
            .map { $0.map { ["duration": $0] } ?? [:] }
    }
}
