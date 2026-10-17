import Foundation
import HealthKit

/// Registry lookups with OS gating. The only way the plugin turns a unified id into a HealthKit type.
enum HealthTypes {
    /// Why a type can't be used here, in `TypeSupport.reason` terms.
    enum Unavailability: String, Error {
        case notOnPlatform, osVersion
    }

    /// The HealthKit type behind `entry`, or nil when this iOS predates it. `menstruationPeriod` resolves
    /// to `menstrualFlow`, which its registry entry names.
    static func sampleType(for entry: RegistryEntry) -> HKSampleType? {
        guard entry.isAvailable() else { return nil }
        // A correlation (bloodPressure) needs its own codec and authorizes its member types, so until that
        // exists it stays unsupported rather than reaching HealthKit as a share type.
        if entry.isCorrelation { return nil }
        if entry.isQuantity {
            return HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: entry.identifier))
        }
        return HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: entry.identifier))
    }

    /// The entry and HealthKit type for `typeId`, or why there is none.
    static func lookup(_ typeId: String, registry: [String: RegistryEntry] = Registry.byId)
        -> Result<(RegistryEntry, HKSampleType), Unavailability> {
        guard let entry = registry[typeId] else { return .failure(.notOnPlatform) }
        guard let type = sampleType(for: entry) else { return .failure(.osVersion) }
        return .success((entry, type))
    }

    /// Like `lookup`, rejecting with `UNSUPPORTED_TYPE`.
    static func resolve(_ typeId: String, registry: [String: RegistryEntry] = Registry.byId) throws -> (RegistryEntry, HKSampleType) {
        switch lookup(typeId, registry: registry) {
        case .success(let resolved): return resolved
        case .failure(let reason): throw HealthError.unsupportedType(typeId, reason: reason.rawValue)
        }
    }

    /// `resolve`, also rejecting types HealthKit doesn't let apps write.
    static func resolveWritable(_ typeId: String, registry: [String: RegistryEntry] = Registry.byId) throws -> (RegistryEntry, HKSampleType) {
        let resolved = try resolve(typeId, registry: registry)
        guard resolved.0.writable else { throw HealthError.readOnlyType(typeId) }
        return resolved
    }

    /// `TypeSupport` for one unified id (requirement R18).
    static func support(for typeId: String, registry: [String: RegistryEntry] = Registry.byId) -> [String: Any] {
        var result: [String: Any] = ["type": typeId, "aggregatable": false]
        guard let entry = registry[typeId] else {
            result.merge(["supported": false, "readable": false, "writable": false, "reason": "notOnPlatform"]) { $1 }
            return result
        }
        result["minOS"] = entry.minOS
        if let valueSet = entry.valueSet, let set = Registry.valueSets[valueSet] { result["values"] = set.values }
        if !entry.units.isEmpty { result["units"] = entry.units }
        guard sampleType(for: entry) != nil else {
            result.merge(["supported": false, "readable": false, "writable": false, "reason": "osVersion"]) { $1 }
            return result
        }
        result.merge(["supported": true, "readable": true, "writable": entry.writable]) { $1 }
        if !entry.writable { result["reason"] = "readOnly" }
        return result
    }
}
