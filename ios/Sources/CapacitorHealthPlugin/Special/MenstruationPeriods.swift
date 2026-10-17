import Foundation
import HealthKit

/// `menstruationPeriod` on iOS, which has no period object: periods are derived from `menstrualFlow`
/// samples on read and expanded into one flow sample per day on write (R15, decision #29).
final class MenstruationPeriods {
    private let store: HKHealthStore
    private let entry: RegistryEntry
    private let flowEntry: RegistryEntry
    private let flowType: HKSampleType

    init(store: HKHealthStore) throws {
        self.store = store
        (entry, flowType) = try HealthTypes.resolve("menstruationPeriod")
        (flowEntry, _) = try HealthTypes.resolve("menstrualFlow")
    }

    /// `<clientId>:<yyyy-mm-dd>`, the per-day sync identifier of an expanded period.
    static func dayClientId(_ clientId: String, _ day: PeriodDerivation.LocalDay) -> String { "\(clientId):\(day.string)" }

    /// The period clientId behind a day's sync identifier, if it has that shape.
    static func periodClientId(_ dayClientId: String?) -> String? {
        guard let dayClientId, dayClientId.count > 11 else { return nil }
        let suffix = dayClientId.suffix(11)
        guard suffix.first == ":", PeriodDerivation.LocalDay(String(suffix.dropFirst())) != nil else { return nil }
        return String(dayClientId.dropLast(11))
    }

    // MARK: - Read

    private func flowSamples(from start: Date, to end: Date, extra: NSPredicate? = nil) async throws -> [HKCategorySample] {
        var predicates = [HKQuery.predicateForSamples(withStart: start, end: end, options: [])]
        if let extra { predicates.append(extra) }
        let samples = try await store.samples(
            of: flowType,
            predicate: NSCompoundPredicate(andPredicateWithSubpredicates: predicates),
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        )
        return samples.compactMap { $0 as? HKCategorySample }
    }

    private func flow(_ sample: HKCategorySample) -> PeriodDerivation.Flow {
        PeriodDerivation.Flow(
            id: sample.uuid.uuidString,
            start: sample.startDate,
            end: sample.endDate,
            value: SampleCodec.unifiedValue(raw: sample.value, valueSet: flowEntry.valueSet),
            isCycleStart: (sample.metadata?[HKMetadataKeyMenstrualCycleStart] as? NSNumber)?.boolValue,
            sourceId: sample.sourceRevision.source.bundleIdentifier,
            timeZone: SampleCodec.recordedTimeZone(sample)
        )
    }

    /// Derived periods overlapping `[start, end]`, with the samples they came from.
    private func derive(from start: Date, to end: Date, sources: NSPredicate? = nil) async throws -> [(PeriodDerivation.Period, [HKCategorySample])] {
        let margin = TimeInterval(PeriodDerivation.lookBackDays * 86_400)
        let samples = try await flowSamples(from: start.addingTimeInterval(-margin), to: end.addingTimeInterval(margin), extra: sources)
        let byId = Dictionary(uniqueKeysWithValues: samples.map { ($0.uuid.uuidString, $0) })
        let periods = PeriodDerivation.periods(samples.map(flow), overlapping: start, end, defaultZone: .current)
        return periods.map { period in (period, period.flows.compactMap { byId[$0.id] }) }
    }

    private func encode(_ period: PeriodDerivation.Period, samples: [HKCategorySample]) -> [String: Any] {
        guard let first = samples.first else { return [:] }
        var json = SampleCodec.encodeBase(first, typeId: entry.typeId, kind: "special")
        let zone = period.timeZone
        json["startDate"] = DateCoding.string(from: period.firstDay.date(in: zone), timeZone: zone)
        json["endDate"] = DateCoding.string(from: period.lastDay.adding(days: 1).date(in: zone).addingTimeInterval(-0.001), timeZone: zone)
        json["zoneOffset"] = DateCoding.offsetString(seconds: zone.secondsFromGMT(for: period.firstDay.date(in: zone)))
        json["firstDay"] = period.firstDay.string
        json["lastDay"] = period.lastDay.string
        json["derived"] = true
        json["flowSampleIds"] = period.flows.map(\.id)
        // A period this plugin expanded shares a clientId prefix on every day.
        if let clientId = Self.periodClientId(json["clientId"] as? String) {
            json["clientId"] = clientId
        } else {
            json.removeValue(forKey: "clientId")
            json.removeValue(forKey: "clientVersion")
        }
        return json
    }

    func read(_ options: JSONFields, start: Date, end: Date, limit: Int, ascending: Bool) async throws -> [String: Any] {
        var sources: NSPredicate?
        if let sourceIds = options.strings("sourceIds") {
            let matching = try await store.sources(of: flowType).filter { sourceIds.contains($0.bundleIdentifier) }
            if matching.isEmpty { return ["samples": [Any]()] }
            sources = HKQuery.predicateForObjects(from: matching)
        }
        var periods = try await derive(from: start, to: end, sources: sources)
        if !ascending { periods.reverse() }
        if let cursor = try options.optionalString("cursor").map({ try ReadCursor.decode($0, typeId: entry.typeId) }) {
            periods = periods.filter { period in
                let start = period.0.firstDay.date(in: period.0.timeZone)
                return ascending ? start > cursor.startDate : start < cursor.startDate
            }
        }
        let page = Array(periods.prefix(limit))
        var result: [String: Any] = ["samples": page.map { encode($0.0, samples: $0.1) }]
        if periods.count > limit, let last = page.last {
            result["nextCursor"] = ReadCursor(typeId: entry.typeId, startDate: last.0.firstDay.date(in: last.0.timeZone), skip: 0).encoded()
        }
        return result
    }

