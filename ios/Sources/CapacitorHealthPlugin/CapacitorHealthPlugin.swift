import Foundation
import Capacitor

@objc(CapacitorHealthPlugin)
public class CapacitorHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorHealthPlugin"
    public let jsName = "CapacitorHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        // M0 spike, removed in T10.
        CAPPluginMethod(name: "spikeRequestAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spikeWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spikeRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spikeChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spikeDelete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spikeRawValues", returnType: CAPPluginReturnPromise)
    ]

    private lazy var spike = MenstrualFlowSpike()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(Availability.result())
    }

    // MARK: - M0 spike (removed in T10)

    @objc func spikeRequestAuth(_ call: CAPPluginCall) {
        spike.requestAuthorization { call.resolve($0) }
    }

    @objc func spikeWrite(_ call: CAPPluginCall) {
        spike.write(
            startDay: call.getString("startDay") ?? "",
            days: call.getInt("days") ?? 5,
            value: call.getInt("value") ?? 3,
            syncPrefix: call.getString("syncPrefix") ?? "spike",
            version: call.getInt("version") ?? 1,
            firstDayIsCycleStart: call.getBool("firstDayIsCycleStart") ?? true
        ) { call.resolve($0) }
    }

    @objc func spikeRead(_ call: CAPPluginCall) {
        spike.read { call.resolve($0) }
    }

    @objc func spikeChanges(_ call: CAPPluginCall) {
        spike.changes(cursor: call.getString("cursor")) { call.resolve($0) }
    }

    @objc func spikeDelete(_ call: CAPPluginCall) {
        spike.delete(ids: call.getArray("ids", String.self) ?? []) { call.resolve($0) }
    }

    @objc func spikeRawValues(_ call: CAPPluginCall) {
        call.resolve(MenstrualFlowSpike.rawValues())
    }
}
