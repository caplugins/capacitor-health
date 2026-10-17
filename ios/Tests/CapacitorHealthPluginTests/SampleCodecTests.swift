import HealthKit
import XCTest
@testable import CapacitorHealthPlugin

final class SampleCodecTests: XCTestCase {
    private func decode(_ json: [String: Any]) throws -> HKSample {
        let typeId = try XCTUnwrap(json["type"] as? String)
        let (entry, type) = try HealthTypes.resolveWritable(typeId)
        return try SampleCodec.decode(JSONFields(json, path: "samples[0]"), entry: entry, type: type)
    }

    private func roundTrip(_ json: [String: Any], unit: String? = nil) throws -> [String: Any] {
        let sample = try decode(json)
        let entry = try XCTUnwrap(Registry.byId[json["type"] as? String ?? ""])
        return SampleCodec.encode(sample, entry: entry, unit: unit)
    }

    private let noon = "2026-10-01T12:00:00.000+05:30"

    func testCategorySampleDefaultsTheCycleStartFlag() throws {
        let sample = try XCTUnwrap(try decode(["type": "menstrualFlow", "startDate": noon, "value": "light"]) as? HKCategorySample)
        XCTAssertEqual(sample.value, 2)
        XCTAssertEqual(sample.startDate, sample.endDate)
        XCTAssertEqual(sample.metadata?[HKMetadataKeyMenstrualCycleStart] as? NSNumber, false)
    }

    func testCategoryRoundTrip() throws {
        let json = try roundTrip([
            "type": "menstrualFlow", "startDate": noon, "value": "heavy", "isCycleStart": true,
            "clientId": "p1:2026-10-01", "clientVersion": 3, "recordingMethod": "manual"
        ])
        XCTAssertEqual(json["kind"] as? String, "category")
        XCTAssertEqual(json["value"] as? String, "heavy")
        XCTAssertEqual(json["isCycleStart"] as? Bool, true)
        XCTAssertEqual(json["clientId"] as? String, "p1:2026-10-01")
        XCTAssertEqual(json["clientVersion"] as? Int, 3)
        XCTAssertEqual(json["recordingMethod"] as? String, "manual")
        XCTAssertEqual((json["native"] as? [String: Any])?["value"] as? Int, 4)
        XCTAssertEqual((json["native"] as? [String: Any])?["type"] as? String, "HKCategoryTypeIdentifierMenstrualFlow")
        XCTAssertEqual(json["platform"] as? String, "ios")
    }

    func testClientIdGetsVersionOne() throws {
        let sample = try decode(["type": "ovulationTest", "startDate": noon, "value": "lhSurge", "clientId": "o1"])
        XCTAssertEqual(sample.metadata?[HKMetadataKeySyncIdentifier] as? String, "o1")
        XCTAssertEqual(sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber, 1)
        XCTAssertEqual((sample as? HKCategorySample)?.value, 2)
    }

    func testTimeZoneSetsTheZoneAndOffset() throws {
        let json = try roundTrip(["type": "acne", "startDate": "2026-10-01T06:30:00.000+00:00", "value": "mild", "timeZone": "Asia/Kolkata"])
        XCTAssertEqual(json["startDate"] as? String, "2026-10-01T12:00:00.000+05:30")
        XCTAssertEqual(json["zoneOffset"] as? String, "+05:30")
        XCTAssertNil(json["metadata"].flatMap { ($0 as? [String: Any])?["hk.HKTimeZone"] })
    }

    func testQuantityConvertsUnits() throws {
        let sample = try XCTUnwrap(try decode([
            "type": "basalBodyTemperature", "startDate": noon, "value": 98.6, "unit": "degF", "measurementLocation": "mouth"
        ]) as? HKQuantitySample)
        XCTAssertEqual(sample.quantity.doubleValue(for: .degreeCelsius()), 37, accuracy: 0.0001)
        XCTAssertEqual(sample.metadata?[HKMetadataKeyBodyTemperatureSensorLocation] as? NSNumber, 6)

        let entry = try XCTUnwrap(Registry.byId["basalBodyTemperature"])
        let celsius = SampleCodec.encode(sample, entry: entry)
        XCTAssertEqual(celsius["value"] as? Double ?? 0, 37, accuracy: 0.0001)
        XCTAssertEqual(celsius["unit"] as? String, "degC")
        XCTAssertEqual(celsius["measurementLocation"] as? String, "mouth")
        XCTAssertEqual(SampleCodec.encode(sample, entry: entry, unit: "degF")["value"] as? Double ?? 0, 98.6, accuracy: 0.0001)
    }

