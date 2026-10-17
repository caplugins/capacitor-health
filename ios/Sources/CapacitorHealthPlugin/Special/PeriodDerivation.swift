import Foundation

/// Menstruation periods from flow samples (R15, 03-architecture "Menstruation period derivation",
/// decision #29). Pure, so the fixtures in `fixtures/menstruation` test it directly.
enum PeriodDerivation {
    /// A flow day more than this many days after the previous one starts a new period (one blank day allowed).
    static let maxGapDays = 2
    /// How far before a queried range to look for the start of a period that straddles it.
    static let lookBackDays = 15

    struct Flow {
        let id: String
        let start: Date
        let end: Date
        let value: String
        let isCycleStart: Bool?
        let sourceId: String
        /// The sample's `HKMetadataKeyTimeZone`, if the writer stored one.
        let timeZone: TimeZone?
    }

    /// A calendar date, ordered and subtractable through its day number.
    struct LocalDay: Hashable, Comparable {
        let year: Int, month: Int, day: Int

        private static let utc: Calendar = {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
            return calendar
        }()

        init(year: Int, month: Int, day: Int) {
            self.year = year
            self.month = month
            self.day = day
        }

        init(_ date: Date, in zone: TimeZone) {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            let parts = calendar.dateComponents([.year, .month, .day], from: date)
            self.init(year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0)
        }

        /// `2026-10-01`.
        init?(_ string: String) {
            let parts = string.prefix(10).split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            self.init(year: parts[0], month: parts[1], day: parts[2])
        }

        var number: Int {
            let date = Self.utc.date(from: DateComponents(year: year, month: month, day: day)) ?? Date(timeIntervalSince1970: 0)
            return Int((date.timeIntervalSince1970 / 86_400).rounded(.down))
        }

        var string: String { String(format: "%04d-%02d-%02d", year, month, day) }

        func adding(days: Int) -> LocalDay {
            let date = Self.utc.date(from: DateComponents(year: year, month: month, day: day + days)) ?? Date(timeIntervalSince1970: 0)
            return LocalDay(date, in: TimeZone(secondsFromGMT: 0) ?? .current)
        }

        /// `hour`:00 on this day in `zone`.
        func date(in zone: TimeZone, hour: Int = 0) -> Date {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour)) ?? Date(timeIntervalSince1970: 0)
        }

        static func < (lhs: LocalDay, rhs: LocalDay) -> Bool { lhs.number < rhs.number }
        static func - (lhs: LocalDay, rhs: LocalDay) -> Int { lhs.number - rhs.number }
    }

    struct Period {
        var firstDay: LocalDay
        var lastDay: LocalDay
        /// In day order, then start order; each sample once.
        var flows: [Flow]
        /// The zone of the first sample (its own, or the device's).
        var timeZone: TimeZone
    }

    /// The local days a sample covers: an instantaneous sample its start's day; one with a duration every
    /// day from its start through `end − 1 ms` (end-exclusive, so midnight-to-midnight doesn't spill over).
    static func days(of flow: Flow, defaultZone: TimeZone) -> [LocalDay] {
        let zone = flow.timeZone ?? defaultZone
        let first = LocalDay(flow.start, in: zone)
        guard flow.end > flow.start else { return [first] }
        let last = LocalDay(flow.end.addingTimeInterval(-0.001), in: zone)
        return (0...max(0, last - first)).map { first.adding(days: $0) }
    }

    static func derive(_ flows: [Flow], defaultZone: TimeZone) -> [Period] {
        // Each sample on each day it covers; the flag only counts on the sample's first day.
        var byDay: [LocalDay: [(flow: Flow, flag: Bool)]] = [:]
        for flow in flows where flow.value != "none" {
            for (index, day) in days(of: flow, defaultZone: defaultZone).enumerated() {
                byDay[day, default: []].append((flow, index == 0 && flow.isCycleStart == true))
            }
        }
        var periods: [Period] = []
        for day in byDay.keys.sorted() {
            let entries = (byDay[day] ?? []).sorted { $0.flow.start < $1.flow.start }
            let flagged = entries.contains { $0.flag }
            // The gap rule comes first: Apple Health writes the flag as false even on day 1 (T07).
            if var current = periods.last, day - current.lastDay <= maxGapDays, !(flagged && day != current.firstDay) {
                current.lastDay = day
                for entry in entries where !current.flows.contains(where: { $0.id == entry.flow.id }) {
                    current.flows.append(entry.flow)
                }
                periods[periods.count - 1] = current
            } else {
                let first = entries[0].flow
                var seen = Set<String>()
                let unique = entries.map(\.flow).filter { seen.insert($0.id).inserted }
                periods.append(Period(firstDay: day, lastDay: day, flows: unique, timeZone: first.timeZone ?? defaultZone))
            }
        }
        return periods
    }

    /// Periods overlapping `[start, end]`, given flows read from `lookBackDays` before `start`.
    static func periods(_ flows: [Flow], overlapping start: Date, _ end: Date, defaultZone: TimeZone) -> [Period] {
        derive(flows, defaultZone: defaultZone).filter { period in
            let periodStart = period.firstDay.date(in: period.timeZone)
            let periodEnd = period.lastDay.adding(days: 1).date(in: period.timeZone)
            return periodStart <= end && periodEnd > start
        }
    }
}
