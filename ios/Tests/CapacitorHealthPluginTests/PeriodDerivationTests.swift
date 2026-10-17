import XCTest
@testable import CapacitorHealthPlugin

private struct FixtureSample: Decodable {
    let id: String
    let type: String
    let startDate: String
    let endDate: String
    let value: String?
    let isCycleStart: Bool?
    let source: String
    let timeZone: String?
}

private struct FixturePeriod: Decodable, Equatable {
    let firstDay: String
    let lastDay: String
    let flowSampleIds: [String]
    let source: String
}

private struct FixtureRange: Decodable {
    let startDate: String
    let endDate: String
}

private struct Fixture: Decodable {
    let description: String
    let defaultTimeZone: String
    let query: FixtureRange
    let samples: [FixtureSample]
    let expected: [FixturePeriod]
}

/// Runs every fixture in fixtures/menstruation through the derivation (decision #24).
final class PeriodDerivationTests: XCTestCase {
    private static var fixturesDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("fixtures/menstruation")
    }

    private func date(_ string: String) throws -> Date { try XCTUnwrap(DateCoding.date(from: string), string) }

    func testEveryFixture() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Self.fixturesDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertGreaterThanOrEqual(files.count, 10, "fixtures not found at \(Self.fixturesDirectory.path)")
        for file in files {
            let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
            let zone = try XCTUnwrap(TimeZone(identifier: fixture.defaultTimeZone))
            let start = try date(fixture.query.startDate)
            let end = try date(fixture.query.endDate)
            let lookBack = start.addingTimeInterval(-Double(PeriodDerivation.lookBackDays * 86_400))
            // What HealthKit would return: flow samples overlapping the widened range.
            let flows = try fixture.samples.filter { $0.type == "menstrualFlow" }.map { sample in
                PeriodDerivation.Flow(
                    id: sample.id,
                    start: try date(sample.startDate),
                    end: try date(sample.endDate),
                    value: sample.value ?? "unspecified",
                    isCycleStart: sample.isCycleStart,
                    sourceId: sample.source,
                    timeZone: sample.timeZone.flatMap(TimeZone.init(identifier:))
                )
            }.filter { $0.end >= lookBack && $0.start <= end }
            let periods = PeriodDerivation.periods(flows, overlapping: start, end, defaultZone: zone).map { period in
                FixturePeriod(
                    firstDay: period.firstDay.string,
                    lastDay: period.lastDay.string,
                    flowSampleIds: period.flows.map(\.id),
                    source: period.flows.first?.sourceId ?? ""
                )
            }
            XCTAssertEqual(periods, fixture.expected, "\(file.lastPathComponent): \(fixture.description)")
        }
    }

    func testLocalDays() throws {
        let day = try XCTUnwrap(PeriodDerivation.LocalDay("2026-10-31T12:00:00.000+05:30"))
        XCTAssertEqual(day.adding(days: 1).string, "2026-11-01")
        XCTAssertEqual(day.adding(days: -31).string, "2026-09-30")
        XCTAssertEqual(PeriodDerivation.LocalDay(year: 2026, month: 11, day: 3) - day, 3)
    }

    func testDayClientIds() throws {
        let day = try XCTUnwrap(PeriodDerivation.LocalDay("2026-10-01"))
        XCTAssertEqual(MenstruationPeriods.dayClientId("p:1", day), "p:1:2026-10-01")
        XCTAssertEqual(MenstruationPeriods.periodClientId("p:1:2026-10-01"), "p:1")
        XCTAssertNil(MenstruationPeriods.periodClientId("plain"))
        XCTAssertNil(MenstruationPeriods.periodClientId("x:2026-13-99z"))
    }
}
