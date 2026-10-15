import Foundation

@objc public class CapacitorHealth: NSObject {
    @objc public func echo(_ value: String) -> String {
        print(value)
        return value
    }
}
