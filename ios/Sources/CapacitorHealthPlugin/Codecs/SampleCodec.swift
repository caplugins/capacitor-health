import Foundation
import HealthKit

/// HealthKit sample ⇄ bridge JSON for the generic quantity, category and event types.
enum SampleCodec {
    /// Metadata keys the unified shape already carries; everything else goes to `hk.` metadata.
    private static let consumedKeys: Set<String> = [
        HKMetadataKeySyncIdentifier, HKMetadataKeySyncVersion, HKMetadataKeyTimeZone, HKMetadataKeyWasUserEntered
    ]

    // MARK: - Units

    /// The registry's definition of a unit id. Callers pass ids from a type's `units`, which the registry
    /// check keeps inside the unit table.
    private static func definition(_ unit: String) -> RegistryUnit { Registry.units[unit] ?? RegistryUnit(unit) }

    static func hkUnit(_ unit: String) -> HKUnit { HKUnit(from: definition(unit).ios) }

    /// HealthKit stores percentages as 0–1; the bridge uses 0–100 (decision #15).
    static func bridgeValue(_ quantity: HKQuantity, unit: String) -> Double {
        let value = quantity.doubleValue(for: hkUnit(unit))
        return definition(unit).percent ? value * 100 : value
    }

    static func quantity(_ value: Double, unit: String) -> HKQuantity {
        HKQuantity(unit: hkUnit(unit), doubleValue: definition(unit).percent ? value / 100 : value)
    }

    // MARK: - Values

    static func unifiedValue(raw: Int, valueSet: String?) -> String {
        guard let valueSet, let set = Registry.valueSets[valueSet] else { return String(raw) }
        // A raw value newer than the registry reads as its number; `native.value` carries it too.
        return set.rawValues.first { $0.value == raw }?.key ?? String(raw)
    }

    static func rawValue(_ value: String, valueSet: String, field: String) throws -> Int {
        guard let raw = Registry.valueSets[valueSet]?.rawValues[value] else {
            throw HealthError.invalidArgument(field, "can't be stored on iOS", reason: "valueUnsupportedOnPlatform")
        }
        return raw
    }

    // MARK: - Read

    /// The time zone the writer recorded, if it stored a valid `HKMetadataKeyTimeZone`.
    static func recordedTimeZone(_ sample: HKSample) -> TimeZone? {
        (sample.metadata?[HKMetadataKeyTimeZone] as? String).flatMap(TimeZone.init(identifier:))
    }

    /// Fields every sample shares (`SampleBase`), for `typeId`.
    static func encodeBase(_ sample: HKSample, typeId: String, kind: String) -> [String: Any] {
        let zone = recordedTimeZone(sample)
        let metadata = sample.metadata ?? [:]
        var json: [String: Any] = [
            "id": sample.uuid.uuidString,
            "type": typeId,
            "kind": kind,
            "startDate": DateCoding.string(from: sample.startDate, timeZone: zone ?? .current),
            "endDate": DateCoding.string(from: sample.endDate, timeZone: zone ?? .current),
            "source": source(sample.sourceRevision),
            "recordingMethod": (metadata[HKMetadataKeyWasUserEntered] as? NSNumber)?.boolValue == true ? "manual" : "unknown",
            "native": ["type": sample.sampleType.identifier],
            "platform": "ios"
        ]
        if let zone { json["zoneOffset"] = DateCoding.offsetString(seconds: zone.secondsFromGMT(for: sample.startDate)) }
        if let device = sample.device.map(encodeDevice), !device.isEmpty { json["device"] = device }
        if let clientId = metadata[HKMetadataKeySyncIdentifier] as? String {
            json["clientId"] = clientId
            if let version = metadata[HKMetadataKeySyncVersion] as? NSNumber { json["clientVersion"] = version.intValue }
        }
        return json
    }

    static func encode(_ sample: HKSample, entry: RegistryEntry, unit: String? = nil) -> [String: Any] {
        if let correlation = sample as? HKCorrelation { return BloodPressure.encode(correlation, entry: entry) }
        return encodeSample(sample, entry: entry, unit: unit)
    }

