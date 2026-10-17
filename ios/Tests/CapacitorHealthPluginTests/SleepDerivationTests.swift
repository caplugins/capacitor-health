import XCTest
@testable import CapacitorHealthPlugin

private struct FixtureSample: Decodable {
    let id: String
    let value: String
    let startDate: String
    let endDate: String
    let source: String
    let clientId: String?
    let clientVersion: Int?
}

private struct FixtureStage: Decodable {
    let stage: String
    let startDate: String
    let endDate: String
}

private struct FixtureSession: Decodable {
    let id: String
    let startDate: String
    let endDate: String
    let source: String
    let clientId: String?
    let clientVersion: Int?
    let stageSampleIds: [String]
    let stages: [FixtureStage]
}

private struct FixtureRange: Decodable {
    let startDate: String
    let endDate: String
}

private struct Fixture: Decodable {
    let description: String
    let query: FixtureRange
    let samples: [FixtureSample]
    let expected: [FixtureSession]
}

/// Comparable form of a session: instants, so fixtures may write them in any offset.
private struct Observed: Equatable, CustomStringConvertible {
    let id: String
    let start: Date
    let end: Date
    let source: String
    let clientId: String?
    let clientVersion: Int?
    let sampleIds: [String]
    let stages: [SleepDerivation.Stage]

    var description: String {
        let stages = stages.map { "\($0.stage) \($0.start.timeIntervalSince1970)–\($0.end.timeIntervalSince1970)" }
        return "\(id) [\(source)] \(start.timeIntervalSince1970)–\(end.timeIntervalSince1970) \(clientId ?? "-") v\(clientVersion ?? -1) "
            + "\(sampleIds) \(stages)"
    }
}

