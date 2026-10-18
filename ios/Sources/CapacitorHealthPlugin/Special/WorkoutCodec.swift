import Foundation
import HealthKit

/// `HKWorkout` ⇄ the unified workout (decisions #67–#68), without touching the health store: activity
/// matching, workout events ⇄ segments and laps, totals, and the plan a `NewWorkout` is written from.
enum WorkoutCodec {
    static let typeId = "workout"
    static let segmentSet = "workoutSegmentType"
    static let pause = "pause"

    // MARK: - Activities

    /// The registry activity a HealthKit activity type and its metadata mean (decision #62): an indoor variant
    /// needs `HKMetadataKeyIndoorWorkout` true, a swimming location must match, and an activity without a
    /// location matches what no located one does. Nil for raw values the registry doesn't know.
    static func activity(raw: UInt, indoor: Bool, swimmingLocation: Int?) -> RegistryWorkoutActivity? {
        let candidates = Registry.workoutActivities.filter { $0.raw == raw }
        return candidates.first { candidate in
            candidate.swimmingLocation != nil && candidate.swimmingLocation == swimmingLocation
        } ?? candidates.first { candidate in
            candidate.swimmingLocation == nil && (candidate.indoor.map { $0 == indoor } ?? true)
        }
    }

    /// `activity(raw:…)` from an object's metadata.
    static func activity(raw: UInt, metadata: [String: Any]?) -> RegistryWorkoutActivity? {
        activity(
            raw: raw,
            indoor: (metadata?[HKMetadataKeyIndoorWorkout] as? NSNumber)?.boolValue == true,
            swimmingLocation: (metadata?[HKMetadataKeySwimmingLocationType] as? NSNumber)?.intValue
        )
    }

    static func activity(id: String) -> RegistryWorkoutActivity? {
        Registry.workoutActivities.first { $0.id == id }
    }

    /// A configuration describing `activity`, for the builder and for iOS 16 workout activities.
    static func configuration(_ activity: RegistryWorkoutActivity) -> HKWorkoutConfiguration {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = HKWorkoutActivityType(rawValue: activity.raw) ?? .other
        if let indoor = activity.indoor { configuration.locationType = indoor ? .indoor : .outdoor }
        if let location = activity.swimmingLocation {
            configuration.swimmingLocationType = HKWorkoutSwimmingLocationType(rawValue: location) ?? .unknown
        }
        return configuration
    }

    /// The metadata that narrows `activity` (indoor, swimming location), as written with the workout.
    static func activityMetadata(_ activity: RegistryWorkoutActivity) -> [String: Any] {
        var metadata: [String: Any] = [:]
        if let indoor = activity.indoor { metadata[HKMetadataKeyIndoorWorkout] = NSNumber(value: indoor) }
        if let location = activity.swimmingLocation { metadata[HKMetadataKeySwimmingLocationType] = NSNumber(value: location) }
        return metadata
    }

    // MARK: - Events

    struct Interval: Equatable {
        let start: Date
        let end: Date
    }

    struct Segment: Equatable {
        let start: Date
        let end: Date
        /// `pause`, or nil for an untyped segment event.
        let segmentType: String?
    }

    struct Lap: Equatable {
        let start: Date
        let end: Date
        /// Metres.
        let length: Double?
    }

    /// The parts of a workout event the conversion needs.
    struct Event {
        let type: HKWorkoutEventType
        let start: Date
        let end: Date
        let lapLength: Double?

        init(type: HKWorkoutEventType, start: Date, end: Date? = nil, lapLength: Double? = nil) {
            self.type = type
            self.start = start
            self.end = end ?? start
            self.lapLength = lapLength
        }

        init(_ event: HKWorkoutEvent) {
            let length = event.metadata?[HKMetadataKeyLapLength] as? HKQuantity
            self.init(
                type: event.type,
                start: event.dateInterval.start,
                end: event.dateInterval.end,
                lapLength: length.flatMap { $0.is(compatibleWith: .meter()) ? $0.doubleValue(for: .meter()) : nil }
            )
        }
    }

