import Foundation

/// Sleep sessions from `sleepAnalysis` samples, and the samples a written session becomes (03-architecture
/// "Sleep session derivation", decision #64). Pure, so the fixtures in `fixtures/sleep` test it directly.
enum SleepDerivation {
    /// A sample starting more than this long after everything before it (same source) starts a new session.
    static let maxGap: TimeInterval = 3_600
    /// How far either side of a queried range to read, so a session crossing the range's edge is returned whole.
    static let lookAround: TimeInterval = 86_400
    /// Which stage wins where samples of one source overlap: the more specific one. HealthKit means `inBed`
    /// to overlap the others (HKCategoryValueSleepAnalysis docs); other overlaps come from mixed writers.
    static let priority: [String: Int] = ["light": 4, "deep": 4, "rem": 4, "awake": 3, "asleep": 2, "inBed": 1]
    /// Stages that count as time asleep in `aggregate()` (decision #65).
    static let asleepStages: Set<String> = ["asleep", "light", "deep", "rem"]
    /// The suffix of the `inBed` sample spanning a session the plugin wrote.
    static let inBedSuffix = "inBed"

    /// One `sleepAnalysis` sample, its value already a unified stage.
    struct StageSample: Equatable {
        let id: String
        let start: Date
        let end: Date
        let stage: String
        let sourceId: String
        var clientId: String?
        var clientVersion: Int?
    }

    struct Stage: Equatable {
        let stage: String
        let start: Date
        let end: Date
    }

    struct Session {
        /// The earliest sample's id (for a session the plugin wrote, its `inBed` sample's).
        let id: String
        let start: Date
        let end: Date
        let sourceId: String
        /// The session's own `clientId` when the plugin wrote it.
        let clientId: String?
        let clientVersion: Int?
        let stages: [Stage]
        /// In start order.
        let samples: [StageSample]
    }

    /// A sample a written session becomes.
    struct PlannedSample: Equatable {
        let stage: String
        let start: Date
        let end: Date
        let clientId: String?
    }

    // MARK: - Reading

    /// The session `clientId` and suffix of a stage sample the plugin wrote (`night-1:inBed`, `night-1:3`).
    static func split(clientId: String) -> (session: String, suffix: String)? {
        guard let colon = clientId.lastIndex(of: ":") else { return nil }
        let session = String(clientId[..<colon])
        let suffix = String(clientId[clientId.index(after: colon)...])
        guard !session.isEmpty, suffix == inBedSuffix || (!suffix.isEmpty && suffix.allSatisfy { $0.isASCII && $0.isNumber })
        else { return nil }
        return (session, suffix)
    }

    static func derive(_ samples: [StageSample]) -> [Session] {
        var sessions: [Session] = []
        for (sourceId, own) in Dictionary(grouping: samples, by: \.sourceId) {
            let ordered = own.sorted { ($0.start, $0.id) < ($1.start, $1.id) }
            // Sessions the plugin wrote: every sample carrying the prefix of one of the source's `inBed` spans.
            let written = Set(ordered.compactMap { sample in
                sample.clientId.flatMap(split).flatMap { $0.suffix == inBedSuffix ? $0.session : nil }
            })
            var byClientId: [String: [StageSample]] = [:]
            var chain: [StageSample] = []
            var latestEnd = Date.distantPast
            for sample in ordered {
                if let session = sample.clientId.flatMap(split)?.session, written.contains(session) {
                    byClientId[session, default: []].append(sample)
                    continue
                }
                if !chain.isEmpty, sample.start.timeIntervalSince(latestEnd) > maxGap {
                    sessions.append(session(chain, sourceId: sourceId, clientId: nil))
                    chain = []
                }
                if chain.isEmpty { latestEnd = sample.end }
                chain.append(sample)
                latestEnd = max(latestEnd, sample.end)
            }
            if !chain.isEmpty { sessions.append(session(chain, sourceId: sourceId, clientId: nil)) }
            for (clientId, group) in byClientId {
                sessions.append(session(group, sourceId: sourceId, clientId: clientId))
            }
        }
        return sessions.sorted { ($0.start, $0.sourceId, $0.id) < ($1.start, $1.sourceId, $1.id) }
    }

    /// Sessions overlapping `[start, end]`, given samples read from `lookAround` before `start` to after `end`.
    static func sessions(_ samples: [StageSample], overlapping start: Date, _ end: Date) -> [Session] {
        derive(samples).filter { $0.start <= end && $0.end > start }
    }