/// Runs every fixture in fixtures/sleep through the derivation (decision #64), and checks the write expansion.
final class SleepDerivationTests: XCTestCase {
    private static var fixturesDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("fixtures/sleep")
    }

    private func date(_ string: String) throws -> Date { try XCTUnwrap(DateCoding.date(from: string), string) }

    func testEveryFixture() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Self.fixturesDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertGreaterThanOrEqual(files.count, 10, "fixtures not found at \(Self.fixturesDirectory.path)")
        for file in files {
            let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
            let start = try date(fixture.query.startDate)
            let end = try date(fixture.query.endDate)
            let from = start.addingTimeInterval(-SleepDerivation.lookAround)
            let to = end.addingTimeInterval(SleepDerivation.lookAround)
            // What HealthKit would return: samples overlapping the widened range.
            let samples = try fixture.samples.map { sample in
                SleepDerivation.StageSample(
                    id: sample.id, start: try date(sample.startDate), end: try date(sample.endDate), stage: sample.value,
                    sourceId: sample.source, clientId: sample.clientId, clientVersion: sample.clientVersion
                )
            }.filter { $0.end >= from && $0.start <= to }
            let observed = SleepDerivation.sessions(samples, overlapping: start, end).map { session in
                Observed(
                    id: session.id, start: session.start, end: session.end, source: session.sourceId,
                    clientId: session.clientId, clientVersion: session.clientVersion,
                    sampleIds: session.samples.map(\.id), stages: session.stages
                )
            }
            let expected = try fixture.expected.map { session in
                Observed(
                    id: session.id, start: try date(session.startDate), end: try date(session.endDate), source: session.source,
                    clientId: session.clientId, clientVersion: session.clientVersion, sampleIds: session.stageSampleIds,
                    stages: try session.stages.map { .init(stage: $0.stage, start: try date($0.startDate), end: try date($0.endDate)) }
                )
            }
            XCTAssertEqual(observed, expected, "\(file.lastPathComponent): \(fixture.description)")
        }
    }

    func testClientIdSuffixes() {
        XCTAssertEqual(SleepDerivation.split(clientId: "night-1:inBed")?.session, "night-1")
        XCTAssertEqual(SleepDerivation.split(clientId: "a:b:12")?.session, "a:b")
        XCTAssertNil(SleepDerivation.split(clientId: "night-1"))
        XCTAssertNil(SleepDerivation.split(clientId: ":inBed"))
        XCTAssertNil(SleepDerivation.split(clientId: "p:2026-10-01"), "a period day's clientId")
        XCTAssertNil(SleepDerivation.split(clientId: "n:+3"))
        XCTAssertNil(SleepDerivation.split(clientId: "n:٣"), "non-ASCII digits")
    }

    private func at(_ hours: Double) -> Date { Date(timeIntervalSince1970: 1_790_000_000 + hours * 3_600) }

    func testExpandWritesAnInBedSpanAndOneSamplePerStage() {
        let stages = [
            SleepDerivation.Stage(stage: "deep", start: at(2), end: at(3)),
            SleepDerivation.Stage(stage: "inBed", start: at(0), end: at(0.5)),
            SleepDerivation.Stage(stage: "light", start: at(0.5), end: at(2)),
        ]
        XCTAssertEqual(SleepDerivation.expand(start: at(0), end: at(8), stages: stages, clientId: "n1"), [
            .init(stage: "inBed", start: at(0), end: at(8), clientId: "n1:inBed"),
            .init(stage: "light", start: at(0.5), end: at(2), clientId: "n1:0"),
            .init(stage: "deep", start: at(2), end: at(3), clientId: "n1:1"),
        ])
        XCTAssertEqual(
            SleepDerivation.expand(start: at(0), end: at(8), stages: [], clientId: nil),
            [.init(stage: "inBed", start: at(0), end: at(8), clientId: nil)]
        )
    }

    func testWrittenSessionsReadBackAsWritten() {
        let stages = [
            SleepDerivation.Stage(stage: "light", start: at(0.5), end: at(2)),
            SleepDerivation.Stage(stage: "deep", start: at(2), end: at(3)),
            SleepDerivation.Stage(stage: "awake", start: at(4), end: at(4.25)),
        ]
        let planned = SleepDerivation.expand(start: at(0), end: at(8), stages: stages, clientId: "n1")
        let samples = planned.enumerated().map { index, sample in
            SleepDerivation.StageSample(
                id: "s\(index)", start: sample.start, end: sample.end, stage: sample.stage, sourceId: "app",
                clientId: sample.clientId, clientVersion: 3
            )
        }
        let sessions = SleepDerivation.derive(samples)
        XCTAssertEqual(sessions.count, 1)
        XCTAssertEqual(sessions.first?.id, "s0")
        XCTAssertEqual(sessions.first?.clientId, "n1")
        XCTAssertEqual(sessions.first?.clientVersion, 3)
        XCTAssertEqual(sessions.first?.start, at(0))
        XCTAssertEqual(sessions.first?.end, at(8))
        // Time the stages leave uncovered reads back as inBed.
        XCTAssertEqual(sessions.first?.stages, [
            .init(stage: "inBed", start: at(0), end: at(0.5)),
            .init(stage: "light", start: at(0.5), end: at(2)),
            .init(stage: "deep", start: at(2), end: at(3)),
            .init(stage: "inBed", start: at(3), end: at(4)),
            .init(stage: "awake", start: at(4), end: at(4.25)),
            .init(stage: "inBed", start: at(4.25), end: at(8)),
        ])
    }

    func testRewriteDeletesStagesItNoLongerHas() {
        let existing = ["n1:inBed", "n1:0", "n1:1", "n1:2"].enumerated().map { index, clientId in
            SleepDerivation.StageSample(id: "s\(index)", start: at(0), end: at(1), stage: "light", sourceId: "app", clientId: clientId)
        }
        let planned = SleepDerivation.expand(
            start: at(0), end: at(8), stages: [.init(stage: "light", start: at(1), end: at(2))], clientId: "n1"
        )
        XCTAssertEqual(SleepDerivation.stale(existing, keeping: planned).map(\.clientId), ["n1:1", "n1:2"])
    }

    func testStagesSkipSamplesWithoutDuration() {
        let samples = [
            SleepDerivation.StageSample(id: "a", start: at(0), end: at(1), stage: "asleep", sourceId: "x"),
            SleepDerivation.StageSample(id: "b", start: at(0.5), end: at(0.5), stage: "awake", sourceId: "x"),
        ]
        XCTAssertEqual(SleepDerivation.stages(of: samples), [.init(stage: "asleep", start: at(0), end: at(1))])
        XCTAssertEqual(SleepDerivation.derive(samples).first?.samples.map(\.id), ["a", "b"])
    }
}
