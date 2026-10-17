import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

private struct Sample: Decodable {
    let id: String
    let value: String
    let startDate: String
    let endDate: String
    let source: String
    let clientId: String?
    let clientVersion: Int?
}

private struct Stage: Decodable {
    let stage: String
    let startDate: String
    let endDate: String
}

private struct Session: Decodable {
    let id: String
    let startDate: String
    let endDate: String
    let clientId: String?
    let clientVersion: Int?
    let stageSampleIds: [String]
    let stages: [Stage]
}

private struct Range: Decodable {
    let startDate: String
    let endDate: String
}

private struct Fixture: Decodable {
    let query: Range
    let samples: [Sample]
    let expected: [Session]
}

/// `sleepSession` through HealthKit objects (T44, decisions #64–#65): fixtures as `HKCategorySample`s, read
/// into sessions and encoded as the bridge returns them; writes expanded into samples HealthKit accepts.
final class SleepSessionsTests: XCTestCase {
    private let sleepType = HKCategoryType(.sleepAnalysis)

    private static var fixturesDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("fixtures/sleep")
    }

    private func date(_ string: String) throws -> Date { try XCTUnwrap(DateCoding.date(from: string), string) }

    private func healthKitSample(_ sample: Sample) throws -> HKCategorySample {
        var metadata: [String: Any] = [:]
        if let clientId = sample.clientId {
            metadata[HKMetadataKeySyncIdentifier] = clientId
            metadata[HKMetadataKeySyncVersion] = NSNumber(value: sample.clientVersion ?? 1)
        }
        let raw = try SampleCodec.rawValue(sample.value, valueSet: SleepSessions.stageSet, field: sample.id)
        return HKCategorySample(type: sleepType, value: raw, start: try date(sample.startDate), end: try date(sample.endDate), metadata: metadata)
    }

    func testEveryFixtureEndToEnd() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Self.fixturesDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        XCTAssertGreaterThanOrEqual(files.count, 10)
        for file in files {
            let name = file.lastPathComponent
            let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
            // Unsaved samples all come from this app, so the fixture's ids and sources are put back on top of
            // what `stageSample` read from each HealthKit object.
            var objects: [String: HKCategorySample] = [:]
            let stageSamples = try fixture.samples.map { sample -> SleepDerivation.StageSample in
                let object = try healthKitSample(sample)
                objects[sample.id] = object
                let read = SleepSessions.stageSample(object)
                XCTAssertEqual(read.stage, sample.value, name)
                XCTAssertEqual(read.clientId, sample.clientId, name)
                XCTAssertEqual(read.clientVersion, sample.clientId == nil ? nil : sample.clientVersion ?? 1, name)
                return SleepDerivation.StageSample(
                    id: sample.id, start: read.start, end: read.end, stage: read.stage, sourceId: sample.source,
                    clientId: read.clientId, clientVersion: read.clientVersion
                )
            }
            let start = try date(fixture.query.startDate)
            let end = try date(fixture.query.endDate)
            let sessions = SleepDerivation.sessions(stageSamples, overlapping: start, end)
            XCTAssertEqual(sessions.count, fixture.expected.count, name)
            for (session, expected) in zip(sessions, fixture.expected) {
                let json = SleepSessions.encode(session, samples: session.samples.compactMap { objects[$0.id] })
                XCTAssertEqual(json["type"] as? String, "sleepSession", name)
                XCTAssertEqual(json["kind"] as? String, "special", name)
                XCTAssertEqual(json["derived"] as? Bool, true, name)
                XCTAssertEqual(json["id"] as? String, objects[expected.id]?.uuid.uuidString, name)
                XCTAssertEqual(json["stageSampleIds"] as? [String], expected.stageSampleIds, name)
                XCTAssertEqual(json["clientId"] as? String, expected.clientId, name)
                XCTAssertEqual(json["clientVersion"] as? Int, expected.clientVersion, name)
                XCTAssertEqual(DateCoding.date(from: json["startDate"] as? String ?? ""), try date(expected.startDate), name)
                XCTAssertEqual(DateCoding.date(from: json["endDate"] as? String ?? ""), try date(expected.endDate), name)
                let stages = try XCTUnwrap(json["stages"] as? [[String: String]], name)
                XCTAssertEqual(stages.map { $0["stage"] }, expected.stages.map(\.stage), name)
                for (stage, wanted) in zip(stages, expected.stages) {
                    XCTAssertEqual(DateCoding.date(from: stage["startDate"] ?? ""), try date(wanted.startDate), name)
                    XCTAssertEqual(DateCoding.date(from: stage["endDate"] ?? ""), try date(wanted.endDate), name)
                }
            }
        }
    }

    private func expand(_ json: [String: Any]) throws -> [HKCategorySample] {
        try SleepSessions(store: HKHealthStore()).expand(JSONFields(json, path: "samples[0]"))
    }

    private let night: [String: Any] = [
        "type": "sleepSession", "startDate": "2026-10-01T22:00:00.000+05:30", "endDate": "2026-10-02T07:00:00.000+05:30"
    ]

    private func stage(_ value: String, _ start: String, _ end: String) -> [String: Any] {
        ["stage": value, "startDate": "2026-10-0\(start).000+05:30", "endDate": "2026-10-0\(end).000+05:30"]
    }

    func testWritesAnInBedSpanAndOneSamplePerStage() throws {
        var json = night
        json["clientId"] = "night-1"
        json["clientVersion"] = 4
        json["timeZone"] = "Asia/Kolkata"
        json["recordingMethod"] = "manual"
        json["stages"] = [stage("inBed", "1T22:00:00", "1T22:20:00"), stage("asleep", "1T22:20:00", "2T03:00:00"), stage("awake", "2T03:00:00", "2T03:10:00")]
        let samples = try expand(json)
        XCTAssertEqual(samples.map(\.value), [0, 1, 2])
        XCTAssertEqual(samples.map { $0.metadata?[HKMetadataKeySyncIdentifier] as? String }, ["night-1:inBed", "night-1:0", "night-1:1"])
        XCTAssertEqual(Set(samples.map { $0.metadata?[HKMetadataKeySyncVersion] as? NSNumber }), [4])
        XCTAssertEqual(Set(samples.map { $0.metadata?[HKMetadataKeyTimeZone] as? String }), ["Asia/Kolkata"])
        XCTAssertEqual(Set(samples.map { $0.metadata?[HKMetadataKeyWasUserEntered] as? Bool }), [true])
        XCTAssertEqual(samples[0].startDate, try date("2026-10-01T22:00:00.000+05:30"))
        XCTAssertEqual(samples[0].endDate, try date("2026-10-02T07:00:00.000+05:30"))
        XCTAssertEqual(samples[2].startDate, try date("2026-10-02T03:00:00.000+05:30"))

        // Reading the written samples gives the session back; the uncovered end reads as inBed.
        let read = samples.map(SleepSessions.stageSample)
        let session = try XCTUnwrap(SleepDerivation.derive(read).first)
        XCTAssertEqual(session.clientId, "night-1")
        XCTAssertEqual(session.clientVersion, 4)
        XCTAssertEqual(session.stages.map(\.stage), ["inBed", "asleep", "awake", "inBed"])
        let encoded = SleepSessions.encode(session, samples: samples)
        XCTAssertEqual(encoded["id"] as? String, samples[0].uuid.uuidString)
        XCTAssertEqual(encoded["startDate"] as? String, "2026-10-01T22:00:00.000+05:30", "in the recorded zone")
    }

    func testRejectsWhatHealthKitCantStore() throws {
        var titled = night
        titled["title"] = "Night"
        XCTAssertThrowsError(try expand(titled)) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "samples[0].title")
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "valueUnsupportedOnPlatform")
        }
        var outOfBed = night
        outOfBed["stages"] = [stage("outOfBed", "2T03:00:00", "2T03:10:00")]
        XCTAssertThrowsError(try expand(outOfBed)) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "samples[0].stages[0].stage")
        }
        var deep = night
        deep["stages"] = [stage("deep", "2T01:00:00", "2T02:00:00")]
        if #available(iOS 16.0, *) {
            XCTAssertEqual(try expand(deep).map(\.value), [0, 4])
        } else {
            XCTAssertThrowsError(try expand(deep), "HealthKit raises for asleepDeep on iOS 15")
        }
    }

    func testReadsRawValuesAsStages() {
        let rem = HKCategorySample(type: sleepType, value: 5, start: Date(), end: Date().addingTimeInterval(60))
        XCTAssertEqual(SleepSessions.stageSample(rem).stage, "rem")
        // A raw value newer than the registry reads as its number, which no stage priority ranks.
        XCTAssertEqual(SampleCodec.unifiedValue(raw: 99, valueSet: SleepSessions.stageSet), "99")
    }

    private func at(_ hours: Double) -> Date { Date(timeIntervalSince1970: 1_790_000_000 + hours * 3_600) }

    func testTimeAsleepCountsOverlapBetweenAppsOnce() {
        let samples = [
            SleepDerivation.StageSample(id: "a1", start: at(0), end: at(8), stage: "inBed", sourceId: "bed"),
            SleepDerivation.StageSample(id: "a2", start: at(1), end: at(7), stage: "asleep", sourceId: "bed"),
            SleepDerivation.StageSample(id: "b1", start: at(2), end: at(4), stage: "deep", sourceId: "watch"),
            SleepDerivation.StageSample(id: "b2", start: at(4), end: at(4.5), stage: "awake", sourceId: "watch"),
            SleepDerivation.StageSample(id: "b3", start: at(4.5), end: at(7.5), stage: "rem", sourceId: "watch")
        ]
        let sessions = SleepDerivation.derive(samples)
        XCTAssertEqual(sessions.count, 2)
        let values = SleepDerivation.timeAsleep(sessions, buckets: [(at(-2), at(0.5)), (at(0), at(12)), (at(6), at(12)), (at(20), at(24))])
        XCTAssertEqual(values[0], 0, "a session overlaps, nobody asleep yet")
        // Asleep 1–7 (bed) united with deep 2–4 and REM 4.5–7.5 (watch): 1–7.5. The watch's awake doesn't cut
        // the bed's asleep: another app saying asleep is enough.
        XCTAssertEqual(values[1], 6.5 * 3_600)
        XCTAssertEqual(values[2], 1.5 * 3_600)
        XCTAssertNil(values[3], "no session, no value")
    }

    func testSupportReportsDurationAndStages() {
        let support = HealthTypes.support(for: "sleepSession")
        XCTAssertEqual(support["supported"] as? Bool, true)
        XCTAssertEqual(support["writable"] as? Bool, true)
        XCTAssertEqual(support["metrics"] as? [String], ["duration"])
        let values = support["values"] as? [String] ?? []
        if #available(iOS 16.0, *) {
            XCTAssertEqual(values, ["inBed", "asleep", "awake", "light", "deep", "rem"])
        } else {
            XCTAssertEqual(values, ["inBed", "asleep", "awake"])
        }
    }
}
