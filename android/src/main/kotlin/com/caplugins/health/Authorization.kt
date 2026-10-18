package com.caplugins.health

import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import com.getcapacitor.JSObject

/**
 * Permission sets and statuses for `requestAuthorization` / `checkAuthorization` (R2, R3, decisions #31, #37).
 * Health Connect reports grants exactly but not whether the user was ever asked, so a missing grant is
 * `notGranted`, never "denied".
 */
class Authorization(private val types: HealthTypes, private val features: (Int) -> Boolean) {
    data class Request(
        val read: List<String>,
        val write: List<String>,
        val history: Boolean = false,
        val background: Boolean = false,
        val exerciseRoutes: Boolean = false,
    )

    companion object {
        /** Blanket read access to exercise routes; connect-client 1.1.0 has no constant for it (decision #70). */
        const val READ_EXERCISE_ROUTES = "android.permission.health.READ_EXERCISE_ROUTES"
        const val WRITE_EXERCISE_ROUTE = HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE
    }

    /** Every permission [request] needs on this device. Unsupported types are skipped; read-only writes reject. */
    fun permissions(request: Request): Set<String> {
        val permissions = linkedSetOf<String>()
        request.read.forEach { id -> types.lookup(id).getOrNull()?.let { permissions += it.readPermission } }
        request.write.forEach { id ->
            if (types.lookup(id).isSuccess) permissions += types.resolveWritable(id).writePermission
        }
        if (request.history && features(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)) {
            permissions += HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
        }
        if (request.background && features(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)) {
            permissions += HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
        }
        // Routes come with workouts: read access with reading them, write access with writing them.
        if (request.exerciseRoutes && Workouts.TYPE_ID in request.read && types.lookup(Workouts.TYPE_ID).isSuccess) permissions += READ_EXERCISE_ROUTES
        if (request.exerciseRoutes && Workouts.TYPE_ID in request.write && types.lookup(Workouts.TYPE_ID).isSuccess) permissions += WRITE_EXERCISE_ROUTE
        return permissions
    }

    /** The `AuthorizationResult` for [request] given the [granted] permissions. */
    fun result(request: Request, granted: Set<String>): JSObject {
        fun statuses(ids: List<String>, permission: (String) -> String) =
            JSObject().apply {
                ids.forEach { id ->
                    val entry = types.lookup(id).getOrNull()
                    put(id, if (entry == null) "unsupported" else if (permission(id) in granted) "granted" else "notGranted")
                }
            }
        return JSObject()
            .put("read", statuses(request.read) { types.resolve(it).readPermission })
            .put("write", statuses(request.write) { types.resolve(it).writePermission })
            .put("historyGranted", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted)
            .put("backgroundGranted", HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted)
            .put("exerciseRoutesGranted", JSObject().put("read", READ_EXERCISE_ROUTES in granted).put("write", WRITE_EXERCISE_ROUTE in granted))
    }
}
