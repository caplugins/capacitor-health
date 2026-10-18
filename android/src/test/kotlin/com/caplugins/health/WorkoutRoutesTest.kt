package com.caplugins.health

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseRoute
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.testing.FakePermissionController
import com.caplugins.health.generated.Registry
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Workout routes on Android (T49, decision #70). */
class WorkoutRoutesTest {
    private val permissions = FakePermissionController(grantAll = true)
    private val fake = FakeHealthConnectClient(permissionController = permissions)
    private val client = ReadByIdClient(fake)
    private val types = HealthTypes { true }
    private val samples = Samples(
        client,
        types,
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val routes = WorkoutRoutes(client)
    private val entry = Registry.byId.getValue("workout")

    private fun at(time: String) = "2026-10-02T$time.000+02:00"

    private fun point(time: String, extra: String = "") = """{"time":"${at(time)}","latitude":52.52,"longitude":13.405$extra}"""

    private fun run(route: String, extra: String = "") =
        """{"type":"workout","activityType":"running","startDate":"${at("07:00:00")}","endDate":"${at("08:00:00")}","route":[$route]$extra}"""

    private fun session(json: String) = RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), entry).primary as ExerciseSessionRecord

    private fun reason(block: () -> Unit): String? = assertThrows(HealthException::class.java) { block() }.data.getString("reason")

    private suspend fun save(json: String) = samples.save(JSONArray(listOf(JSONObject(json)))).getJSONArray("ids").getString(0)

    private suspend fun read(id: String) = (routes.read(Fields(JSONObject("""{"workoutId":"$id"}"""))) as WorkoutRoutes.Outcome.Locations).json.getJSONArray("locations")

    @Test
    fun decodesARouteInTimeOrder() {
        val record = session(run("${point("07:30:00", ""","altitude":34.5,"horizontalAccuracy":5,"verticalAccuracy":3""")},${point("07:00:00")}"))
        val route = (record.exerciseRouteResult as ExerciseRouteResult.Data).exerciseRoute.route
        assertEquals(2, route.size)
        assertEquals(record.startTime, route[0].time)
        assertEquals(null, route[0].altitude)
        assertEquals(34.5, route[1].altitude!!.inMeters, 0.0)
        assertEquals(5.0, route[1].horizontalAccuracy!!.inMeters, 0.0)
        assertEquals(3.0, route[1].verticalAccuracy!!.inMeters, 0.0)
        // An empty route is none; a workout's JSON says whether it has one.
        val none = session(run(""))
        assertTrue(none.exerciseRouteResult is ExerciseRouteResult.NoData)
        assertFalse(RecordCodec.encode(none, entry).getBoolean("hasRoute"))
        assertTrue(RecordCodec.encode(record, entry).getBoolean("hasRoute"))
    }

    @Test
    fun rejectsWhatHealthConnectWouldBeforeItDoes() {
        assertEquals("outsideSession", reason { session(run(point("08:00:00"))) })
        assertEquals("outsideSession", reason { session(run(point("06:59:59"))) })
        assertEquals("duplicateTime", reason { session(run("${point("07:10:00")},${point("07:10:00")}")) })
        assertEquals("outOfRange", reason { session(run(point("07:10:00").replace("52.52", "90.5"))) })
        assertEquals("outOfRange", reason { session(run(point("07:10:00").replace("13.405", "-181"))) })
        assertEquals("outOfRange", reason { session(run(point("07:10:00", ""","horizontalAccuracy":-1"""))) })
        assertEquals("outOfRange", reason { session(run(point("07:10:00", ""","verticalAccuracy":-1"""))) })
        val duplicate = assertThrows(HealthException::class.java) { session(run("${point("07:20:00")},${point("07:10:00")},${point("07:10:00")}")) }
        assertEquals("samples[0].route[2].time", duplicate.data.getString("field"))
    }

    @Test
    fun aWrittenRouteReadsBackPointForPoint() = runTest {
        val points = listOf(
            point("07:00:00", ""","altitude":34.5,"horizontalAccuracy":5,"verticalAccuracy":3"""),
            point("07:00:01").replace("52.52", "52.5201"),
            point("07:59:59.999".removeSuffix(".999")).replace("13.405", "13.41"),
        )
        val id = save(run(points.joinToString(",")))
        val read = read(id)
        assertEquals(3, read.length())
        val expected = points.map { JSONObject(it) }
        for (i in 0 until 3) {
            val (want, got) = expected[i] to read.getJSONObject(i)
            for (key in want.keys()) {
                if (key == "time") assertEquals("$i.$key", want.getString(key), got.getString(key)) else assertEquals("$i.$key", want.getDouble(key), got.getDouble(key), 0.0)
            }
            assertEquals(want.length(), got.length())
        }
    }

    @Test
    fun aWorkoutWithoutARouteReadsEmpty() = runTest {
        assertEquals(0, read(save(run(""))).length())
    }

    @Test
    fun anUnknownWorkoutIsNotFound() {
        val error = assertThrows(HealthException::class.java) { runBlocking { read("no-such-id") } }
        assertEquals("workoutNotFound", error.data.getString("reason"))
        assertEquals("workoutId", error.data.getString("field"))
    }

    @Test
    fun writingARouteNeedsWriteAccessToRoutes() = runTest {
        permissions.replaceGrantedPermissions(setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class)))
        val error = assertThrows(HealthException::class.java) { runBlocking { save(run(point("07:10:00"))) } }
        assertEquals(HealthException.PERMISSION_DENIED, error.code)
        assertEquals("routeNotAuthorized", error.data.getString("reason"))
        // Without a route the workout needs no route access.
        save(run(""))
    }

    @Test
    fun anotherAppsRouteNeedsConsent() = runTest {
        val id = save(run(point("07:10:00")))
        // What Health Connect returns for another app's route without READ_EXERCISE_ROUTES. That constructor is
        // internal to Kotlin, so it's reached through Java reflection.
        val withResult = ExerciseSessionRecord::class.java.constructors.first { c ->
            c.parameterTypes.size == 12 && c.parameterTypes[10] == ExerciseRouteResult::class.java
        }
        client.replace = { record ->
            val s = record as ExerciseSessionRecord
            withResult.newInstance(
                s.startTime, s.startZoneOffset, s.endTime, s.endZoneOffset, s.metadata, s.exerciseType, s.title, s.notes,
                s.segments, s.laps, ExerciseRouteResult.ConsentRequired(), null,
            ) as ExerciseSessionRecord
        }
        val outcome = routes.read(Fields(JSONObject("""{"workoutId":"$id"}""")))
        assertTrue(outcome is WorkoutRoutes.Outcome.ConsentRequired)
        assertEquals(id, (outcome as WorkoutRoutes.Outcome.ConsentRequired).sessionId)
        assertEquals("routeConsentRequired", WorkoutRoutes.consentRequired().data.getString("reason"))
        // The user declined; or shared it, read in the session's offset.
        val denied = assertThrows(HealthException::class.java) { runBlocking { routes.consented(id, null) } }
        assertEquals("routeConsentDenied", denied.data.getString("reason"))
        val shared = routes.consented(id, ExerciseRoute(listOf(ExerciseRoute.Location(java.time.Instant.parse("2026-10-02T05:10:00Z"), 1.0, 2.0))))
        assertEquals(at("07:10:00"), shared.getJSONArray("locations").getJSONObject(0).getString("time"))
    }

    @Test
    fun exerciseRoutesAddsTheRoutePermissionsForWorkouts() {
        val authorization = Authorization(types) { true }
        val both = Authorization.Request(read = listOf("workout"), write = listOf("workout"), exerciseRoutes = true)
        assertTrue(authorization.permissions(both).containsAll(setOf(Authorization.READ_EXERCISE_ROUTES, Authorization.WRITE_EXERCISE_ROUTE)))
        val readOnly = Authorization.Request(read = listOf("workout"), write = listOf("steps"), exerciseRoutes = true)
        assertFalse(Authorization.WRITE_EXERCISE_ROUTE in authorization.permissions(readOnly))
        assertFalse(Authorization.READ_EXERCISE_ROUTES in authorization.permissions(both.copy(exerciseRoutes = false)))
        val result = authorization.result(both, setOf(Authorization.READ_EXERCISE_ROUTES))
        val granted = result.getJSONObject("exerciseRoutesGranted")
        assertTrue(granted.getBoolean("read"))
        assertFalse(granted.getBoolean("write"))
        assertEquals("android.permission.health.READ_EXERCISE_ROUTES", Authorization.READ_EXERCISE_ROUTES)
        assertEquals("android.permission.health.WRITE_EXERCISE_ROUTE", Authorization.WRITE_EXERCISE_ROUTE)
    }
}