    /// `encode` for anything that isn't a correlation; correlations build on it.
    static func encodeSample(_ sample: HKSample, entry: RegistryEntry, unit: String? = nil) -> [String: Any] {
        var json = encodeBase(sample, typeId: entry.typeId, kind: kindName(entry.kind))
        var native: [String: Any] = ["type": sample.sampleType.identifier]
        var extra: [String: Any] = [:]
        if let quantitySample = sample as? HKQuantitySample, let canonical = entry.unit {
            let unit = unit.flatMap { entry.units.contains($0) ? $0 : nil } ?? canonical
            json["value"] = bridgeValue(quantitySample.quantity, unit: unit)
            json["unit"] = unit
            // A series sample (several values in one object) reads as one sample: HealthKit's sum or mean.
            if quantitySample.count > 1 { extra["hk.count"] = quantitySample.count }
        } else if let categorySample = sample as? HKCategorySample, entry.kind == .category {
            // Passthrough ids keep HealthKit's raw value (decision #59).
            json["value"] = entry.isPassthrough ? categorySample.value : unifiedValue(raw: categorySample.value, valueSet: entry.valueSet)
            native["value"] = categorySample.value
        }
        json["native"] = native

        let metadata = sample.metadata ?? [:]
        for field in entry.fields {
            guard let number = metadata[field.key] as? NSNumber else { continue }
            switch field.type {
            case .boolean: json[field.name] = number.boolValue
            case .enumeration: json[field.name] = unifiedValue(raw: number.intValue, valueSet: field.valueSet)
            }
        }
        extra.merge(extraMetadata(sample, consumed: Set(entry.fields.map(\.key)))) { $1 }
        if !extra.isEmpty { json["metadata"] = extra }
        return json
    }

    /// The sample's metadata the unified shape doesn't carry, as `hk.` keys, with its source's product type and
    /// version. `consumed` names further keys the caller encoded itself.
    static func extraMetadata(_ sample: HKSample, consumed: Set<String>) -> [String: Any] {
        var extra: [String: Any] = [:]
        for (key, value) in sample.metadata ?? [:] where !consumedKeys.contains(key) && !consumed.contains(key) {
            extra["hk.\(key)"] = MetadataValue.bridge(value)
        }
        if let productType = sample.sourceRevision.productType { extra["hk.productType"] = productType }
        if let version = sample.sourceRevision.version { extra["hk.sourceVersion"] = version }
        return extra
    }

    static func kindName(_ kind: RegistryKind) -> String {
        switch kind {
        case .quantity: return "quantity"
        case .category: return "category"
        case .event: return "event"
        case .special: return "special"
        }
    }

    private static func source(_ revision: HKSourceRevision) -> [String: Any] {
        ["id": revision.source.bundleIdentifier, "name": revision.source.name]
    }

    private static func encodeDevice(_ device: HKDevice) -> [String: Any] {
        var json: [String: Any] = [:]
        json["name"] = device.name
        json["manufacturer"] = device.manufacturer
        json["model"] = device.model
        json["hardwareVersion"] = device.hardwareVersion
        json["softwareVersion"] = device.softwareVersion
        return json
    }

    // MARK: - Write

    /// Metadata and device every new sample shares (`NewSampleBase`).
    static func baseMetadata(_ fields: JSONFields) throws -> [String: Any] {
        var metadata: [String: Any] = [:]
        if let clientId = fields.optionalString("clientId") {
            metadata[HKMetadataKeySyncIdentifier] = clientId
            // HealthKit requires a version with every sync identifier.
            metadata[HKMetadataKeySyncVersion] = NSNumber(value: fields.optionalInt("clientVersion") ?? 1)
        }
        if fields.optionalString("recordingMethod") == "manual" { metadata[HKMetadataKeyWasUserEntered] = true }
        if let zone = fields.optionalString("timeZone") {
            guard TimeZone(identifier: zone) != nil else {
                throw HealthError.invalidArgument(fields.field("timeZone"), "must be an IANA time zone")
            }
            metadata[HKMetadataKeyTimeZone] = zone
        }
        return metadata
    }

    static func device(_ fields: JSONFields) -> HKDevice? {
        guard let json = fields.object("device") else { return nil }
        return HKDevice(
            name: json["name"] as? String,
            manufacturer: json["manufacturer"] as? String,
            model: json["model"] as? String,
            hardwareVersion: json["hardwareVersion"] as? String,
            firmwareVersion: nil,
            softwareVersion: json["softwareVersion"] as? String,
            localIdentifier: nil,
            udiDeviceIdentifier: nil
        )
    }

