import Foundation
import HealthKit

/// `aggregate()` (R7, decisions #56–#57): HealthKit statistics, which remove overlap between sources.
final class Aggregation {
    private let store: HKHealthStore

    init(store: HKHealthStore) {
        self.store = store
    }

    /// The metrics `aggregate()` serves for `entry`: the sum of a cumulative type, the average, minimum
    /// and maximum of a discrete one. A combined discrete id (speed, power) has no average: HealthKit's
    /// per-member averages can't be combined without their weights.
    static func metrics(for entry: RegistryEntry) -> [String] {
        if !entry.metrics.isEmpty { return entry.metrics }
        switch entry.aggregation {
        case .cumulative: return ["sum"]
        case .discrete: return entry.members.isEmpty ? ["avg", "min", "max"] : ["min", "max"]
        case nil: return []
        }
    }

    static func options(for metrics: [String]) -> HKStatisticsOptions {
        var options: HKStatisticsOptions = []
        if metrics.contains("sum") { options.insert(.cumulativeSum) }
        if metrics.contains("avg") { options.insert(.discreteAverage) }
        if metrics.contains("min") { options.insert(.discreteMin) }
        if metrics.contains("max") { options.insert(.discreteMax) }
        return options
    }

    // MARK: - Buckets

    struct Bucket: Equatable {
        let start: Date
        let end: Date
    }

    /// One calendar step of a bucket, or nil for "no bucket" (the whole range).
    static func component(_ unit: String?) -> Calendar.Component? {
        switch unit {
        case "minute": return .minute
        case "hour": return .hour
        case "day", "week": return .day
        case "month": return .month
        default: return nil
        }
    }

    /// Buckets from `start` to `end`: `start` + n × `size` units in `calendar` (the device's, as HealthKit's
    /// collection queries use), each counted from `start` so months keep their day (Jan 31, Feb 28, Mar 31).
    /// The last one ends at `end`.
    static func buckets(from start: Date, to end: Date, unit: String?, size: Int, calendar: Calendar) -> [Bucket] {
        guard let component = component(unit) else { return [Bucket(start: start, end: end)] }
        let step = unit == "week" ? 7 * size : size
        var buckets: [Bucket] = []
        var index = 0
        var lower = start
        while lower < end, let upper = calendar.date(byAdding: component, value: step * (index + 1), to: start) {
            buckets.append(Bucket(start: lower, end: min(upper, end)))
            lower = upper
            index += 1
        }
        return buckets
    }

    /// The interval HealthKit's collection query steps by.
    static func interval(unit: String?, size: Int, start: Date, end: Date) -> DateComponents {
        switch unit {
        case "minute": return DateComponents(minute: size)
        case "hour": return DateComponents(hour: size)
        case "day": return DateComponents(day: size)
        case "week": return DateComponents(day: 7 * size)
        case "month": return DateComponents(month: size)
        default: return DateComponents(second: Int(end.timeIntervalSince(start).rounded(.up)))
        }
    }

    /// Per-bucket values in the bridge unit, combining members: sums add, minimums and maximums take the
    /// smallest and largest. `nil` per metric when no member has data.
    static func merge(_ members: [[String: Double]]) -> [String: Double] {
        var values: [String: Double] = [:]
        for member in members {
            for (metric, value) in member {
                guard let current = values[metric] else {
                    values[metric] = value
                    continue
                }
                switch metric {
                case "min": values[metric] = Swift.min(current, value)
                case "max": values[metric] = Swift.max(current, value)
                default: values[metric] = current + value
                }
            }
        }
        return values
    }

    static func values(_ statistics: HKStatistics?, metrics: [String], unit: String) -> [String: Double] {
        guard let statistics else { return [:] }
        var values: [String: Double] = [:]
        let quantities: [String: HKQuantity?] = [
            "sum": statistics.sumQuantity(),
            "avg": statistics.averageQuantity(),
            "min": statistics.minimumQuantity(),
            "max": statistics.maximumQuantity()
        ]
        for metric in metrics {
            if let quantity = quantities[metric] ?? nil { values[metric] = SampleCodec.bridgeValue(quantity, unit: unit) }
        }
        return values
    }

    // MARK: - Query

