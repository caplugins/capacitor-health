package com.caplugins.health

import android.os.Build
import android.os.RemoteException
import androidx.annotation.RequiresApi
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import java.io.IOException

/** A rejection with one of the stable codes of requirement R17. Messages never contain health values. */
class HealthException(
    val code: String,
    override val message: String,
    val data: JSObject = JSObject(),
    cause: Throwable? = null,
) : Exception(message, cause) {
    companion object {
        const val UNAVAILABLE = "UNAVAILABLE"
        const val NOT_INSTALLED = "NOT_INSTALLED"
        const val UPDATE_REQUIRED = "UPDATE_REQUIRED"
        const val MISSING_DECLARATION = "MISSING_DECLARATION"
        const val PERMISSION_DENIED = "PERMISSION_DENIED"
        const val UNSUPPORTED_TYPE = "UNSUPPORTED_TYPE"
        const val READ_ONLY_TYPE = "READ_ONLY_TYPE"
        const val INVALID_ARGUMENT = "INVALID_ARGUMENT"
        const val CURSOR_EXPIRED = "CURSOR_EXPIRED"
        const val RATE_LIMITED = "RATE_LIMITED"
        const val NATIVE_ERROR = "NATIVE_ERROR"

        /** `android.health.connect.HealthConnectException.ERROR_RATE_LIMIT_EXCEEDED` (API 34). */
        const val PLATFORM_ERROR_RATE_LIMIT_EXCEEDED = 7

        fun invalidArgument(field: String, message: String, reason: String? = null) =
            HealthException(
                INVALID_ARGUMENT,
                "$field $message.",
                JSObject().apply {
                    put("field", field)
                    reason?.let { put("reason", it) }
                },
            )

        fun unsupportedType(type: String, reason: String) =
            HealthException(
                UNSUPPORTED_TYPE,
                when (reason) {
                    "featureUnavailable" -> "$type needs a Health Connect feature this device doesn't have."
                    "aggregateOnly" -> "$type has no records on Android, only aggregates."
                    else -> "$type isn't available on Android."
                },
                JSObject().put("type", type).put("reason", reason),
            )

        fun readOnlyType(type: String) =
            HealthException(READ_ONLY_TYPE, "$type can't be written on Android.", JSObject().put("type", type))

        /** Maps anything Health Connect throws (decision #31's error side). */
        fun from(error: Throwable): HealthException {
            if (error is HealthException) return error
            if (isRateLimit(error)) {
                return HealthException(RATE_LIMITED, "Health Connect's rate limit was reached; try again later.", cause = error)
            }
            return when (error) {
                is SecurityException ->
                    HealthException(PERMISSION_DENIED, "Health Connect denied access: ${error.message}", cause = error)
                is IllegalArgumentException -> {
                    // Health Connect's message may quote the rejected value, so don't pass it on.
                    HealthLog.debug("Health Connect rejected arguments: ${error.message}")
                    HealthException(INVALID_ARGUMENT, "Health Connect rejected the arguments.", cause = error)
                }
                is UnsupportedOperationException ->
                    HealthException(UNAVAILABLE, "Health Connect is unavailable: ${error.message}", cause = error)
                is IOException, is RemoteException, is IllegalStateException ->
                    HealthException(NATIVE_ERROR, error.message ?: error.javaClass.simpleName, nativeCode(error), error)
                else -> HealthException(NATIVE_ERROR, error.message ?: error.javaClass.simpleName, cause = error)
            }
        }

        /**
         * The Health Connect app's `INVALID_UID` (10005): a delete named an id or clientId that doesn't exist, or an
         * id that isn't a UUID. `connect-client` 1.1.0 turns it into a `RemoteException` that carries only the
         * app's message ("Request contains invalid UID.", "Invalid UID <id>"), so it's recognized by that.
         */
        fun isMissingRecord(error: Throwable): Boolean =
            generateSequence(error) { it.cause }.any { it.message?.contains("invalid uid", ignoreCase = true) == true }

        /**
         * Health Connect's rejection of a delete by ids that names other apps' records; it deletes nothing then:
         * - the Health Connect app (Android 13 and lower) throws a `SecurityException` "<package> doesn't own data
         *   points of the following UIDs: [<id>, …]" that lists every such id (decision #46);
         * - Android 14+ throws an `IllegalArgumentException` "<app id> is not the owner for <id>" that names only the
         *   first such id it finds (decision #47).
         * Returns those ids, lowercased (empty if they can't be found), or null for any other error, including a
         * missing permission.
         */
        fun otherAppsRecordIds(error: Throwable): Set<String>? {
            val chain = generateSequence(error) { it.cause }
            chain.mapNotNull { it.message }.firstOrNull { it.contains(NOT_THE_OWNER, ignoreCase = true) }?.let { message ->
                val id = message.substring(message.indexOf(NOT_THE_OWNER, ignoreCase = true) + NOT_THE_OWNER.length)
                    .trim().takeWhile { !it.isWhitespace() }.lowercase()
                return setOfNotNull(id.ifEmpty { null })
            }
            val message = chain
                .firstOrNull { it is SecurityException && it.message?.contains("own data points", ignoreCase = true) == true }
                ?.message ?: return null
            val list = message.substringAfterLast('[', "").substringBefore(']')
            return list.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
        }

        private const val NOT_THE_OWNER = "is not the owner for"

        private fun isRateLimit(error: Throwable): Boolean {
            var current: Throwable? = error
            while (current != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && platformCode(current) == PLATFORM_ERROR_RATE_LIMIT_EXCEEDED) {
                    return true
                }
                val message = current.message?.lowercase() ?: ""
                if ("rate limit" in message || "quota" in message) return true
                current = current.cause
            }
            return false
        }

        private fun nativeCode(error: Throwable): JSObject {
            val data = JSObject()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                generateSequence(error) { it.cause }.firstNotNullOfOrNull { platformCode(it) }?.let { data.put("nativeCode", it) }
            }
            return data
        }

        @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        private fun platformCode(error: Throwable): Int? = (error as? android.health.connect.HealthConnectException)?.errorCode
    }
}

fun PluginCall.reject(error: HealthException) = reject(error.message, error.code, null, error.data)
