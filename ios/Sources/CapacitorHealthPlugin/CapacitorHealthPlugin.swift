import Foundation
import Capacitor
import HealthKit
import UIKit

@objc(CapacitorHealthPlugin)
public class CapacitorHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorHealthPlugin"
    public let jsName = "CapacitorHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedTypes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openHealthSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openHealthConnectInstall", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private lazy var authorization = Authorization(store: store)

    override public func load() {
        HealthLog.enabled = getConfig().getBoolean("debugLogging", false)
    }

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(Availability.result())
    }

    @objc func getSupportedTypes(_ call: CAPPluginCall) {
        call.resolve(["types": Registry.allTypeIds.map { HealthTypes.support(for: $0) }])
    }

    // MARK: - Authorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard ensureAvailable(call) else { return }
        let read = call.getArray("read", String.self) ?? []
        let write = call.getArray("write", String.self) ?? []
        call.run { try await self.authorization.request(read: read, write: write) }
    }

    @objc func checkAuthorization(_ call: CAPPluginCall) {
        guard ensureAvailable(call) else { return }
        let read = call.getArray("read", String.self) ?? []
        let write = call.getArray("write", String.self) ?? []
        call.run { try await self.authorization.check(read: read, write: write) }
    }

    // MARK: - Settings

    /// There's no deep link to an app's own HealthKit permissions; the Health app is as close as it gets.
    @objc func openHealthSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: "x-apple-health://") else { return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject(HealthError(.unavailable, "The Health app couldn't be opened."))
                }
            }
        }
    }

    @objc func openHealthConnectInstall(_ call: CAPPluginCall) {
        call.reject(HealthError(.unavailable, "Health Connect is Android only."))
    }

    // MARK: - Helpers

    private func ensureAvailable(_ call: CAPPluginCall) -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject(HealthError(.unavailable, "Health data isn't available on this device."))
            return false
        }
        return true
    }
}
