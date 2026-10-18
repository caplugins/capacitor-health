import Foundation
import HealthKit

/// Writing: the plan a validated `NewWorkout` becomes (decisions #67–#68).
extension WorkoutCodec {
    // MARK: - Write

    /// Everything a validated `NewWorkout` is written from.
    struct Plan {
        let activity: RegistryWorkoutActivity
        let start: Date
        let end: Date
        let metadata: [String: Any]
        let device: HKDevice?
        let events: [HKWorkoutEvent]
        /// iOS 16 `HKWorkoutActivity`s; empty before.
        let activities: [Any]
        /// The total samples, added to the builder so HealthKit associates them.
        let totals: [HKQuantitySample]
        let clientId: String?
        let version: Int
    }

    /// The `clientId` of a total written with the workout `clientId` (`energy`, `distance`): `<clientId>:energy`,
    /// then `<clientId>:energy:1`, `:2`, … for the parts after a pause.
    static func totalClientId(_ clientId: String, total: String, part: Int = 0) -> String {
        part == 0 ? "\(clientId):\(total)" : "\(clientId):\(total):\(part)"
    }

    /// Whether `syncId` names a part of the `total` written with workout `clientId`.
    static func isTotal(_ syncId: String, of clientId: String, total: String) -> Bool {
        let base = totalClientId(clientId, total: total)
        return syncId == base || (syncId.hasPrefix(base + ":") && Int(syncId.dropFirst(base.count + 1)) != nil)
    }

