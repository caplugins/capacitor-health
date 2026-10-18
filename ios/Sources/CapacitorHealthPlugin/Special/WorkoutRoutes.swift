import CoreLocation
import Foundation
import HealthKit

/// Workout routes on iOS (decision #70): `WorkoutRouteLocation` ⇄ `CLLocation`, without touching the health store.
enum WorkoutRouteCodec {
    /// The `clientId` of the route written with workout `clientId`, so a re-write can find the old one.
    static func routeClientId(_ clientId: String) -> String { "\(clientId):route" }

    /// `CLLocation`s for a validated `NewWorkout.route`, in time order. A point without a horizontal accuracy
    /// gets 0, since Core Location reads a negative one as an invalid point; without an altitude the vertical
    /// accuracy is -1, Core Location's "no altitude".
    static func locations(_ fields: JSONFields) throws -> [CLLocation] {
        let items = fields.values["route"] as? [[String: Any]] ?? []
        let locations = try items.enumerated().map { index, json -> CLLocation in
            let point = JSONFields(json, path: fields.field("route[\(index)]"))
            let altitude = point.optionalDouble("altitude")
            return CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: try point.double("latitude"), longitude: try point.double("longitude")),
                altitude: altitude ?? 0,
                horizontalAccuracy: point.optionalDouble("horizontalAccuracy") ?? 0,
                verticalAccuracy: altitude == nil ? -1 : point.optionalDouble("verticalAccuracy") ?? 0,
                timestamp: try point.date("time")
            )
        }
        return locations.sorted { $0.timestamp < $1.timestamp }
    }

    /// A `WorkoutRouteLocation`: altitude and accuracies only where Core Location marks them valid (0 or more).
    static func encode(_ location: CLLocation, timeZone: TimeZone) -> [String: Any] {
        var json: [String: Any] = [
            "time": DateCoding.string(from: location.timestamp, timeZone: timeZone),
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude
        ]
        if location.horizontalAccuracy >= 0 { json["horizontalAccuracy"] = location.horizontalAccuracy }
        if location.verticalAccuracy >= 0 {
            json["altitude"] = location.altitude
            json["verticalAccuracy"] = location.verticalAccuracy
        }
        return json
    }
}

extension Workouts {
    // MARK: - Route read

    /// `readWorkoutRoute`: the points of every route associated with the workout, in time order, in the
    /// workout's time zone. A route the user didn't share reads as none (HealthKit returns no routes).
    func route(_ options: JSONFields) async throws -> [String: Any] {
        let notFound = HealthError.invalidArgument("workoutId", "isn't a workout this app can read", reason: "workoutNotFound")
        guard let uuid = UUID(uuidString: try options.string("workoutId")) else { throw notFound }
        let found = try await store.samples(of: HKObjectType.workoutType(), predicate: HKQuery.predicateForObject(with: uuid), limit: 1)
        guard let workout = found.first as? HKWorkout else { throw notFound }
        let routes = try await store.samples(of: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: workout))
        var locations: [CLLocation] = []
        for route in routes.compactMap({ $0 as? HKWorkoutRoute }) { locations += try await self.locations(of: route) }
        let zone = SampleCodec.recordedTimeZone(workout) ?? .current
        HealthLog.debug("readWorkoutRoute: \(routes.count) routes, \(locations.count) points")
        return ["locations": locations.sorted { $0.timestamp < $1.timestamp }.map { WorkoutRouteCodec.encode($0, timeZone: zone) }]
    }

    /// A route's locations; HealthKit delivers them in batches.
    private func locations(of route: HKWorkoutRoute) async throws -> [CLLocation] {
        try await withCheckedThrowingContinuation { continuation in
            var all: [CLLocation] = []
            var resumed = false
            let query = HKWorkoutRouteQuery(route: route) { _, batch, done, error in
                guard !resumed else { return }
                if let error {
                    resumed = true
                    continuation.resume(throwing: error)
                    return
                }
                all += batch ?? []
                if done {
                    resumed = true
                    continuation.resume(returning: all)
                }
            }
            store.execute(query)
        }
    }

    // MARK: - Route write

    /// Writing a route needs share access to "Workout Routes", which HealthKit authorizes apart from workouts.
    func requireRouteAccess(_ plan: WorkoutCodec.Plan) throws {
        guard !plan.route.isEmpty, store.authorizationStatus(for: HKSeriesType.workoutRoute()) != .sharingAuthorized else { return }
        throw HealthError(
            .permissionDenied,
            "Writing a workout's route needs write access to workout routes.",
            data: ["type": Workouts.typeId, "reason": "routeNotAuthorized"]
        )
    }

    /// Adds the plan's route to the saved `workout`. If that fails the workout and its totals are deleted again,
    /// so a write saves all of it or nothing.
    func saveRoute(_ plan: WorkoutCodec.Plan, to workout: HKWorkout) async throws {
        guard !plan.route.isEmpty else { return }
        do {
            let builder = HKWorkoutRouteBuilder(healthStore: store, device: plan.device)
            try await builder.insertRouteData(plan.route)
            var metadata: [String: Any] = [:]
            if let clientId = plan.clientId {
                metadata[HKMetadataKeySyncIdentifier] = WorkoutRouteCodec.routeClientId(clientId)
                metadata[HKMetadataKeySyncVersion] = NSNumber(value: plan.version)
            }
            _ = try await builder.finishRoute(with: workout, metadata: metadata)
        } catch {
            for type in Self.companionTypes() where store.authorizationStatus(for: type) == .sharingAuthorized {
                _ = try? await store.deleteOwnObjects(of: type, matching: HKQuery.predicateForObjects(from: workout))
            }
            try? await store.delete([workout])
            throw error
        }
    }

    /// After re-writing a workout with a clientId, deletes this app's old route of it when the new version has
    /// none (one it has replaces the old by sync identifier). Routes stored with a higher version stay.
    func deleteStaleRoute(_ plan: WorkoutCodec.Plan, clientId: String) async throws {
        let type = HKSeriesType.workoutRoute()
        guard plan.route.isEmpty, store.authorizationStatus(for: type) == .sharingAuthorized else { return }
        let range = HKQuery.predicateForSamples(
            withStart: plan.start.addingTimeInterval(-Self.rewriteSearch), end: plan.end.addingTimeInterval(Self.rewriteSearch), options: []
        )
        let own = NSCompoundPredicate(andPredicateWithSubpredicates: [range, HKQuery.predicateForObjects(from: HKSource.default())])
        let syncId = WorkoutRouteCodec.routeClientId(clientId)
        let stale = try await store.samples(of: type, predicate: own).filter { route in
            let version = (route.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 0
            return route.metadata?[HKMetadataKeySyncIdentifier] as? String == syncId && version <= plan.version
        }
        if !stale.isEmpty { try await store.delete(stale) }
    }
}
