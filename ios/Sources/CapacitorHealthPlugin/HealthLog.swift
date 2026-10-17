import Foundation

/// Logging that may contain health values, so it's off unless the app sets `debugLogging` (N1).
enum HealthLog {
    static var enabled = false

    static func debug(_ message: @autoclosure () -> String) {
        guard enabled else { return }
        print("[CapacitorHealth] \(message())")
    }
}