    static func plan(_ fields: JSONFields) throws -> Plan {
        let start = try fields.date("startDate")
        let end = try fields.date("endDate")
        guard end > start else { throw HealthError.invalidArgument(fields.field("endDate"), "must be after startDate", reason: "endNotAfterStart") }
        for name in ["title", "notes"] where fields.values[name] != nil {
            throw HealthError.invalidArgument(fields.field(name), "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
        }
        let activity = try storable(try fields.string("activityType"), field: fields.field("activityType"))
        let base = try SampleCodec.baseMetadata(fields)
        var metadata = base
        metadata.merge(activityMetadata(activity)) { $1 }
        let laps = try children(fields, "laps") { item in
            Lap(start: try item.date("startDate"), end: try item.date("endDate"), length: item.optionalDouble("length"))
        }
        if let poolLength = try poolLength(laps, activity: activity, field: fields.field("laps")) {
            metadata[HKMetadataKeyLapLength] = HKQuantity(unit: .meter(), doubleValue: poolLength)
        }
        let segments = try segments(fields)
        let pauses = segments.filter { $0.segmentType == pause }.map { Interval(start: $0.start, end: $0.end) }
        return Plan(
            activity: activity, start: start, end: end, metadata: metadata, device: SampleCodec.device(fields),
            events: events(segments: segments, laps: laps), activities: try activities(fields),
            totals: try totals(fields, activity: activity, active: active(start: start, end: end, pauses: pauses), base: base),
            clientId: fields.optionalString("clientId"), version: fields.optionalInt("clientVersion") ?? 1
        )
    }

    /// A pool swim with laps needs the pool's length on the workout: HealthKit raises an exception for lap events
    /// without one, or with zero (decision #68). It's the laps' length, so they must all have the same, above 0.
    static func poolLength(_ laps: [Lap], activity: RegistryWorkoutActivity, field: String) throws -> Double? {
        guard activity.swimmingLocation == HKWorkoutSwimmingLocationType.pool.rawValue, !laps.isEmpty else { return nil }
        let lengths = Set(laps.map(\.length))
        guard lengths.count == 1, let length = lengths.first ?? nil, length > 0 else {
            throw HealthError.invalidArgument(field, "of a pool swim must all have the same length, above 0, on iOS", reason: "poolLapLength")
        }
        return length
    }

    /// Segments iOS can store: pauses and segments without a type, without repetitions.
    private static func segments(_ fields: JSONFields) throws -> [Segment] {
        try children(fields, "segments") { item in
            if item.values["repetitions"] != nil {
                throw HealthError.invalidArgument(item.field("repetitions"), "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
            }
            let type = item.optionalString("segmentType")
            if let type, type != pause {
                throw HealthError.invalidArgument(item.field("segmentType"), "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
            }
            return Segment(start: try item.date("startDate"), end: try item.date("endDate"), segmentType: type)
        }
    }

    /// iOS 16 `HKWorkoutActivity`s for a multisport workout.
    private static func activities(_ fields: JSONFields) throws -> [Any] {
        guard fields.values["activities"] != nil else { return [] }
        guard #available(iOS 16.0, *) else {
            throw HealthError.invalidArgument(fields.field("activities"), "needs iOS 16", reason: "valueUnsupportedOnPlatform")
        }
        return try children(fields, "activities") { item in
            let part = try storable(try item.string("activityType"), field: item.field("activityType"))
            return HKWorkoutActivity(
                workoutConfiguration: configuration(part), start: try item.date("startDate"), end: try item.date("endDate"), metadata: nil
            )
        }
    }

    /// The workout's time outside its pauses: HealthKit's workout statistics leave paused time out, so totals
    /// are written over these stretches to read back as written (decision #68). The whole workout if it's all
    /// paused.
    static func active(start: Date, end: Date, pauses: [Interval]) -> [Interval] {
        var stretches: [Interval] = []
        var cursor = start
        for pause in merge(pauses) where pause.end > cursor {
            if pause.start > cursor { stretches.append(Interval(start: cursor, end: min(pause.start, end))) }
            cursor = max(cursor, pause.end)
        }
        if cursor < end { stretches.append(Interval(start: cursor, end: end)) }
        return stretches.isEmpty ? [Interval(start: start, end: end)] : stretches
    }

    /// The total samples: active energy, and distance in the activity's distance type, each split over the
    /// `active` stretches in proportion to their length. With a clientId they get `<clientId>:energy` /
    /// `<clientId>:distance` (and `:1`, `:2`, … after pauses), so re-writes replace them.
    private static func totals(
        _ fields: JSONFields, activity: RegistryWorkoutActivity, active: [Interval], base: [String: Any]
    ) throws -> [HKQuantitySample] {
        guard let totals = fields.object("totals").map({ JSONFields($0, path: fields.field("totals")) }) else { return [] }
        let device = SampleCodec.device(fields)
        let clientId = fields.optionalString("clientId")
        let duration = active.reduce(0) { $0 + $1.end.timeIntervalSince($1.start) }
        let samples = { (type: HKQuantityType, unit: HKUnit, amount: Double, total: String) -> [HKQuantitySample] in
            active.enumerated().map { part, stretch in
                var metadata = base
                if let clientId { metadata[HKMetadataKeySyncIdentifier] = totalClientId(clientId, total: total, part: part) }
                let share = amount * stretch.end.timeIntervalSince(stretch.start) / duration
                return HKQuantitySample(
                    type: type, quantity: HKQuantity(unit: unit, doubleValue: share), start: stretch.start, end: stretch.end,
                    device: device, metadata: metadata
                )
            }
        }
        var result: [HKQuantitySample] = []
        if let energy = totals.optionalDouble("energy") { result += samples(energyType, .kilocalorie(), energy, "energy") }
        if let distance = totals.optionalDouble("distance") {
            result += samples(try distanceType(for: activity, field: totals.field("distance")), .meter(), distance, "distance")
        }
        return result
    }

    /// Where `activity`'s distance total goes (registry `ios.distance`, decision #68).
    static func distanceType(for activity: RegistryWorkoutActivity, field: String) throws -> HKQuantityType {
        guard let typeId = activity.distance else {
            throw HealthError.invalidArgument(
                field, "can't be stored for \(activity.id) on iOS: it has a distance per activity", reason: "valueUnsupportedOnPlatform"
            )
        }
        guard let entry = Registry.byId[typeId], let type = HealthTypes.sampleType(for: entry) as? HKQuantityType else {
            throw HealthError.invalidArgument(field, "needs a newer iOS for \(activity.id) (\(typeId))", reason: "valueUnsupportedOnPlatform")
        }
        return type
    }

    /// The activity `id` names, when this iOS has it.
    private static func storable(_ id: String, field: String) throws -> RegistryWorkoutActivity {
        guard let activity = activity(id: id) else {
            throw HealthError.invalidArgument(field, "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
        }
        guard activity.isAvailable() else {
            throw HealthError.invalidArgument(field, "needs a newer iOS", reason: "valueUnsupportedOnPlatform")
        }
        return activity
    }

    private static func children<T>(_ fields: JSONFields, _ key: String, _ build: (JSONFields) throws -> T) throws -> [T] {
        let items = fields.values[key] as? [[String: Any]] ?? []
        return try items.enumerated().map { index, json in try build(JSONFields(json, path: fields.field("\(key)[\(index)]"))) }
    }
}