    /// Segments and laps from a workout's events. A pause runs from a pause event to the next resume event
    /// (motion pauses likewise), to the workout's end when none follows; overlapping pauses merge into one.
    /// Segment and lap events become segments without a type and laps; markers and pause requests have no
    /// unified form. Zero-length results are dropped, since segments and laps must end after they start.
    static func parts(_ events: [Event], workoutEnd: Date) -> (segments: [Segment], laps: [Lap]) {
        var pauses: [Interval] = []
        var segments: [Segment] = []
        var laps: [Lap] = []
        // Pauses and motion pauses each open and close on their own.
        var open: [HKWorkoutEventType: Date] = [:]
        for event in events.sorted(by: { $0.start < $1.start }) {
            if let kind = pauseOpening[event.type] {
                open[kind] = open[kind] ?? event.start
            } else if let kind = pauseClosing[event.type] {
                if let start = open.removeValue(forKey: kind) { pauses.append(Interval(start: start, end: event.start)) }
            } else if event.type == .segment {
                segments.append(Segment(start: event.start, end: event.end, segmentType: nil))
            } else if event.type == .lap {
                laps.append(Lap(start: event.start, end: event.end, length: event.lapLength))
            }
        }
        pauses += open.values.map { Interval(start: $0, end: workoutEnd) }
        segments += merge(pauses).map { Segment(start: $0.start, end: $0.end, segmentType: pause) }
        return (
            segments.filter { $0.end > $0.start }.sorted { ($0.start, $0.end) < ($1.start, $1.end) },
            laps.filter { $0.end > $0.start }.sorted { ($0.start, $0.end) < ($1.start, $1.end) }
        )
    }

    private static let pauseOpening: [HKWorkoutEventType: HKWorkoutEventType] = [.pause: .pause, .motionPaused: .motionPaused]
    private static let pauseClosing: [HKWorkoutEventType: HKWorkoutEventType] = [.resume: .pause, .motionResumed: .motionPaused]

    /// Overlapping or touching intervals joined.
    static func merge(_ intervals: [Interval]) -> [Interval] {
        var merged: [Interval] = []
        for interval in intervals.sorted(by: { $0.start < $1.start }) {
            if let last = merged.last, interval.start <= last.end {
                merged[merged.count - 1] = Interval(start: last.start, end: max(last.end, interval.end))
            } else {
                merged.append(interval)
            }
        }
        return merged
    }

    /// The workout events that store `segments` and `laps`: a pause segment as a pause and a resume event, any
    /// other as a segment event, a lap as a lap event with its length.
    static func events(segments: [Segment], laps: [Lap]) -> [HKWorkoutEvent] {
        var events: [HKWorkoutEvent] = []
        for segment in segments {
            if segment.segmentType == pause {
                events.append(HKWorkoutEvent(type: .pause, dateInterval: DateInterval(start: segment.start, duration: 0), metadata: nil))
                events.append(HKWorkoutEvent(type: .resume, dateInterval: DateInterval(start: segment.end, duration: 0), metadata: nil))
            } else {
                events.append(HKWorkoutEvent(type: .segment, dateInterval: DateInterval(start: segment.start, end: segment.end), metadata: nil))
            }
        }
        for lap in laps {
            let metadata = lap.length.map { [HKMetadataKeyLapLength: HKQuantity(unit: .meter(), doubleValue: $0)] }
            events.append(HKWorkoutEvent(type: .lap, dateInterval: DateInterval(start: lap.start, end: lap.end), metadata: metadata))
        }
        return events.sorted { $0.dateInterval.start < $1.dateInterval.start }
    }

    // MARK: - Totals

    static let energyType = HKQuantityType(.activeEnergyBurned)

