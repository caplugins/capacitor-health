import Foundation
import Capacitor

@objc(CapacitorHealthPlugin)
public class CapacitorHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorHealthPlugin"
    public let jsName = "CapacitorHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(Availability.result())
    }
}
