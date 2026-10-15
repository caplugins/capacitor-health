import HealthKit

/// Maps HealthKit availability to the plugin's `AvailabilityResult`.
enum Availability {
    static func result(isHealthDataAvailable: Bool = HKHealthStore.isHealthDataAvailable()) -> [String: Any] {
        [
            "available": isHealthDataAvailable,
            "status": isHealthDataAvailable ? "available" : "notSupported"
        ]
    }
}
