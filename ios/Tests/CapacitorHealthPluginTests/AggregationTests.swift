import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// `aggregate()` on iOS (T32): bucket edges, metrics and merging.
final class AggregationTests: XCTestCase {
    private func calendar(_ zone: String) throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: zone))
        return calendar
    }

    private func date(_ iso: String) throws -> Date {
        try XCTUnwrap(DateCoding.date(from: iso))
    }

    func testDayBucketsFollowTheCalendarAcrossDaylightSaving() throws {
        // Berlin leaves summer time on 2026-10-25: that day lasts 25 hours.
        let berlin = try calendar("Europe/Berlin")
        let buckets = Aggregation.buckets(
            from: try date("2026-10-24T00:00:00.000+02:00"), to: try date("2026-10-27T00:00:00.000+01:00"),
            unit: "day", size: 1, calendar: berlin
        )
        XCTAssertEqual(buckets.map { $0.end.timeIntervalSince($0.start) / 3600 }, [24, 25, 24])
        XCTAssertEqual(buckets[2].start, try date("2026-10-26T00:00:00.000+01:00"))
    }

    func testMonthBucketsKeepTheirDayAndTheLastEndsAtTheRangeEnd() throws {
        let utc = try calendar("UTC")
        let buckets = Aggregation.buckets(
            from: try date("2026-01-31T00:00:00.000Z"), to: try date("2026-04-15T00:00:00.000Z"), unit: "month", size: 1, calendar: utc
        )
        XCTAssertEqual(buckets.map(\.start), [
            try date("2026-01-31T00:00:00.000Z"), try date("2026-02-28T00:00:00.000Z"), try date("2026-03-31T00:00:00.000Z")
        ])
        XCTAssertEqual(buckets.last?.end, try date("2026-04-15T00:00:00.000Z"))
    }

    func testWeekMinuteAndWholeRangeBuckets() throws {
        let utc = try calendar("UTC")
        let start = try date("2026-10-05T00:00:00.000Z")
        let weeks = Aggregation.buckets(from: start, to: try date("2026-10-26T00:00:00.000Z"), unit: "week", size: 1, calendar: utc)
        XCTAssertEqual(weeks.count, 3)
        XCTAssertEqual(weeks[1].start, try date("2026-10-12T00:00:00.000Z"))
        let minutes = Aggregation.buckets(from: start, to: start.addingTimeInterval(3600), unit: "minute", size: 15, calendar: utc)
        XCTAssertEqual(minutes.count, 4)
        let whole = Aggregation.buckets(from: start, to: start.addingTimeInterval(90), unit: nil, size: 1, calendar: utc)
        XCTAssertEqual(whole, [Aggregation.Bucket(start: start, end: start.addingTimeInterval(90))])
        XCTAssertEqual(Aggregation.interval(unit: nil, size: 1, start: start, end: start.addingTimeInterval(90.5)), DateComponents(second: 91))
        XCTAssertEqual(Aggregation.interval(unit: "week", size: 2, start: start, end: start), DateComponents(day: 14))
    }

    func testMetricsFollowTheAggregationStyle() throws {
        func metrics(_ id: String) throws -> [String] { Aggregation.metrics(for: try XCTUnwrap(Registry.byId[id])) }
        XCTAssertEqual(try metrics("steps"), ["sum"])
        XCTAssertEqual(try metrics("heartRate"), ["avg", "min", "max"])
        XCTAssertEqual(try metrics("distance"), ["sum"])
        XCTAssertEqual(try metrics("speed"), ["min", "max"])
        XCTAssertEqual(try metrics("totalEnergy"), ["sum"])
        XCTAssertEqual(try metrics("menstrualFlow"), [])
        XCTAssertEqual(Aggregation.options(for: ["avg", "max"]), [.discreteAverage, .discreteMax])
    }

    func testSupportReportsAggregatableTypes() {
        let steps = HealthTypes.support(for: "steps")
        XCTAssertEqual(steps["aggregatable"] as? Bool, true)
        XCTAssertEqual(steps["metrics"] as? [String], ["sum"])
        let total = HealthTypes.support(for: "totalEnergy")
        XCTAssertEqual(total["aggregatable"] as? Bool, true)
        XCTAssertEqual(total["readable"] as? Bool, false)
        XCTAssertEqual(HealthTypes.support(for: "menstrualFlow")["aggregatable"] as? Bool, false)
        XCTAssertNil(HealthTypes.support(for: "menstrualFlow")["metrics"])
    }

    func testMembersMergePerMetric() {
        let merged = Aggregation.merge([["sum": 100, "min": 2, "max": 5], [:], ["sum": 50, "min": 1, "max": 4]])
        XCTAssertEqual(merged, ["sum": 150, "min": 1, "max": 5])
        XCTAssertEqual(Aggregation.merge([[:], [:]]), [:])
    }
}
