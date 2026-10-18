import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// `workout` without the health store (T47, decisions #67–#68): activity matching, workout events ⇄ segments
/// and laps, and per activity family a `NewWorkout` planned, turned into an `HKWorkout` and encoded back.
final class WorkoutCodecTests: XCTestCase {
    private let start = "2026-10-01T07:00:00.000+05:30"
    private let end = "2026-10-01T08:00:00.000+05:30"

    private func date(_ string: String) throws -> Date { try XCTUnwrap(DateCoding.date(from: string), string) }

    /// `minutes` after the workout's start.
    private func at(_ minutes: Double) throws -> Date { try date(start).addingTimeInterval(minutes * 60) }

    private let zone = TimeZone(secondsFromGMT: 19_800) ?? .current

    private func iso(_ minutes: Double) throws -> String { DateCoding.string(from: try at(minutes), timeZone: zone) }

    private func plan(_ json: [String: Any]) throws -> WorkoutCodec.Plan {
        var fields: [String: Any] = ["type": "workout", "startDate": start, "endDate": end]
        fields.merge(json) { $1 }
        return try WorkoutCodec.plan(JSONFields(fields, path: "samples[0]"))
    }

    private func rejects(_ json: [String: Any], field: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try plan(json), file: file, line: line) { error in
            let error = error as? HealthError
            XCTAssertEqual(error?.code, .invalidArgument, file: file, line: line)
            XCTAssertEqual(error?.data["field"] as? String, field, file: file, line: line)
            XCTAssertEqual(error?.data["reason"] as? String, "valueUnsupportedOnPlatform", file: file, line: line)
        }
    }

    // MARK: - Activities

    func testMatchesActivitiesWithTheirMetadata() {
        let match = { (raw: UInt, metadata: [String: Any]?) in WorkoutCodec.activity(raw: raw, metadata: metadata)?.id }
        let indoor: [String: Any] = [HKMetadataKeyIndoorWorkout: NSNumber(value: true)]
        let outdoor: [String: Any] = [HKMetadataKeyIndoorWorkout: NSNumber(value: false)]
        XCTAssertEqual(match(HKWorkoutActivityType.running.rawValue, nil), "running")
        XCTAssertEqual(match(HKWorkoutActivityType.running.rawValue, outdoor), "running")
        XCTAssertEqual(match(HKWorkoutActivityType.running.rawValue, indoor), "runningTreadmill")
        XCTAssertEqual(match(HKWorkoutActivityType.cycling.rawValue, indoor), "cyclingStationary")
        XCTAssertEqual(match(HKWorkoutActivityType.rowing.rawValue, indoor), "rowingMachine")
        let location = { (value: HKWorkoutSwimmingLocationType) in [HKMetadataKeySwimmingLocationType: NSNumber(value: value.rawValue)] }
        XCTAssertEqual(match(HKWorkoutActivityType.swimming.rawValue, location(.pool)), "swimmingPool")
        XCTAssertEqual(match(HKWorkoutActivityType.swimming.rawValue, location(.openWater)), "swimmingOpenWater")
        XCTAssertEqual(match(HKWorkoutActivityType.swimming.rawValue, location(.unknown)), "swimming")
        XCTAssertEqual(match(HKWorkoutActivityType.swimming.rawValue, nil), "swimming")
        // Indoor metadata on an activity without an indoor variant changes nothing.
        XCTAssertEqual(match(HKWorkoutActivityType.yoga.rawValue, indoor), "yoga")
        XCTAssertNil(match(9_999, nil))
    }

    // MARK: - Events

    func testTurnsEventsIntoSegmentsAndLaps() throws {
        let length = HKQuantity(unit: .meter(), doubleValue: 400)
        let events = [
            WorkoutCodec.Event(type: .lap, start: try at(0), end: try at(2), lapLength: 400),
            WorkoutCodec.Event(type: .pause, start: try at(10)),
            WorkoutCodec.Event(type: .motionPaused, start: try at(12)),
            WorkoutCodec.Event(type: .resume, start: try at(14)),
            WorkoutCodec.Event(type: .motionResumed, start: try at(15)),
            WorkoutCodec.Event(type: .segment, start: try at(20), end: try at(30)),
            WorkoutCodec.Event(type: .marker, start: try at(25)),
            WorkoutCodec.Event(type: .resume, start: try at(31)),
            WorkoutCodec.Event(type: .segment, start: try at(35), end: try at(35)),
            WorkoutCodec.Event(type: .pause, start: try at(50))
        ]
        let (segments, laps) = WorkoutCodec.parts(events, workoutEnd: try at(60))
        XCTAssertEqual(segments, [
            // The pause and the motion pause overlap: one pause, 10–15.
            WorkoutCodec.Segment(start: try at(10), end: try at(15), segmentType: "pause"),
            WorkoutCodec.Segment(start: try at(20), end: try at(30), segmentType: nil),
            // A pause no resume follows lasts to the end; a lone resume and a zero-length segment are dropped.
            WorkoutCodec.Segment(start: try at(50), end: try at(60), segmentType: "pause")
        ])
        XCTAssertEqual(laps, [WorkoutCodec.Lap(start: try at(0), end: try at(2), length: 400)])
        let interval = DateInterval(start: try at(0), end: try at(2))
        let event = HKWorkoutEvent(type: .lap, dateInterval: interval, metadata: [HKMetadataKeyLapLength: length])
        XCTAssertEqual(WorkoutCodec.Event(event).lapLength, 400)
    }

    func testWritesSegmentsAndLapsAsEventsThatReadBack() throws {
        let segments = [
            WorkoutCodec.Segment(start: try at(5), end: try at(8), segmentType: "pause"),
            WorkoutCodec.Segment(start: try at(10), end: try at(40), segmentType: nil)
        ]
        let laps = [
            WorkoutCodec.Lap(start: try at(0), end: try at(5), length: 1000), WorkoutCodec.Lap(start: try at(5), end: try at(12), length: nil)
        ]
        let events = WorkoutCodec.events(segments: segments, laps: laps)
        XCTAssertEqual(events.map(\.type), [.lap, .pause, .lap, .resume, .segment])
        XCTAssertEqual(events[1].dateInterval.duration, 0)
        let read = WorkoutCodec.parts(events.map(WorkoutCodec.Event.init), workoutEnd: try at(60))
        XCTAssertEqual(read.segments, segments)
        XCTAssertEqual(read.laps, laps)
    }

    // MARK: - Plans

    func testPlansTotalsInTheActivitysDistanceType() throws {
        let families: [(activity: String, distance: HKQuantityTypeIdentifier)] = [
            ("running", .distanceWalkingRunning), ("runningTreadmill", .distanceWalkingRunning), ("hiking", .distanceWalkingRunning),
            ("cycling", .distanceCycling), ("cyclingStationary", .distanceCycling), ("swimmingPool", .distanceSwimming),
            ("swimmingOpenWater", .distanceSwimming), ("wheelchairRunPace", .distanceWheelchair),
            ("downhillSkiing", .distanceDownhillSnowSports), ("strengthTraining", .distanceWalkingRunning)
        ]
        for (activity, distance) in families {
            let planned = try plan([
                "activityType": activity, "totals": ["energy": 300, "distance": 5000], "clientId": "w-1", "clientVersion": 3
            ])
            XCTAssertEqual(planned.activity.id, activity)
            let identifiers = planned.totals.map(\.quantityType.identifier)
            XCTAssertEqual(identifiers, [HKQuantityTypeIdentifier.activeEnergyBurned.rawValue, distance.rawValue], activity)
            XCTAssertEqual(planned.totals.map { $0.metadata?[HKMetadataKeySyncIdentifier] as? String }, ["w-1:energy", "w-1:distance"])
            XCTAssertEqual(Set(planned.totals.map { $0.metadata?[HKMetadataKeySyncVersion] as? NSNumber }), [3])
            XCTAssertEqual(planned.totals[0].quantity.doubleValue(for: .kilocalorie()), 300)
            XCTAssertEqual(planned.totals[1].quantity.doubleValue(for: .meter()), 5000)
            XCTAssertEqual(Set(planned.totals.map(\.startDate)), [try date(start)])
            XCTAssertEqual(Set(planned.totals.map(\.endDate)), [try date(end)])
            XCTAssertEqual(planned.metadata[HKMetadataKeySyncIdentifier] as? String, "w-1")
        }
        if #available(iOS 18.0, *) {
            let rowing = try plan(["activityType": "rowingMachine", "totals": ["distance": 2000]])
            XCTAssertEqual(rowing.totals.first?.quantityType, HKQuantityType(.distanceRowing))
        } else {
            rejects(["activityType": "rowingMachine", "totals": ["distance": 2000]], field: "samples[0].totals.distance")
        }
        // A multisport workout has a distance per activity, so it takes no single distance total.
        if #available(iOS 16.0, *) {
            rejects(["activityType": "swimBikeRun", "totals": ["distance": 2000]], field: "samples[0].totals.distance")
        }
        XCTAssertTrue(try plan(["activityType": "yoga"]).totals.isEmpty)
    }

    func testSplitsTotalsAroundPausesSoStatisticsReadThemBack() throws {
        let planned = try plan([
            "activityType": "running", "clientId": "w-2", "totals": ["energy": 420, "distance": 8000],
            "segments": [
                ["startDate": try iso(20), "endDate": try iso(25), "segmentType": "pause"],
                ["startDate": try iso(24), "endDate": try iso(30), "segmentType": "pause"],
                ["startDate": try iso(40), "endDate": try iso(50)]
            ]
        ])
        let energy = planned.totals.filter { $0.quantityType == WorkoutCodec.energyType }
        XCTAssertEqual(energy.map(\.startDate), [try at(0), try at(30)])
        XCTAssertEqual(energy.map(\.endDate), [try at(20), try at(60)])
        XCTAssertEqual(energy.map { $0.quantity.doubleValue(for: .kilocalorie()) }, [168, 252])
        XCTAssertEqual(energy.map { $0.metadata?[HKMetadataKeySyncIdentifier] as? String }, ["w-2:energy", "w-2:energy:1"])
        let distance = planned.totals.filter { $0.quantityType != WorkoutCodec.energyType }
        XCTAssertEqual(distance.map { $0.quantity.doubleValue(for: .meter()) }.reduce(0, +), 8000, accuracy: 1e-9)
        XCTAssertTrue(WorkoutCodec.isTotal("w-2:energy:1", of: "w-2", total: "energy"))
        XCTAssertTrue(WorkoutCodec.isTotal("w-2:energy", of: "w-2", total: "energy"))
        XCTAssertFalse(WorkoutCodec.isTotal("w-2:energy:x", of: "w-2", total: "energy"))
        XCTAssertFalse(WorkoutCodec.isTotal("w-2:distance", of: "w-2", total: "energy"))
        XCTAssertFalse(WorkoutCodec.isTotal("w-22:energy", of: "w-2", total: "energy"))
        // A pause at an edge leaves one stretch; a workout paused throughout keeps its whole span.
        let edge = WorkoutCodec.active(start: try at(0), end: try at(60), pauses: [.init(start: try at(0), end: try at(10))])
        XCTAssertEqual(edge, [.init(start: try at(10), end: try at(60))])
        let all = WorkoutCodec.active(start: try at(0), end: try at(60), pauses: [.init(start: try at(0), end: try at(60))])
        XCTAssertEqual(all, [.init(start: try at(0), end: try at(60))])
    }

    func testPlansTheActivityMetadataAndConfiguration() throws {
        let treadmill = try plan(["activityType": "runningTreadmill", "timeZone": "Asia/Kolkata", "recordingMethod": "manual"])
        XCTAssertEqual(treadmill.metadata[HKMetadataKeyIndoorWorkout] as? NSNumber, true)
        XCTAssertEqual(treadmill.metadata[HKMetadataKeyTimeZone] as? String, "Asia/Kolkata")
        XCTAssertEqual(treadmill.metadata[HKMetadataKeyWasUserEntered] as? Bool, true)
        XCTAssertEqual(WorkoutCodec.configuration(treadmill.activity).locationType, .indoor)
        XCTAssertEqual(WorkoutCodec.configuration(treadmill.activity).activityType, .running)
        XCTAssertEqual(try plan(["activityType": "running"]).metadata[HKMetadataKeyIndoorWorkout] as? NSNumber, false)
        let pool = try plan(["activityType": "swimmingPool"])
        XCTAssertEqual(pool.metadata[HKMetadataKeySwimmingLocationType] as? NSNumber, NSNumber(value: HKWorkoutSwimmingLocationType.pool.rawValue))
        XCTAssertEqual(WorkoutCodec.configuration(pool.activity).swimmingLocationType, .pool)
        XCTAssertNil(try plan(["activityType": "yoga"]).metadata[HKMetadataKeyIndoorWorkout])
    }

    func testPoolSwimsCarryTheirLapLengthOnTheWorkout() throws {
        let lap = { (from: Double, until: Double, length: Double?) throws -> [String: Any] in
            var item: [String: Any] = ["startDate": try self.iso(from), "endDate": try self.iso(until)]
            if let length { item["length"] = length }
            return item
        }
        let pool = try plan(["activityType": "swimmingPool", "laps": [try lap(0, 2, 25), try lap(2, 4, 25)]])
        XCTAssertEqual((pool.metadata[HKMetadataKeyLapLength] as? HKQuantity)?.doubleValue(for: .meter()), 25)
        for laps in [[try lap(0, 2, 25), try lap(2, 4, 50)], [try lap(0, 2, nil)], [try lap(0, 2, 0)]] {
            XCTAssertThrowsError(try plan(["activityType": "swimmingPool", "laps": laps])) { error in
                XCTAssertEqual((error as? HealthError)?.data["reason"] as? String, "poolLapLength")
            }
        }
        // Open water and pools without laps need nothing.
        XCTAssertNil(try plan(["activityType": "swimmingOpenWater", "laps": [try lap(0, 2, nil)]]).metadata[HKMetadataKeyLapLength])
        XCTAssertNil(try plan(["activityType": "swimmingPool"]).metadata[HKMetadataKeyLapLength])
    }

    @available(iOS, deprecated: 17.0)
    func testReadsAPoolsLapLengthIntoItsLaps() throws {
        let lapEvent = HKWorkoutEvent(type: .lap, dateInterval: DateInterval(start: try at(0), end: try at(2)), metadata: nil)
        let swim = HKWorkout(
            activityType: .swimming, start: try at(0), end: try at(60), workoutEvents: [lapEvent], totalEnergyBurned: nil, totalDistance: nil,
            metadata: [
                HKMetadataKeySwimmingLocationType: NSNumber(value: HKWorkoutSwimmingLocationType.pool.rawValue),
                HKMetadataKeyLapLength: HKQuantity(unit: .meter(), doubleValue: 25)
            ]
        )
        let json = WorkoutCodec.encode(swim, hasRoute: false)
        XCTAssertEqual(json["activityType"] as? String, "swimmingPool")
        XCTAssertEqual((json["laps"] as? [[String: Any]])?.first?["length"] as? Double, 25)
    }

    func testRejectsWhatIOSCantStore() throws {
        rejects(["activityType": "guidedBreathing"], field: "samples[0].activityType")
        rejects(["activityType": "running", "title": "Run"], field: "samples[0].title")
        rejects(["activityType": "running", "segments": [["startDate": try iso(0), "endDate": try iso(5), "segmentType": "running"]]],
                field: "samples[0].segments[0].segmentType")
        rejects(["activityType": "running", "segments": [["startDate": try iso(0), "endDate": try iso(5), "repetitions": 3]]],
                field: "samples[0].segments[0].repetitions")
        XCTAssertThrowsError(try plan(["activityType": "running", "endDate": start]))
    }

    func testPlansMultisportActivitiesOnIOS16() throws {
        let parts: [[String: Any]] = [
            ["activityType": "swimmingOpenWater", "startDate": try iso(0), "endDate": try iso(20)],
            ["activityType": "cycling", "startDate": try iso(20), "endDate": try iso(45)],
            ["activityType": "running", "startDate": try iso(45), "endDate": try iso(60)]
        ]
        guard #available(iOS 16.0, *) else {
            rejects(["activityType": "other", "activities": parts], field: "samples[0].activities")
            return
        }
        let planned = try plan(["activityType": "swimBikeRun", "activities": parts])
        let activities = planned.activities.compactMap { $0 as? HKWorkoutActivity }
        XCTAssertEqual(activities.map(\.workoutConfiguration.activityType), [.swimming, .cycling, .running])
        XCTAssertEqual(activities[0].workoutConfiguration.swimmingLocationType, .openWater)
        XCTAssertEqual(activities[1].workoutConfiguration.locationType, .outdoor)
        XCTAssertEqual(activities.map(\.startDate), [try at(0), try at(20), try at(45)])
        XCTAssertEqual(activities.last?.endDate, try at(60))
    }
}