    func testEventSample() throws {
        let sample = try XCTUnwrap(try decode([
            "type": "sexualActivity", "startDate": noon, "endDate": "2026-10-01T12:30:00.000+05:30", "protectionUsed": false
        ]) as? HKCategorySample)
        XCTAssertEqual(sample.value, HKCategoryValue.notApplicable.rawValue)
        XCTAssertEqual(sample.metadata?[HKMetadataKeySexualActivityProtectionUsed] as? NSNumber, false)
        let json = SampleCodec.encode(sample, entry: try XCTUnwrap(Registry.byId["sexualActivity"]))
        XCTAssertEqual(json["kind"] as? String, "event")
        XCTAssertNil(json["value"])
        XCTAssertEqual(json["protectionUsed"] as? Bool, false)
    }

    func testDeviceRoundTrip() throws {
        let json = try roundTrip([
            "type": "basalBodyTemperature", "startDate": noon, "value": 36.5,
            "device": ["manufacturer": "Acme", "model": "T1", "name": "Thermo"]
        ])
        let device = try XCTUnwrap(json["device"] as? [String: Any])
        XCTAssertEqual(device["manufacturer"] as? String, "Acme")
        XCTAssertEqual(device["model"] as? String, "T1")
        XCTAssertEqual(device["name"] as? String, "Thermo")
    }

    func testRejectsValuesHealthKitCantStore() {
        XCTAssertThrowsError(try decode(["type": "cervicalMucus", "startDate": noon, "value": "unusual"])) { error in
            let error = HealthError.from(error)
            XCTAssertEqual(error.code, .invalidArgument)
            XCTAssertEqual(error.data["reason"] as? String, "valueUnsupportedOnPlatform")
            XCTAssertEqual(error.data["field"] as? String, "samples[0].value")
        }
    }

    func testRejectsBadUnitsAndDates() {
        XCTAssertThrowsError(try decode(["type": "basalBodyTemperature", "startDate": noon, "value": 36.5, "unit": "K"]))
        XCTAssertThrowsError(try decode(["type": "acne", "startDate": "yesterday", "value": "mild"])) { error in
            XCTAssertEqual(HealthError.from(error).data["field"] as? String, "samples[0].startDate")
        }
        XCTAssertThrowsError(try decode(["type": "pregnancy", "startDate": noon, "endDate": "2026-10-01T11:00:00.000+05:30"]))
    }

    func testMenopausalStateIsInstantOnly() throws {
        guard #available(iOS 27.0, *) else { throw XCTSkip("needs iOS 27") }
        XCTAssertThrowsError(try decode([
            "type": "menopausalState", "startDate": noon, "endDate": "2026-10-02T12:00:00.000+05:30", "value": "menopause"
        ])) { error in
            XCTAssertEqual(HealthError.from(error).data["reason"] as? String, "instantOnly")
        }
    }

    func testPercentIsZeroToHundredOnTheBridge() {
        let quantity = SampleCodec.quantity(97, unit: "%")
        XCTAssertEqual(quantity.doubleValue(for: .percent()), 0.97, accuracy: 0.000001)
        XCTAssertEqual(SampleCodec.bridgeValue(quantity, unit: "%"), 97, accuracy: 0.000001)
    }

    func testUnknownRawValuesReadAsNumbers() {
        XCTAssertEqual(SampleCodec.unifiedValue(raw: 99, valueSet: "bleeding"), "99")
        XCTAssertEqual(SampleCodec.unifiedValue(raw: 5, valueSet: "bleeding"), "none")
    }

    func testMetadataValuesBridge() {
        XCTAssertEqual(MetadataValue.bridge(NSNumber(value: true)) as? Bool, true)
        XCTAssertEqual(MetadataValue.bridge(NSNumber(value: 1)) as? Double, 1)
        XCTAssertEqual(MetadataValue.bridge("x") as? String, "x")
    }
}