    func aggregate(_ options: JSONFields) async throws -> [String: Any] {
        let typeId = try options.string("type")
        let (entry, _) = try HealthTypes.resolve(typeId)
        let available = Self.metrics(for: entry)
        guard !available.isEmpty else {
            throw HealthError(.unsupportedType, "\(typeId) can't be aggregated on iOS.", data: ["type": typeId, "reason": "notAggregatable"])
        }
        guard let metrics = options.strings("metrics"), !metrics.isEmpty, metrics.allSatisfy(available.contains) else {
            throw HealthError.invalidArgument("metrics", "must be some of \(available.joined(separator: ", "))", reason: "metricUnsupported")
        }
        let start = try options.date("startDate")
        let end = try options.date("endDate")
        guard end > start else { throw HealthError.invalidArgument("endDate", "must be after startDate", reason: "emptyRange") }
        if typeId == SleepSessions.typeId { return try await aggregateSleep(options, start: start, end: end) }
        let unit = options.optionalString("unit") ?? entry.unit ?? ""
        guard entry.units.contains(unit) else { throw HealthError.invalidArgument("unit", "isn't a unit of \(typeId)") }
        let bucket = options.object("bucket")
        let bucketUnit = bucket?["unit"] as? String
        let size = max(bucket?["size"] as? Int ?? 1, 1)

        let buckets = Self.buckets(from: start, to: end, unit: bucketUnit, size: size, calendar: .current)
        let interval = Self.interval(unit: bucketUnit, size: size, start: start, end: end)
        let statisticsOptions = Self.options(for: metrics)
        let range = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sourceIds = options.strings("sourceIds")

        var perMember: [[[String: Double]]] = []
        for (_, type) in HealthTypes.readTypes(for: entry) {
            guard let quantityType = type as? HKQuantityType else { continue }
            var predicate: NSPredicate = range
            if let sourceIds {
                let sources = try await store.sources(of: type).filter { sourceIds.contains($0.bundleIdentifier) }
                if sources.isEmpty { continue }
                predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [range, HKQuery.predicateForObjects(from: sources)])
            }
            let collection = try await store.statisticsCollection(
                of: quantityType, predicate: predicate, options: statisticsOptions, anchor: start, interval: interval
            )
            perMember.append(buckets.map { Self.values(collection?.statistics(for: $0.start), metrics: metrics, unit: unit) })
        }

        let json: [[String: Any]] = buckets.enumerated().map { index, bucket in
            [
                "startDate": DateCoding.string(from: bucket.start),
                "endDate": DateCoding.string(from: bucket.end),
                "values": Self.merge(perMember.map { $0[index] }),
                "unit": unit
            ]
        }
        HealthLog.debug("aggregate \(typeId): \(json.count) buckets")
        return ["buckets": json]
    }

    /// Time asleep from derived sleep sessions (decision #65), in seconds, like Android's sleep duration.
    private func aggregateSleep(_ options: JSONFields, start: Date, end: Date) async throws -> [String: Any] {
        let bucket = options.object("bucket")
        let buckets = Self.buckets(from: start, to: end, unit: bucket?["unit"] as? String, size: max(bucket?["size"] as? Int ?? 1, 1), calendar: .current)
        let values = try await SleepSessions(store: store).timeAsleep(buckets, sourceIds: options.strings("sourceIds"))
        let json: [[String: Any]] = zip(buckets, values).map { bucket, values in
            ["startDate": DateCoding.string(from: bucket.start), "endDate": DateCoding.string(from: bucket.end), "values": values, "unit": Self.durationUnit]
        }
        return ["buckets": json]
    }

    /// The bucket unit of types without units, whose only metric is a duration in seconds (as on Android).
    static let durationUnit = "s"
}

extension HKHealthStore {
    /// A statistics collection, or nil when HealthKit has no data for the predicate.
    func statisticsCollection(
        of type: HKQuantityType, predicate: NSPredicate?, options: HKStatisticsOptions, anchor: Date, interval: DateComponents
    ) async throws -> HKStatisticsCollection? {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: type, quantitySamplePredicate: predicate, options: options, anchorDate: anchor, intervalComponents: interval
            )
            query.initialResultsHandler = { _, collection, error in
                if let error = error as? HKError, error.code == .errorNoData {
                    continuation.resume(returning: nil)
                } else if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: collection)
                }
            }
            execute(query)
        }
    }
}
