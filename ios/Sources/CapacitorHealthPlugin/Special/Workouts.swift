import Foundation
import HealthKit

/// `workout` on iOS (decisions #67–#68, #70): `HKWorkout`s read through `WorkoutCodec`, written with
/// `HKWorkoutBuilder` so the totals it writes are associated with the workout, and deleted with them and their
/// routes (`WorkoutRoutes.swift`).
final class Workouts {
    static let typeId = WorkoutCodec.typeId

    let store: HKHealthStore

    init(store: HKHealthStore) {
        self.store = store
    }

    /// Types whose samples the plugin writes or deletes with a workout: active energy and every distance
    /// type this iOS has.
    static func companionTypes() -> [HKQuantityType] {
        [WorkoutCodec.energyType] + WorkoutCodec.distanceTypes()
    }

    // MARK: - Read

    /// `WorkoutSample`s for `samples`, in order; samples that aren't workouts are skipped.
    func encode(_ samples: [HKSample]) async throws -> [[String: Any]] {
        let workouts = samples.compactMap { $0 as? HKWorkout }
        let routes = try await withThrowingTaskGroup(of: (Int, Bool).self) { group in
            for (index, workout) in workouts.enumerated() {
                group.addTask { (index, try await self.hasRoute(workout)) }
            }
            var found = [Bool](repeating: false, count: workouts.count)
            for try await (index, hasRoute) in group { found[index] = hasRoute }
            return found
        }
        return zip(workouts, routes).map { WorkoutCodec.encode($0, hasRoute: $1) }
    }

    /// Whether a route is associated with `workout`. Without read access to routes HealthKit returns none.
    private func hasRoute(_ workout: HKWorkout) async throws -> Bool {
        let routes = try await store.samples(of: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: workout), limit: 1)
        return !routes.isEmpty
    }

    // MARK: - Write

    /// Builds and saves one workout with its events, activities and totals; returns it. Nothing is saved when
    /// a step fails: the builder only saves on `finishWorkout`, and the totals' write access is checked first.
    func save(_ plan: WorkoutCodec.Plan) async throws -> HKWorkout {
        try requireTotalsAccess(plan)
        try requireRouteAccess(plan)
        let builder = HKWorkoutBuilder(healthStore: store, configuration: WorkoutCodec.configuration(plan.activity), device: plan.device)
        let workout: HKWorkout?
        do {
            try await builder.beginCollection(at: plan.start)
            if !plan.totals.isEmpty { try await builder.addSamples(plan.totals) }
            if !plan.events.isEmpty { try await builder.addWorkoutEvents(plan.events) }
            if #available(iOS 16.0, *) {
                for activity in plan.activities.compactMap({ $0 as? HKWorkoutActivity }) {
                    try await builder.addWorkoutActivity(activity)
                }
            }
            if !plan.metadata.isEmpty { try await builder.addMetadata(plan.metadata) }
            try await builder.endCollection(at: plan.end)
            workout = try await builder.finishWorkout()
        } catch {
            builder.discardWorkout()
            throw error
        }
        guard let workout else { throw HealthError(.nativeError, "HealthKit didn't save the workout.") }
        try await saveRoute(plan, to: workout)
        if let clientId = plan.clientId {
            try await deleteStaleTotals(plan, clientId: clientId)
            try await deleteStaleRoute(plan, clientId: clientId)
        }
        return workout
    }

    /// Totals are samples of their own types (decision #67): without write access to them HealthKit would fail
    /// the builder halfway, with a message that doesn't say which type.
    private func requireTotalsAccess(_ plan: WorkoutCodec.Plan) throws {
        for type in Set(plan.totals.map(\.quantityType)) where store.authorizationStatus(for: type) != .sharingAuthorized {
            // The type's own id, not a combined one sharing its identifier (`totalEnergy`, `distance`).
            let typeId = Registry.entries.first { $0.identifier == type.identifier && $0.members.isEmpty }?.typeId ?? type.identifier
            throw HealthError(
                .permissionDenied,
                "Writing a workout's totals needs write access to \(typeId).",
                data: ["type": typeId]
            )
        }
    }

    /// How far either side of a re-written workout to look for its old totals.
    static let rewriteSearch: TimeInterval = 14 * 86_400

    /// After re-writing a workout with the same clientId, deletes this app's total samples of it that the new
    /// write didn't replace: a total it lacks, parts after a pause it no longer has, or a distance in another
    /// distance type (the activity changed). Totals stored with a higher version than this write stay, as
    /// HealthKit ignored the write for them too.
    private func deleteStaleTotals(_ plan: WorkoutCodec.Plan, clientId: String) async throws {
        let written = Set(plan.totals.compactMap { $0.metadata?[HKMetadataKeySyncIdentifier] as? String })
        let range = HKQuery.predicateForSamples(
            withStart: plan.start.addingTimeInterval(-Self.rewriteSearch), end: plan.end.addingTimeInterval(Self.rewriteSearch), options: []
        )
        let own = NSCompoundPredicate(andPredicateWithSubpredicates: [range, HKQuery.predicateForObjects(from: HKSource.default())])
        for type in Self.companionTypes() where store.authorizationStatus(for: type) == .sharingAuthorized {
            let total = type == WorkoutCodec.energyType ? "energy" : "distance"
            let stale = try await store.samples(of: type, predicate: own).filter { sample in
                guard let syncId = sample.metadata?[HKMetadataKeySyncIdentifier] as? String else { return false }
                let version = (sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 0
                return WorkoutCodec.isTotal(syncId, of: clientId, total: total) && !written.contains(syncId) && version <= plan.version
            }
            if !stale.isEmpty { try await store.delete(stale) }
        }
    }

    // MARK: - Delete

    /// Deletes this app's matching workouts, first with the samples it saved with them (totals, routes) where
    /// it may write those types. Returns how many workouts were deleted.
    func delete(_ options: JSONFields) async throws -> Int {
        let own = HKQuery.predicateForObjects(from: HKSource.default())
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [try Samples.deletePredicate(options), own])
        let workouts = try await store.samples(of: HKObjectType.workoutType(), predicate: predicate)
        guard !workouts.isEmpty else { return 0 }
        let companions: [HKSampleType] = Self.companionTypes() + [HKSeriesType.workoutRoute()]
        for type in companions where store.authorizationStatus(for: type) == .sharingAuthorized {
            for workout in workouts.compactMap({ $0 as? HKWorkout }) {
                _ = try await store.deleteOwnObjects(of: type, matching: HKQuery.predicateForObjects(from: workout))
            }
        }
        try await store.delete(workouts)
        return workouts.count
    }
}
