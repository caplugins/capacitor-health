import XCTest
@testable import CapacitorHealthPlugin

final class ReadCursorTests: XCTestCase {
    private let t0 = Date(timeIntervalSinceReferenceDate: 812_345_678.123_456)
    private let t1 = Date(timeIntervalSinceReferenceDate: 812_345_999.5)

    func testRoundTripKeepsTheExactDate() throws {
        let cursor = ReadCursor(typeId: "menstrualFlow", startDate: t0, skip: 2)
        let decoded = try ReadCursor.decode(cursor.encoded(), typeId: "menstrualFlow")
        XCTAssertEqual(decoded, cursor)
        XCTAssertEqual(decoded.startDate, t0)
    }

    func testRejectsGarbageAndOtherTypes() {
        XCTAssertThrowsError(try ReadCursor.decode("not base64!", typeId: "menstrualFlow")) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "cursor")
        }
        let cursor = ReadCursor(typeId: "acne", startDate: t0, skip: 0).encoded()
        XCTAssertThrowsError(try ReadCursor.decode(cursor, typeId: "menstrualFlow")) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "cursorMismatch")
        }
    }

    func testNoCursorOnTheLastPage() {
        XCTAssertNil(ReadCursor.next(typeId: "x", pageStarts: [t0, t1], hasMore: false, previous: nil))
    }

    func testSkipsSamplesTiedWithTheLastOne() {
        let next = ReadCursor.next(typeId: "x", pageStarts: [t0, t1, t1], hasMore: true, previous: nil)
        XCTAssertEqual(next?.startDate, t1)
        XCTAssertEqual(next?.skip, 2)
    }

    func testCarriesTheSkipWhenAWholePageTies() {
        let previous = ReadCursor(typeId: "x", startDate: t0, skip: 3)
        XCTAssertEqual(ReadCursor.next(typeId: "x", pageStarts: [t0, t0], hasMore: true, previous: previous)?.skip, 5)
        XCTAssertEqual(ReadCursor.next(typeId: "x", pageStarts: [t0, t1], hasMore: true, previous: previous)?.skip, 1)
    }
}
