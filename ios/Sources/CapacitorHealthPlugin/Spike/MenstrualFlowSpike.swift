import Foundation
import HealthKit

// M0 spike (decision #25): hard-coded to menstrualFlow, deleted at the end of M0 (T10).
// swiftlint:disable force_unwrapping function_parameter_count
// Proves authorization, writes with sync identifiers, reads, anchored changes and deletes.
final class MenstrualFlowSpike {
    private let store = HKHealthStore()
    private let flowType = HKObjectType.categoryType(forIdentifier: .menstrualFlow)!

    private lazy var dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = .current
        return formatter
    }()

    func requestAuthorization(completion: @escaping ([String: Any]) -> Void) {
        let types: Set<HKSampleType> = [flowType]
        store.getRequestStatusForAuthorization(toShare: types, read: types) { before, _ in
            self.store.requestAuthorization(toShare: types, read: types) { success, error in
                self.store.getRequestStatusForAuthorization(toShare: types, read: types) { after, _ in
                    completion([
                        "requestStatusBefore": before.rawValue,
                        "success": success,
                        "error": (error?.localizedDescription as Any?) ?? NSNull(),
                        "shareStatus": self.store.authorizationStatus(for: self.flowType).rawValue,
                        "requestStatusAfter": after.rawValue
                    ])
                }
            }
        }
    }

    /// Writes one sample per local day from `startDay`, midnight to midnight, day 1 flagged as cycle start.
    func write(startDay: String, days: Int, value: Int, syncPrefix: String, version: Int, firstDayIsCycleStart: Bool,
               completion: @escaping ([String: Any]) -> Void) {
        guard let start = dayFormatter.date(from: startDay) else {
            completion(["error": "bad startDay"])
            return
        }
        let calendar = Calendar.current
        let samples: [HKCategorySample] = (0..<days).map { offset in
            let dayStart = calendar.date(byAdding: .day, value: offset, to: start)!
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
            let metadata: [String: Any] = [
                HKMetadataKeyMenstrualCycleStart: offset == 0 && firstDayIsCycleStart,
                HKMetadataKeySyncIdentifier: "\(syncPrefix):\(dayFormatter.string(from: dayStart))",
                HKMetadataKeySyncVersion: version
            ]
            return HKCategorySample(type: flowType, value: value, start: dayStart, end: dayEnd, metadata: metadata)
        }
        store.save(samples) { success, error in
            completion([
                "success": success,
                "error": (error?.localizedDescription as Any?) ?? NSNull(),
                "ids": samples.map { $0.uuid.uuidString }
            ])
        }
    }

    func read(completion: @escaping ([String: Any]) -> Void) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: flowType, predicate: nil, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [sort]) { _, samples, error in
            let list = (samples as? [HKCategorySample] ?? []).map(self.serialize)
            completion(["count": list.count, "samples": list, "error": (error?.localizedDescription as Any?) ?? NSNull()])
        }
        store.execute(query)
    }

    func changes(cursor: String?, completion: @escaping ([String: Any]) -> Void) {
        var anchor: HKQueryAnchor?
        if let cursor, let data = Data(base64Encoded: cursor) {
            anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
            if anchor == nil {
                completion(["error": "could not decode cursor"])
                return
            }
        }
        let query = HKAnchoredObjectQuery(type: flowType, predicate: nil, anchor: anchor,
                                          limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
            var next: Any = NSNull()
            if let newAnchor,
               let data = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
                next = data.base64EncodedString()
            }
            completion([
                "upserted": (samples as? [HKCategorySample] ?? []).map(self.serialize),
                "deleted": (deleted ?? []).map { object -> [String: Any] in
                    ["id": object.uuid.uuidString, "metadata": self.serializeMetadata(object.metadata)]
                },
                "nextCursor": next,
                "error": (error?.localizedDescription as Any?) ?? NSNull()
            ])
        }
        store.execute(query)
    }

    func delete(ids: [String], completion: @escaping ([String: Any]) -> Void) {
        let uuids = Set(ids.compactMap(UUID.init(uuidString:)))
        let predicate = HKQuery.predicateForObjects(with: uuids)
        store.deleteObjects(of: flowType, predicate: predicate) { success, count, error in
            completion(["success": success, "deleted": count, "error": (error?.localizedDescription as Any?) ?? NSNull()])
        }
    }

    static func rawValues() -> [String: String] {
        [
            "HKCategoryTypeIdentifierMenstrualFlow": HKCategoryTypeIdentifier.menstrualFlow.rawValue,
            "HKMetadataKeyMenstrualCycleStart": HKMetadataKeyMenstrualCycleStart,
            "HKMetadataKeySyncIdentifier": HKMetadataKeySyncIdentifier,
            "HKMetadataKeySyncVersion": HKMetadataKeySyncVersion,
            "HKMetadataKeyTimeZone": HKMetadataKeyTimeZone,
            "HKMetadataKeyWasUserEntered": HKMetadataKeyWasUserEntered,
            "HKMetadataKeyExternalUUID": HKMetadataKeyExternalUUID,
            "HKMetadataKeySexualActivityProtectionUsed": HKMetadataKeySexualActivityProtectionUsed
        ]
    }

    private func serialize(_ sample: HKCategorySample) -> [String: Any] {
        let source = sample.sourceRevision
        return [
            "id": sample.uuid.uuidString,
            "startDate": isoFormatter.string(from: sample.startDate),
            "endDate": isoFormatter.string(from: sample.endDate),
            "value": sample.value,
            "metadata": serializeMetadata(sample.metadata),
            "source": [
                "bundleId": source.source.bundleIdentifier,
                "name": source.source.name,
                "version": (source.version as Any?) ?? NSNull(),
                "productType": (source.productType as Any?) ?? NSNull(),
                "os": "\(source.operatingSystemVersion.majorVersion).\(source.operatingSystemVersion.minorVersion)"
            ],
            "device": sample.device.map { device -> [String: Any] in
                [
                    "name": (device.name as Any?) ?? NSNull(),
                    "manufacturer": (device.manufacturer as Any?) ?? NSNull(),
                    "model": (device.model as Any?) ?? NSNull()
                ]
            } ?? NSNull()
        ]
    }

    /// Stringifies every metadata value with its Objective-C class, to see exactly what HealthKit stores.
    private func serializeMetadata(_ metadata: [String: Any]?) -> [String: String] {
        (metadata ?? [:]).mapValues { value in
            "\(type(of: value)): \(value)"
        }
    }
}

// swiftlint:enable force_unwrapping function_parameter_count
