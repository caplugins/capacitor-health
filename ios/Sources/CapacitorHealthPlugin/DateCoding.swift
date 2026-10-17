import Foundation

/// Dates cross the bridge as `yyyy-MM-dd'T'HH:mm:ss.SSS±HH:MM` both ways (decision #38): the TypeScript
/// layer normalizes what apps pass, and the plugin writes the same shape back.
enum DateCoding {
    private static let format = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
    private static let lock = NSLock()
    private static var formatters: [String: DateFormatter] = [:]

    private static func formatter(for timeZone: TimeZone) -> DateFormatter {
        lock.lock()
        defer { lock.unlock() }
        if let formatter = formatters[timeZone.identifier] { return formatter }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        formatters[timeZone.identifier] = formatter
        return formatter
    }

    private static let fallback: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Parses the canonical format, or plain ISO 8601 with an offset.
    static func date(from string: String) -> Date? {
        formatter(for: TimeZone(secondsFromGMT: 0) ?? .current).date(from: string) ?? fallback.date(from: string)
    }

    static func string(from date: Date, timeZone: TimeZone = .current) -> String {
        formatter(for: timeZone).string(from: date)
    }

    /// `+05:30` for 19800 seconds.
    static func offsetString(seconds: Int) -> String {
        let sign = seconds < 0 ? "-" : "+"
        let minutes = abs(seconds) / 60
        return String(format: "%@%02d:%02d", sign, minutes / 60, minutes % 60)
    }

    /// The offset a canonical date string was written in, e.g. 19800 for `…+05:30`.
    static func offsetSeconds(of string: String) -> Int? {
        if string.hasSuffix("Z") { return 0 }
        let suffix = string.suffix(6)
        guard suffix.count == 6, let sign = suffix.first, sign == "+" || sign == "-",
              let hours = Int(suffix.dropFirst().prefix(2)), let minutes = Int(suffix.suffix(2)) else { return nil }
        return (sign == "-" ? -1 : 1) * (hours * 3600 + minutes * 60)
    }

    /// Parses a required date argument.
    static func required(_ value: String?, field: String) throws -> Date {
        guard let value, let date = date(from: value) else {
            throw HealthError.invalidArgument(field, "must be an ISO 8601 date-time with an offset")
        }
        return date
    }
}