/// Per activity family: a `NewWorkout` planned, turned into the `HKWorkout` it would produce and encoded back.
final class WorkoutRoundTripTests: XCTestCase {
    private let start = "2026-10-01T07:00:00.000+05:30"
    private let end = "2026-10-01T08:00:00.000+05:30"
    private let zone = TimeZone(secondsFromGMT: 19_800) ?? .current

    private func date(_ string: String) throws -> Date { try XCTUnwrap(DateCoding.date(from: string), string) }

    private func at(_ minutes: Double) throws -> Date { try date(start).addingTimeInterval(minutes * 60) }

    private func iso(_ minutes: Double) throws -> String { DateCoding.string(from: try at(minutes), timeZone: zone) }

    private func plan(_ json: [String: Any]) throws -> WorkoutCodec.Plan {
        var fields: [String: Any] = ["type": "workout", "startDate": start, "endDate": end]
        fields.merge(json) { $1 }
        return try WorkoutCodec.plan(JSONFields(fields, path: "samples[0]"))
    }

    /// The `HKWorkout` a plan would produce, through the initializer HealthKit deprecated for the builder.
    @available(iOS, deprecated: 17.0)
    private func workout(_ plan: WorkoutCodec.Plan) -> HKWorkout {
        let energy = plan.totals.first { $0.quantityType == WorkoutCodec.energyType }?.quantity
        let distance = plan.totals.first { $0.quantityType != WorkoutCodec.energyType }?.quantity
        return HKWorkout(
            activityType: HKWorkoutActivityType(rawValue: plan.activity.raw) ?? .other, start: plan.start, end: plan.end,
            workoutEvents: plan.events, totalEnergyBurned: energy, totalDistance: distance, metadata: plan.metadata
        )
    }

