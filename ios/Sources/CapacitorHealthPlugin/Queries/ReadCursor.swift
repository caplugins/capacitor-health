import Foundation

/// `readSamples` paging. HealthKit queries have no offset, so a cursor holds the start date of the last
/// sample returned and how many samples with exactly that start date were already returned; the next
/// page starts at that date and skips them. Opaque to apps: base64 JSON.
struct ReadCursor: Codable, Equatable {
    var version = 1
    let typeId: String
    /// `timeIntervalSinceReferenceDate` of the last sample's start, exact (JSON round-trips doubles).
    let start: Double
    let skip: Int

    enum CodingKeys: String, CodingKey {
        case version = "v", typeId = "t", start = "s", skip = "k"
    }

    var startDate: Date { Date(timeIntervalSinceReferenceDate: start) }

    init(typeId: String, startDate: Date, skip: Int) {
        self.typeId = typeId
        self.start = startDate.timeIntervalSinceReferenceDate
        self.skip = skip
    }

    func encoded() -> String {
        ((try? JSONEncoder().encode(self)) ?? Data()).base64EncodedString()
    }

    static func decode(_ string: String, typeId: String) throws -> ReadCursor {
        guard let data = Data(base64Encoded: string),
              let cursor = try? JSONDecoder().decode(ReadCursor.self, from: data),
              cursor.version == 1, cursor.skip >= 0 else {
            throw HealthError.invalidArgument("cursor", "isn't a readSamples cursor")
        }
        guard cursor.typeId == typeId else {
            throw HealthError.invalidArgument("cursor", "belongs to another type", reason: "cursorMismatch")
        }
        return cursor
    }

    /// The cursor after a page whose items have the given start dates (in query order), or nil when
    /// the page was the last. `previous` is the cursor the page was read with.
    static func next(typeId: String, pageStarts: [Date], hasMore: Bool, previous: ReadCursor?) -> ReadCursor? {
        guard hasMore, let last = pageStarts.last else { return nil }
        let tied = pageStarts.reversed().prefix { $0 == last }.count
        // Only when the whole page tied with the previous cursor's date are earlier ties still ahead of it.
        let carried = previous.map { $0.startDate == last ? $0.skip : 0 } ?? 0
        return ReadCursor(typeId: typeId, startDate: last, skip: tied + carried)
    }
}
