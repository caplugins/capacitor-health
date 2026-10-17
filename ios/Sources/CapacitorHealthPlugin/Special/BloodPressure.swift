import Foundation
import HealthKit

/// `bloodPressure`: one `HKCorrelation` holding a systolic and a diastolic sample (decision #54).
enum BloodPressure {
    static let systolicType = HKQuantityType(.bloodPressureSystolic)
    static let diastolicType = HKQuantityType(.bloodPressureDiastolic)
    /// HealthKit authorizes a correlation's member types, never the correlation type itself.
    static let memberTypes: [HKSampleType] = [systolicType, diastolicType]
    private static let unit = HKUnit.millimeterOfMercury()

    static func encode(_ correlation: HKCorrelation, entry: RegistryEntry) -> [String: Any] {
        var json = SampleCodec.encodeSample(correlation, entry: entry)
        json["systolic"] = value(of: systolicType, in: correlation)
        json["diastolic"] = value(of: diastolicType, in: correlation)
        json["unit"] = "mmHg"
        return json
    }

    private static func value(of type: HKQuantityType, in correlation: HKCorrelation) -> Double? {
        (correlation.objects(for: type).first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
    }

    /// The correlation for one validated `NewBloodPressureSample`. HealthKit upserts a correlation by its sync
    /// identifier but leaves the replaced correlation's members behind, so each member gets its own,
    /// `<clientId>#systolic` / `#diastolic`, and is replaced (or ignored, for a lower version) with it.
    // swiftlint:disable:next function_parameter_count
    static func correlation(
        _ fields: JSONFields, type: HKCorrelationType, start: Date, end: Date, metadata: [String: Any], device: HKDevice?
    ) throws -> HKCorrelation {
        if let unit = fields.optionalString("unit"), unit != "mmHg" {
            throw HealthError.invalidArgument(fields.field("unit"), "isn't a unit of bloodPressure")
        }
        func member(_ type: HKQuantityType, _ field: String) throws -> HKSample {
            var memberMetadata = metadata
            if let clientId = metadata[HKMetadataKeySyncIdentifier] as? String {
                memberMetadata[HKMetadataKeySyncIdentifier] = "\(clientId)#\(field)"
            }
            let quantity = HKQuantity(unit: unit, doubleValue: try fields.double(field))
            return HKQuantitySample(type: type, quantity: quantity, start: start, end: end, device: device, metadata: memberMetadata)
        }
        let objects: Set<HKSample> = [try member(systolicType, "systolic"), try member(diastolicType, "diastolic")]
        return HKCorrelation(type: type, start: start, end: end, objects: objects, device: device, metadata: metadata)
    }
}
