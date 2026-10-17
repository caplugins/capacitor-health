import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

final class ChangesCursorTests: XCTestCase {
    func testRoundTrip() throws {
        let cursor = ChangesCursor(anchors: ["menstrualFlow": "a", "ovulationTest": "b"])
        XCTAssertEqual(try ChangesCursor.decode(cursor.encoded(), types: ["ovulationTest", "menstrualFlow"]), cursor)
    }

    func testRejectsOtherTypes() {
        let cursor = ChangesCursor(anchors: ["menstrualFlow": "a"]).encoded()
        XCTAssertThrowsError(try ChangesCursor.decode(cursor, types: ["menstrualFlow", "acne"])) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "cursorMismatch")
        }
    }

    func testRejectsGarbage() {
        XCTAssertThrowsError(try ChangesCursor.decode("%%%", types: ["menstrualFlow"])) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "cursor")
        }
        XCTAssertThrowsError(try ChangesCursor.unarchive("bm90IGFuIGFuY2hvcg=="))
    }

    func testAnchorArchiveRoundTrip() throws {
        let anchor = HKQueryAnchor(fromValue: 42)
        XCTAssertEqual(try ChangesCursor.unarchive(try ChangesCursor.archive(anchor)), anchor)
    }
}