    // MARK: - Write

    /// One flow sample per day at local noon, flagged on day 1 (decision #29). Returns the samples and the
    /// day sync identifiers they use.
    func expand(_ fields: JSONFields) throws -> [HKCategorySample] {
        let startString = try fields.string("startDate")
        let endString = try fields.string("endDate")
        guard let firstDay = PeriodDerivation.LocalDay(startString), let lastDay = PeriodDerivation.LocalDay(endString),
              lastDay >= firstDay, let flowType = flowType as? HKCategoryType, let valueSet = flowEntry.valueSet else {
            throw HealthError.invalidArgument(fields.field("endDate"), "must not be on a day before startDate")
        }
        let zone = fields.optionalString("timeZone").flatMap(TimeZone.init(identifier:))
            ?? DateCoding.offsetSeconds(of: startString).flatMap(TimeZone.init(secondsFromGMT:)) ?? .current
        let base = try SampleCodec.baseMetadata(fields)
        let clientId = fields.optionalString("clientId")
        let flow = fields.object("flow") ?? [:]
        let device = SampleCodec.device(fields)
        return try (0...(lastDay - firstDay)).map { offset in
            let day = firstDay.adding(days: offset)
            let noon = day.date(in: zone, hour: 12)
            var metadata = base
            metadata[HKMetadataKeyTimeZone] = zone.identifier
            metadata[HKMetadataKeyMenstrualCycleStart] = NSNumber(value: offset == 0)
            if let clientId { metadata[HKMetadataKeySyncIdentifier] = Self.dayClientId(clientId, day) }
            let value = flow[day.string] as? String ?? "unspecified"
            let raw = try SampleCodec.rawValue(value, valueSet: valueSet, field: fields.field("flow.\(day.string)"))
            return HKCategorySample(type: flowType, value: raw, start: noon, end: noon, device: device, metadata: metadata)
        }
    }

    /// After re-writing a period with the same clientId, deletes this app's day samples that are no longer
    /// part of it. Looks two months either side, which covers moving a period around a cycle. Days stored
    /// with a higher version than this write stay: HealthKit ignored the write for them too.
    func deleteDroppedDays(clientId: String, version: Int, kept: Set<String>, around samples: [HKSample]) async throws {
        guard let first = samples.first?.startDate, let last = samples.last?.startDate else { return }
        let margin = TimeInterval(62 * 86_400)
        let own = HKQuery.predicateForObjects(from: HKSource.default())
        let candidates = try await flowSamples(from: first.addingTimeInterval(-margin), to: last.addingTimeInterval(margin), extra: own)
        let dropped = candidates.filter { sample in
            guard let syncId = sample.metadata?[HKMetadataKeySyncIdentifier] as? String else { return false }
            let stored = (sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 0
            return Self.periodClientId(syncId) == clientId && !kept.contains(syncId) && stored <= version
        }
        guard !dropped.isEmpty else { return }
        _ = try await store.deleteOwnObjects(of: flowType, matching: HKQuery.predicateForObjects(with: Set(dropped.map(\.uuid))))
    }

    // MARK: - Delete

    /// Deletes this app's flow samples of the matching periods. Returns how many periods lost samples.
    func delete(_ options: JSONFields) async throws -> Int {
        let own = HKQuery.predicateForObjects(from: HKSource.default())
        var targets: [Set<UUID>] = []
        if let clientIds = options.strings("clientIds") {
            let samples = try await store.samples(of: flowType, predicate: own)
            for clientId in clientIds {
                let ids = samples.filter { Self.periodClientId($0.metadata?[HKMetadataKeySyncIdentifier] as? String) == clientId }.map(\.uuid)
                targets.append(Set(ids))
            }
        } else if let ids = options.strings("ids") {
            for id in ids {
                guard let uuid = UUID(uuidString: id),
                      let sample = try await store.samples(of: flowType, predicate: HKQuery.predicateForObjects(with: [uuid])).first else { continue }
                let match = try await derive(from: sample.startDate, to: sample.endDate).first { $0.0.flows.first?.id == id }
                targets.append(Set(match?.1.filter { $0.sourceRevision.source == HKSource.default() }.map(\.uuid) ?? []))
            }
        } else {
            let periods = try await derive(from: try options.date("startDate"), to: try options.date("endDate"))
            targets = periods.map { Set($0.1.filter { $0.sourceRevision.source == HKSource.default() }.map(\.uuid)) }
        }
        var deleted = 0
        for uuids in targets where !uuids.isEmpty {
            if try await store.deleteOwnObjects(of: flowType, matching: HKQuery.predicateForObjects(with: uuids)) > 0 { deleted += 1 }
        }
        return deleted
    }
}
