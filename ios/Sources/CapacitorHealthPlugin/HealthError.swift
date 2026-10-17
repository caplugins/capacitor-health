import Foundation
import HealthKit
import Capacitor

/// A rejection with one of the stable codes of requirement R17. Messages never contain health values.
struct HealthError: Error {
    enum Code: String {
        case unavailable = "UNAVAILABLE"
        case missingDeclaration = "MISSING_DECLARATION"
        case permissionDenied = "PERMISSION_DENIED"
        case unsupportedType = "UNSUPPORTED_TYPE"
        case readOnlyType = "READ_ONLY_TYPE"
        case invalidArgument = "INVALID_ARGUMENT"
        case cursorExpired = "CURSOR_EXPIRED"
        case deviceLocked = "DEVICE_LOCKED"
        case nativeError = "NATIVE_ERROR"
    }

    let code: Code
    let message: String
    var data: [String: Any] = [:]

    init(_ code: Code, _ message: String, data: [String: Any] = [:]) {
        self.code = code
        self.message = message
        self.data = data
    }

    static func invalidArgument(_ field: String, _ message: String, reason: String? = nil) -> HealthError {
        var data: [String: Any] = ["field": field]
        if let reason { data["reason"] = reason }
        return HealthError(.invalidArgument, "\(field) \(message).", data: data)
    }

    static func unsupportedType(_ typeId: String, reason: String) -> HealthError {
        let message = reason == "osVersion"
            ? "\(typeId) needs a newer iOS version."
            : "\(typeId) isn't available on iOS."
        return HealthError(.unsupportedType, message, data: ["type": typeId, "reason": reason])
    }

    static func readOnlyType(_ typeId: String) -> HealthError {
        HealthError(.readOnlyType, "\(typeId) can't be written on iOS.", data: ["type": typeId])
    }

    /// Maps any error to a `HealthError`, by `HKError.Code` for HealthKit errors.
    static func from(_ error: Error) -> HealthError {
        if let error = error as? HealthError { return error }
        let nsError = error as NSError
        let data: [String: Any] = ["nativeCode": nsError.code]
        guard nsError.domain == HKErrorDomain else {
            return HealthError(.nativeError, nsError.localizedDescription, data: data)
        }
        // Raw values, so codes newer than the iOS 15 floor need no #available (pinned in HealthErrorTests).
        switch nsError.code {
        case HKError.Code.errorHealthDataUnavailable.rawValue, HKError.Code.errorHealthDataRestricted.rawValue,
             15: // errorNotPermissibleForGuestUserMode (iOS 18)
            return HealthError(.unavailable, nsError.localizedDescription, data: data)
        case HKError.Code.errorAuthorizationDenied.rawValue
            where nsError.localizedDescription.localizedCaseInsensitiveContains("entitlement"):
            var missing = data
            missing["missing"] = ["com.apple.developer.healthkit"]
            return HealthError(
                .missingDeclaration,
                "The app lacks the HealthKit capability (com.apple.developer.healthkit entitlement).",
                data: missing
            )
        case HKError.Code.errorAuthorizationDenied.rawValue, HKError.Code.errorAuthorizationNotDetermined.rawValue,
             HKError.Code.errorRequiredAuthorizationDenied.rawValue:
            return HealthError(.permissionDenied, nsError.localizedDescription, data: data)
        case HKError.Code.errorDatabaseInaccessible.rawValue:
            return HealthError(.deviceLocked, "The health store is inaccessible while the device is locked.", data: data)
        case HKError.Code.errorInvalidArgument.rawValue,
             13: // errorDataSizeExceeded (iOS 17)
            // HealthKit's message may quote the rejected value, so don't pass it on.
            HealthLog.debug("HealthKit rejected arguments: \(nsError.localizedDescription)")
            return HealthError(.invalidArgument, "HealthKit rejected the arguments.", data: data)
        default:
            return HealthError(.nativeError, nsError.localizedDescription, data: data)
        }
    }
}

extension CAPPluginCall {
    func reject(_ error: Error) {
        let error = HealthError.from(error)
        reject(error.message, error.code.rawValue, nil, error.data)
    }

    /// Runs `body` and resolves with its result, or rejects with the mapped error.
    func run(_ body: @escaping () async throws -> [String: Any]) {
        Task {
            do {
                resolve(try await body())
            } catch {
                reject(error)
            }
        }
    }
}
