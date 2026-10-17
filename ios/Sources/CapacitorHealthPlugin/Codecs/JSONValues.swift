import Foundation

/// Typed access to bridge arguments. The TypeScript layer validates first (decision #23); these only
/// guard against malformed input and name the field when it is.
struct JSONFields {
    let values: [String: Any]
    /// Path prefix for error messages, e.g. `samples[2]`.
    let path: String

    init(_ values: [String: Any], path: String) {
        self.values = values
        self.path = path
    }

    func field(_ key: String) -> String { path.isEmpty ? key : "\(path).\(key)" }

    func optionalString(_ key: String) -> String? { values[key] as? String }

    func string(_ key: String) throws -> String {
        guard let value = optionalString(key), !value.isEmpty else {
            throw HealthError.invalidArgument(field(key), "must be a non-empty string")
        }
        return value
    }

    func optionalDouble(_ key: String) -> Double? {
        if let number = values[key] as? NSNumber { return number.doubleValue }
        return values[key] as? Double
    }

    func double(_ key: String) throws -> Double {
        guard let value = optionalDouble(key), value.isFinite else {
            throw HealthError.invalidArgument(field(key), "must be a finite number")
        }
        return value
    }

    func optionalInt(_ key: String) -> Int? { (values[key] as? NSNumber)?.intValue ?? values[key] as? Int }

    func optionalBool(_ key: String) -> Bool? { values[key] as? Bool }

    func date(_ key: String) throws -> Date { try DateCoding.required(optionalString(key), field: field(key)) }

    func object(_ key: String) -> [String: Any]? { values[key] as? [String: Any] }

    func strings(_ key: String) -> [String]? { values[key] as? [String] }
}

/// Values HealthKit metadata can hold, as bridge values (`hk.` metadata, decision #20).
enum MetadataValue {
    static func bridge(_ value: Any) -> Any? {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            // HealthKit stores booleans as plain numbers (T06 S6), so only a real CFBoolean reads as Bool.
            return CFGetTypeID(number) == CFBooleanGetTypeID() ? number.boolValue : number.doubleValue
        case let date as Date:
            return DateCoding.string(from: date)
        default:
            return String(describing: value)
        }
    }
}
