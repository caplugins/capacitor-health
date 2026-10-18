package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ExerciseRoute
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.ZoneOffset

/**
 * `readWorkoutRoute` on Android (decision #70). A session's route comes with `readRecord`: as data when this app
 * may read it (its own routes, or with `READ_EXERCISE_ROUTES`), else as `ConsentRequired`, which the plugin
 * answers with Health Connect's per-session consent screen when the caller asks for it.
 */
class WorkoutRoutes(private val client: HealthConnectClient) {
    /** What reading a route found: its points, or that the user must consent to share it. */
    sealed class Outcome {
        class Locations(val json: JSObject) : Outcome()

        class ConsentRequired(val sessionId: String) : Outcome()
    }

    suspend fun read(options: Fields): Outcome {
        val id = options.string("workoutId")
        val session = session(id)
        return when (val result = session.exerciseRouteResult) {
            is ExerciseRouteResult.Data -> Outcome.Locations(encode(result.exerciseRoute, session.startZoneOffset))
            is ExerciseRouteResult.ConsentRequired -> Outcome.ConsentRequired(session.metadata.id)
            else -> Outcome.Locations(encode(null, session.startZoneOffset))
        }
    }

    /** The result for a route the user just shared (null: they didn't), in the session's offset. */
    suspend fun consented(sessionId: String, route: ExerciseRoute?): JSObject {
        if (route == null) {
            throw HealthException(
                HealthException.PERMISSION_DENIED,
                "The user didn't share this workout's route.",
                JSObject().put("type", Workouts.TYPE_ID).put("reason", "routeConsentDenied"),
            )
        }
        return encode(route, session(sessionId).startZoneOffset)
    }

    private suspend fun session(id: String): ExerciseSessionRecord =
        try {
            client.readRecord(ExerciseSessionRecord::class, id).record
        } catch (e: SecurityException) {
            throw e
        } catch (_: Exception) {
            // A missing id (or another type's) throws a bare IllegalArgumentException or RemoteException.
            throw HealthException.invalidArgument("workoutId", "isn't a workout this app can read", "workoutNotFound")
        }

    companion object {
        fun consentRequired(): HealthException =
            HealthException(
                HealthException.PERMISSION_DENIED,
                "Reading this workout's route needs READ_EXERCISE_ROUTES or the user's consent (android.requestConsent).",
                JSObject().put("type", Workouts.TYPE_ID).put("reason", "routeConsentRequired"),
            )

        /** Points in time order. */
        fun encode(route: ExerciseRoute?, offset: ZoneOffset?): JSObject =
            JSObject().put("locations", JSArray(route?.route.orEmpty().sortedBy { it.time }.map { Workouts.encodeLocation(it, offset) }))
    }
}
