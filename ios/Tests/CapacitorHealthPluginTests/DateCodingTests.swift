import XCTest
@testable import CapacitorHealthPlugin

final class DateCodingTests: XCTestCase {
    func testParsesTheCanonicalFormat() throws {
        let date = try XCTUnwrap(DateCoding.date(from: "2026-10-15T08:00:00.250+05:30"))
        XCTAssertEqual(date.timeIntervalSince1970, 1_792_031_400.25, accuracy: 0.0001)
    }

    func testParsesPlainISO() {
        XCTAssertEqual(DateCoding.date(from: "2026-10-15T02:30:00Z")?.timeIntervalSince1970, 1_792_031_400)
    }

    func testRejectsGarbage() {
        XCTAssertNil(DateCoding.date(from: "15/10/2026"))
        XCTAssertThrowsError(try DateCoding.required("nope", field: "startDate")) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "startDate")
        }
    }

    func testWritesInTheGivenZone() throws {
        let date = Date(timeIntervalSince1970: 1_792_031_400)
        XCTAssertEqual(DateCoding.string(from: date, timeZone: try XCTUnwrap(TimeZone(identifier: "Asia/Kolkata"))), "2026-10-15T08:00:00.000+05:30")
        XCTAssertEqual(DateCoding.string(from: date, timeZone: try XCTUnwrap(TimeZone(secondsFromGMT: 0))), "2026-10-15T02:30:00.000+00:00")
    }

    func testOffsets() {
        XCTAssertEqual(DateCoding.offsetString(seconds: 19_800), "+05:30")
        XCTAssertEqual(DateCoding.offsetString(seconds: -12_600), "-03:30")
        XCTAssertEqual(DateCoding.offsetString(seconds: 0), "+00:00")
        XCTAssertEqual(DateCoding.offsetSeconds(of: "2026-10-15T08:00:00.000+05:30"), 19_800)
        XCTAssertEqual(DateCoding.offsetSeconds(of: "2026-10-15T08:00:00.000-03:30"), -12_600)
        XCTAssertEqual(DateCoding.offsetSeconds(of: "2026-10-15T08:00:00Z"), 0)
    }
}