    @available(iOS, deprecated: 17.0)
    func testRoundTripsEachActivityFamily() throws {
        let families = ["running", "runningTreadmill", "walking", "cycling", "cyclingStationary", "swimmingPool", "swimmingOpenWater",
                        "swimming", "rowing", "strengthTraining", "highIntensityIntervalTraining", "yoga", "wheelchairWalkPace",
                        "downhillSkiing", "soccer", "other"]
        for activity in families {
            let input: [String: Any] = [
                "activityType": activity,
                "clientId": "rt-\(activity)",
                "timeZone": "Asia/Kolkata",
                "segments": [
                    ["startDate": try iso(10), "endDate": try iso(12), "segmentType": "pause"],
                    ["startDate": try iso(20), "endDate": try iso(40)]
                ],
                "laps": activity == "swimmingPool"
                    ? [
                        ["startDate": try iso(0), "endDate": try iso(30), "length": 25],
                        ["startDate": try iso(30), "endDate": try iso(60), "length": 25]
                    ]
                    : [["startDate": try iso(0), "endDate": try iso(30), "length": 2500], ["startDate": try iso(30), "endDate": try iso(60)]]
            ]
            let json = WorkoutCodec.encode(workout(try plan(input)), hasRoute: false)
            XCTAssertEqual(json["type"] as? String, "workout", activity)
            XCTAssertEqual(json["kind"] as? String, "special", activity)
            XCTAssertEqual(json["activityType"] as? String, activity)
            XCTAssertEqual(json["clientId"] as? String, "rt-\(activity)")
            XCTAssertEqual(json["startDate"] as? String, start)
            XCTAssertEqual(json["endDate"] as? String, end)
            XCTAssertEqual(json["hasRoute"] as? Bool, false)
            XCTAssertEqual(json["segments"] as? [[String: String]], [
                ["startDate": try iso(10), "endDate": try iso(12), "segmentType": "pause"],
                ["startDate": try iso(20), "endDate": try iso(40)]
            ], activity)
            let laps = try XCTUnwrap(json["laps"] as? [[String: Any]])
            XCTAssertEqual(laps.map { $0["startDate"] as? String }, [try iso(0), try iso(30)])
            XCTAssertEqual(laps.map { $0["length"] as? Double }, activity == "swimmingPool" ? [25, 25] : [2500, nil], activity)
            // Indoor and swimming-location metadata are read into the activity, not repeated as hk. metadata.
            XCTAssertNil((json["metadata"] as? [String: Any])?["hk.\(HKMetadataKeyIndoorWorkout)"], activity)
            let native = try XCTUnwrap(json["native"] as? [String: Any])
            XCTAssertEqual(native["type"] as? String, HKWorkoutTypeIdentifier)
            XCTAssertEqual(native["value"] as? UInt, WorkoutCodec.activity(id: activity)?.raw)
        }
    }

    @available(iOS, deprecated: 17.0)
    func testReadsUnknownActivitiesAsOther() {
        // HealthKit raises for raw values it doesn't know, so this is one it deprecated: dance (14), which only
        // old data carries and the registry leaves out (decision #62).
        let unknown = HKWorkout(activityType: HKWorkoutActivityType(rawValue: 14) ?? .other, start: Date(timeIntervalSince1970: 0),
                                end: Date(timeIntervalSince1970: 600))
        let json = WorkoutCodec.encode(unknown, hasRoute: true)
        XCTAssertEqual(json["activityType"] as? String, "other")
        XCTAssertEqual((json["native"] as? [String: Any])?["value"] as? UInt, 14)
        XCTAssertEqual(json["segments"] as? [[String: String]], [])
        XCTAssertEqual(json["hasRoute"] as? Bool, true)
    }
}