    /// Builds the HealthKit sample for one validated `NewSample` of a generic type.
    static func decode(_ fields: JSONFields, entry: RegistryEntry, type: HKSampleType) throws -> HKSample {
        let start = try fields.date("startDate")
        let end = fields.optionalString("endDate") == nil ? start : try fields.date("endDate")
        guard end >= start else { throw HealthError.invalidArgument(fields.field("endDate"), "must not be before startDate") }
        if entry.instantOnly && end != start {
            throw HealthError.invalidArgument(fields.field("endDate"), "must equal startDate", reason: "instantOnly")
        }
        if entry.intervalOnly && end.timeIntervalSince(start) < 1 {
            throw HealthError.invalidArgument(fields.field("endDate"), "must be at least a second after startDate", reason: "intervalOnly")
        }
        var metadata = try baseMetadata(fields)
        try metadata.merge(fieldMetadata(fields, entry: entry)) { $1 }
        return try sample(fields, entry: entry, type: type, start: start, end: end, metadata: metadata)
    }

    /// The registry's typed fields (decision #20) as HealthKit metadata.
    private static func fieldMetadata(_ fields: JSONFields, entry: RegistryEntry) throws -> [String: Any] {
        var metadata: [String: Any] = [:]
        for field in entry.fields {
            switch field.type {
            case .boolean:
                if let value = fields.optionalBool(field.name) {
                    metadata[field.key] = NSNumber(value: value)
                } else if field.requiredOnWrite {
                    metadata[field.key] = NSNumber(value: false)
                }
            case .enumeration:
                if let value = fields.optionalString(field.name), let valueSet = field.valueSet {
                    metadata[field.key] = NSNumber(value: try rawValue(value, valueSet: valueSet, field: fields.field(field.name)))
                } else if field.requiredOnWrite {
                    // HealthKit rejects the save without it (insulinDelivery's reason).
                    throw HealthError.invalidArgument(fields.field(field.name), "is required on iOS", reason: "required")
                }
            }
        }
        return metadata
    }

    // swiftlint:disable:next function_parameter_count
    private static func sample(
        _ fields: JSONFields, entry: RegistryEntry, type: HKSampleType, start: Date, end: Date, metadata: [String: Any]
    ) throws -> HKSample {
        let device = device(fields)
        switch entry.kind {
        case .quantity:
            guard let quantityType = type as? HKQuantityType, let canonical = entry.unit else { break }
            let unit = fields.optionalString("unit") ?? canonical
            guard entry.units.contains(unit) else { throw HealthError.invalidArgument(fields.field("unit"), "isn't a unit of \(entry.typeId)") }
            let quantity = quantity(try fields.double("value"), unit: unit)
            // HealthKit raises an exception for values outside its range, which would crash the app.
            if let range = entry.range, !range.contains(bridgeValue(quantity, unit: canonical)) {
                throw HealthError.invalidArgument(
                    fields.field("value"), "must be from \(range.lowerBound) to \(range.upperBound) \(canonical)", reason: "outOfRange"
                )
            }
            return HKQuantitySample(type: quantityType, quantity: quantity, start: start, end: end, device: device, metadata: metadata)
        case .category where entry.isPassthrough:
            guard let categoryType = type as? HKCategoryType else { break }
            // HealthKit raises an exception for a value outside the category's enum.
            let raw = fields.optionalInt("value") ?? 0
            guard Registry.passthroughCategories[entry.identifier]?.contains(raw) == true else {
                throw HealthError.invalidArgument(fields.field("value"), "isn't a value HealthKit accepts here", reason: "valueUnsupportedOnPlatform")
            }
            return HKCategorySample(type: categoryType, value: raw, start: start, end: end, device: device, metadata: metadata)
        case .category:
            guard let categoryType = type as? HKCategoryType, let valueSet = entry.valueSet else { break }
            let raw = try rawValue(try fields.string("value"), valueSet: valueSet, field: fields.field("value"))
            return HKCategorySample(type: categoryType, value: raw, start: start, end: end, device: device, metadata: metadata)
        case .event:
            guard let categoryType = type as? HKCategoryType else { break }
            let raw = HKCategoryValue.notApplicable.rawValue
            return HKCategorySample(type: categoryType, value: raw, start: start, end: end, device: device, metadata: metadata)
        case .special:
            guard let correlationType = type as? HKCorrelationType else { break }
            return try BloodPressure.correlation(fields, type: correlationType, start: start, end: end, metadata: metadata, device: device)
        }
        throw HealthError(.nativeError, "\(entry.typeId) has no generic codec.")
    }
}