    /// The distance types this iOS has (the `distance` members).
    static func distanceTypes() -> [HKQuantityType] {
        guard let distance = Registry.byId["distance"] else { return [] }
        return HealthTypes.readTypes(for: distance).compactMap { $0.1 as? HKQuantityType }
    }

    /// Active energy (kcal) and distance (m) from the workout's statistics: the samples associated with it.
    static func totals(_ workout: HKWorkout) -> [String: Double] {
        var totals: [String: Double] = [:]
        if #available(iOS 16.0, *) {
            if let energy = workout.statistics(for: energyType)?.sumQuantity() {
                totals["energy"] = energy.doubleValue(for: .kilocalorie())
            }
            let distances = distanceTypes().compactMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }
            if !distances.isEmpty { totals["distance"] = distances.reduce(0, +) }
        } else {
            legacyTotals(workout, into: &totals)
        }
        return totals
    }

    /// iOS 15: the workout's own totals, which HealthKit later deprecated for statistics.
    @available(iOS, deprecated: 16.0)
    private static func legacyTotals(_ workout: HKWorkout, into totals: inout [String: Double]) {
        if let energy = workout.totalEnergyBurned { totals["energy"] = energy.doubleValue(for: .kilocalorie()) }
        if let distance = workout.totalDistance { totals["distance"] = distance.doubleValue(for: .meter()) }
    }

    // MARK: - Read

    /// A `WorkoutSample`.
    static func encode(_ workout: HKWorkout, hasRoute: Bool) -> [String: Any] {
        var json = SampleCodec.encodeBase(workout, typeId: typeId, kind: "special")
        let zone = SampleCodec.recordedTimeZone(workout) ?? .current
        let date = { (value: Date) in DateCoding.string(from: value, timeZone: zone) }
        let raw = workout.workoutActivityType.rawValue
        json["activityType"] = activity(raw: raw, metadata: workout.metadata)?.id ?? "other"
        json["native"] = ["type": HKWorkoutTypeIdentifier, "value": raw]
        json["totals"] = totals(workout)
        let (segments, laps) = parts((workout.workoutEvents ?? []).map(Event.init), workoutEnd: workout.endDate)
        // A pool swim keeps the pool's length on the workout; it's the length of laps that don't say theirs.
        let poolLength = (workout.metadata?[HKMetadataKeyLapLength] as? HKQuantity)
            .flatMap { $0.is(compatibleWith: .meter()) ? $0.doubleValue(for: .meter()) : nil }
        json["segments"] = segments.map { segment -> [String: Any] in
            var item: [String: Any] = ["startDate": date(segment.start), "endDate": date(segment.end)]
            if let type = segment.segmentType { item["segmentType"] = type }
            return item
        }
        json["laps"] = laps.map { lap -> [String: Any] in
            var item: [String: Any] = ["startDate": date(lap.start), "endDate": date(lap.end)]
            if let length = lap.length ?? poolLength { item["length"] = length }
            return item
        }
        if #available(iOS 16.0, *), workout.workoutActivities.count > 1 {
            json["activities"] = workout.workoutActivities.map { part -> [String: Any] in
                let configuration = part.workoutConfiguration
                let matched = activity(
                    raw: configuration.activityType.rawValue,
                    indoor: configuration.locationType == .indoor,
                    swimmingLocation: configuration.swimmingLocationType == .unknown ? nil : configuration.swimmingLocationType.rawValue
                )
                return [
                    "activityType": matched?.id ?? "other",
                    "startDate": date(part.startDate),
                    "endDate": date(part.endDate ?? workout.endDate)
                ]
            }
        }
        json["hasRoute"] = hasRoute
        let consumed: Set<String> = [HKMetadataKeyIndoorWorkout, HKMetadataKeySwimmingLocationType]
        let extra = SampleCodec.extraMetadata(workout, consumed: consumed)
        if !extra.isEmpty { json["metadata"] = extra }
        return json
    }
}