    private static func session(_ samples: [StageSample], sourceId: String, clientId: String?) -> Session {
        let first = samples[0]
        let inBed = clientId.flatMap { id in samples.first { $0.clientId == "\(id):\(inBedSuffix)" } }
        return Session(
            id: (inBed ?? first).id,
            start: samples.map(\.start).min() ?? first.start,
            end: samples.map(\.end).max() ?? first.end,
            sourceId: sourceId,
            clientId: clientId,
            clientVersion: clientId == nil ? nil : (inBed ?? first).clientVersion,
            stages: stages(of: samples),
            samples: samples
        )
    }

    /// Non-overlapping stages: between each pair of sample boundaries the highest-priority sample covering
    /// it wins (then the earlier start, then the lower id); pieces of one sample next to each other merge.
    /// Time no sample covers is left out; samples without a duration add no stage.
    static func stages(of samples: [StageSample]) -> [Stage] {
        let spans = samples.filter { $0.end > $0.start }
        let bounds = Array(Set(spans.flatMap { [$0.start, $0.end] })).sorted()
        var pieces: [(sample: StageSample, start: Date, end: Date)] = []
        for (from, to) in zip(bounds, bounds.dropFirst()) {
            let covering = spans.filter { $0.start <= from && $0.end >= to }
            guard let winner = covering.min(by: { a, b in
                let (pa, pb) = (priority[a.stage] ?? 0, priority[b.stage] ?? 0)
                return pa != pb ? pa > pb : (a.start, a.id) < (b.start, b.id)
            }) else { continue }
            if let last = pieces.last, last.sample.id == winner.id, last.end == from {
                pieces[pieces.count - 1].end = to
            } else {
                pieces.append((winner, from, to))
            }
        }
        return pieces.map { Stage(stage: $0.sample.stage, start: $0.start, end: $0.end) }
    }

    // MARK: - Time asleep

    /// Seconds per bucket that at least one session spends in an asleep stage, so two apps recording the same
    /// night count it once (as HealthKit's statistics remove overlap between sources). `nil` for a bucket no
    /// session overlaps.
    static func timeAsleep(_ sessions: [Session], buckets: [(start: Date, end: Date)]) -> [Double?] {
        let asleep = merged(sessions.flatMap { session in
            session.stages.filter { asleepStages.contains($0.stage) }.map { (start: $0.start, end: $0.end) }
        })
        return buckets.map { bucket in
            guard sessions.contains(where: { $0.start < bucket.end && $0.end > bucket.start }) else { return nil }
            return asleep.reduce(0) { total, interval in
                total + max(0, min(interval.end, bucket.end).timeIntervalSince(max(interval.start, bucket.start)))
            }
        }
    }

    /// The union of `intervals`, sorted, as non-overlapping intervals.
    static func merged(_ intervals: [(start: Date, end: Date)]) -> [(start: Date, end: Date)] {
        var result: [(start: Date, end: Date)] = []
        for interval in intervals.sorted(by: { $0.start < $1.start }) {
            if let last = result.last, interval.start <= last.end {
                result[result.count - 1].end = max(last.end, interval.end)
            } else {
                result.append(interval)
            }
        }
        return result
    }

    // MARK: - Writing

    /// What a session becomes on iOS: one `inBed` sample spanning it (`<clientId>:inBed`), then one sample per
    /// other stage in time order (`<clientId>:0`, `:1`, …). `inBed` stages fold into the span. Without a
    /// `clientId` the samples get none.
    static func expand(start: Date, end: Date, stages: [Stage], clientId: String?) -> [PlannedSample] {
        let others = stages.filter { $0.stage != "inBed" }.sorted { $0.start < $1.start }
        let span = PlannedSample(stage: "inBed", start: start, end: end, clientId: clientId.map { "\($0):\(inBedSuffix)" })
        return [span] + others.enumerated().map { index, stage in
            PlannedSample(stage: stage.stage, start: stage.start, end: stage.end, clientId: clientId.map { "\($0):\(index)" })
        }
    }

    /// Of this app's existing samples for a session, the ones a re-write no longer produces and must delete.
    static func stale(_ existing: [StageSample], keeping planned: [PlannedSample]) -> [StageSample] {
        let kept = Set(planned.compactMap(\.clientId))
        return existing.filter { sample in sample.clientId.map { !kept.contains($0) } ?? false }
    }
}
