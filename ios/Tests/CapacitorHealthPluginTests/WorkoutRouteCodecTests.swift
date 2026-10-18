import CoreLocation
import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

/// Workout routes without the health store (T49, decision #70): `NewWorkout.route` ⇄ `CLLocation`.
final class WorkoutRouteCodecTests: XCTestCase {
    private let start = "2026-10-01T07:00:00.000+05:30"
    private let end = "2026-10-01T08:00:00.000+05:30"
    private let zone = TimeZone(secondsFromGMT: 19_800) ?? .current

    private func plan(_ route: [[String: Any]]?) throws -> WorkoutCodec.Plan {
        var fields: [String: Any] = ["type": "workout", "activityType": "running", "startDate": start, "endDate": end]
        if let route { fields["route"] = route }
        return try WorkoutCodec.plan(JSONFields(fields, path: "samples[0]"))
    }

    func testPlansNoRouteWithoutOne() throws {
        XCTAssertTrue(try plan(nil).route.isEmpty)
        XCTAssertTrue(try plan([]).route.isEmpty)
    }

    func testPlansLocationsInTimeOrder() throws {
        let route = try plan([
            ["time": "2026-10-01T07:30:00.000+05:30", "latitude": 52.52, "longitude": 13.405, "altitude": 34.5,
             "horizontalAccuracy": 5, "verticalAccuracy": 3],
            ["time": start, "latitude": -33.9, "longitude": 151.2]
        ]).route
        XCTAssertEqual(route.count, 2)
        let first = route[0]
        XCTAssertEqual(first.timestamp, DateCoding.date(from: start))
        XCTAssertEqual(first.coordinate.latitude, -33.9)
        // No horizontal accuracy: 0, so Core Location keeps the point valid. No altitude: vertical accuracy -1.
        XCTAssertEqual(first.horizontalAccuracy, 0)
        XCTAssertEqual(first.verticalAccuracy, -1)
        let second = route[1]
        XCTAssertEqual(second.altitude, 34.5)
        XCTAssertEqual(second.horizontalAccuracy, 5)
        XCTAssertEqual(second.verticalAccuracy, 3)
    }

    func testEncodesOnlyValidParts() throws {
        let time = try XCTUnwrap(DateCoding.date(from: start))
        let full = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 52.52, longitude: 13.405), altitude: 34.5,
            horizontalAccuracy: 5, verticalAccuracy: 3, timestamp: time
        )
        let json = WorkoutRouteCodec.encode(full, timeZone: zone)
        XCTAssertEqual(json["time"] as? String, start)
        XCTAssertEqual(json["latitude"] as? Double, 52.52)
        XCTAssertEqual(json["longitude"] as? Double, 13.405)
        XCTAssertEqual(json["altitude"] as? Double, 34.5)
        XCTAssertEqual(json["horizontalAccuracy"] as? Double, 5)
        XCTAssertEqual(json["verticalAccuracy"] as? Double, 3)

        let flat = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 1, longitude: 2), altitude: 0,
            horizontalAccuracy: -1, verticalAccuracy: -1, timestamp: time
        )
        let partial = WorkoutRouteCodec.encode(flat, timeZone: zone)
        XCTAssertNil(partial["altitude"])
        XCTAssertNil(partial["verticalAccuracy"])
        XCTAssertNil(partial["horizontalAccuracy"])
    }

    func testRoundTripsAPoint() throws {
        let point: [String: Any] = [
            "time": "2026-10-01T07:15:00.250+05:30", "latitude": 48.8566, "longitude": 2.3522, "altitude": 35,
            "horizontalAccuracy": 4, "verticalAccuracy": 2
        ]
        let location = try XCTUnwrap(try plan([point]).route.first)
        let json = WorkoutRouteCodec.encode(location, timeZone: zone)
        XCTAssertEqual(json["time"] as? String, point["time"] as? String)
        for key in ["latitude", "longitude", "altitude", "horizontalAccuracy", "verticalAccuracy"] {
            XCTAssertEqual(json[key] as? Double, (point[key] as? NSNumber)?.doubleValue, key)
        }
    }

    func testRouteClientIds() {
        XCTAssertEqual(WorkoutRouteCodec.routeClientId("run-1"), "run-1:route")
    }
}
