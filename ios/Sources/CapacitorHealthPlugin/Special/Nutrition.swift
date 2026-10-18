import Foundation
import HealthKit

/// `nutrition`: one `HKCorrelation` of type `food` holding a dietary quantity sample per nutrient (decision #71),
/// as blood pressure holds its two readings (#54).
enum Nutrition {
    static let typeId = "nutrition"

    /// The dietary types this iOS has, by nutrient id.
    static func nutrientTypes() -> [(id: String, type: HKQuantityType)] {
        Registry.nutrients.compactMap { id, nutrient in
            HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: nutrient.identifier)).map { (id, $0) }
        }.sorted { $0.id < $1.id }
    }

    /// HealthKit authorizes a correlation's member types, never the correlation type itself: every dietary type.
    static func memberTypes() -> [HKSampleType] { nutrientTypes().map(\.type) }

    /// Nutrient ids this iOS stores, for `getSupportedTypes()`.
    static func supportedNutrients() -> [String] { nutrientTypes().map(\.id) }

    /// The sync id of a member written with entry `clientId`.
    static func memberClientId(_ clientId: String, nutrient: String) -> String { "\(clientId)#\(nutrient)" }

    // MARK: - Read

    static func encode(_ correlation: HKCorrelation, entry: RegistryEntry) -> [String: Any] {
        var json = SampleCodec.encodeSample(correlation, entry: entry)
        if let name = correlation.metadata?[HKMetadataKeyFoodType] as? String, !name.isEmpty { json["name"] = name }
        var nutrients: [String: Double] = [:]
        var memberIds: [String] = []
        for (id, type) in nutrientTypes() {
            let unit = HKUnit(from: Registry.units[Registry.nutrients[id]?.unit ?? "g"]?.ios ?? "g")
            for sample in correlation.objects(for: type).compactMap({ $0 as? HKQuantitySample }) {
                nutrients[id, default: 0] += sample.quantity.doubleValue(for: unit)
                memberIds.append(sample.uuid.uuidString)
            }
        }
        json["nutrients"] = nutrients
        json["memberSampleIds"] = memberIds.sorted()
        // The generic sample codec's value and unit don't apply to an entry.
        json.removeValue(forKey: "value")
        json.removeValue(forKey: "unit")
        return json
    }

    // MARK: - Write

    /// The correlation for one validated `NewNutrition`: a dietary sample per nutrient, each with the entry's
    /// metadata (its name as `HKMetadataKeyFoodType` included) and, for an entry with a clientId, its own sync id
    /// `<clientId>#<nutrient>` and the same version, so HealthKit replaces (or ignores) them with the entry.
    // swiftlint:disable:next function_parameter_count
    static func correlation(
        _ fields: JSONFields, type: HKCorrelationType, start: Date, end: Date, metadata: [String: Any], device: HKDevice?
    ) throws -> HKCorrelation {
        if fields.values["mealType"] != nil {
            throw HealthError.invalidArgument(fields.field("mealType"), "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
        }
        let amounts = fields.object("nutrients") ?? [:]
        // The name goes on the members too: Apple Health shows a sample's food type in its details, and has no
        // view of the correlation itself.
        let name = fields.optionalString("name").flatMap { $0.isEmpty ? nil : $0 }
        let types = Dictionary(uniqueKeysWithValues: nutrientTypes().map { ($0.id, $0.type) })
        var objects: Set<HKSample> = []
        for id in amounts.keys.sorted() {
            let field = fields.field("nutrients.\(id)")
            guard let type = types[id], let nutrient = Registry.nutrients[id], let unit = Registry.units[nutrient.unit] else {
                throw HealthError.invalidArgument(field, "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
            }
            guard let amount = (amounts[id] as? NSNumber)?.doubleValue, amount.isFinite, amount >= 0 else {
                throw HealthError.invalidArgument(field, "must be a number from 0", reason: "outOfRange")
            }
            var memberMetadata = metadata
            if let name { memberMetadata[HKMetadataKeyFoodType] = name }
            if let clientId = metadata[HKMetadataKeySyncIdentifier] as? String {
                memberMetadata[HKMetadataKeySyncIdentifier] = memberClientId(clientId, nutrient: id)
            }
            let quantity = HKQuantity(unit: HKUnit(from: unit.ios), doubleValue: amount)
            objects.insert(HKQuantitySample(type: type, quantity: quantity, start: start, end: end, device: device, metadata: memberMetadata))
        }
        guard !objects.isEmpty else {
            throw HealthError.invalidArgument(fields.field("nutrients"), "must have at least one nutrient", reason: "required")
        }
        var entryMetadata = metadata
        if let name { entryMetadata[HKMetadataKeyFoodType] = name }
        return HKCorrelation(type: type, start: start, end: end, objects: objects, device: device, metadata: entryMetadata)
    }

    /// The member types of `correlations` this app may not share, as the plugin's type ids (`dietaryProtein`).
    /// HealthKit would fail the whole save with a message that doesn't say which.
    static func unauthorizedMembers(of correlations: [HKCorrelation], store: HKHealthStore) -> [String] {
        let types = Set(correlations.flatMap { $0.objects.map(\.sampleType) })
        return types.filter { store.authorizationStatus(for: $0) != .sharingAuthorized }.map { type in
            Registry.entries.first { $0.identifier == type.identifier && $0.members.isEmpty }?.typeId ?? type.identifier
        }.sorted()
    }
}

extension HKHealthStore {
    /// Before re-writing entries with clientIds, this app's members of their stored versions that the new
    /// versions don't hold: HealthKit replaces a correlation by its sync id but leaves the old members behind
    /// (#54), and a member with a nutrient the new version lacks has no new sample to replace it. Versions above
    /// the new one stay, as HealthKit ignores the write for them.
    func staleNutritionMembers(replacedBy correlations: [HKCorrelation], type: HKCorrelationType) async throws -> [HKSample] {
        var stale: [HKSample] = []
        for correlation in correlations {
            guard let clientId = correlation.metadata?[HKMetadataKeySyncIdentifier] as? String else { continue }
            let version = (correlation.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 1
            let kept = Set(correlation.objects.compactMap { $0.metadata?[HKMetadataKeySyncIdentifier] as? String })
            let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
                HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [clientId]),
                HKQuery.predicateForObjects(from: HKSource.default())
            ])
            for old in try await samples(of: type, predicate: predicate).compactMap({ $0 as? HKCorrelation }) {
                let oldVersion = (old.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 1
                guard oldVersion <= version else { continue }
                stale += old.objects.filter { member in
                    (member.metadata?[HKMetadataKeySyncIdentifier] as? String).map { !kept.contains($0) } ?? true
                }
            }
        }
        return stale
    }
}
