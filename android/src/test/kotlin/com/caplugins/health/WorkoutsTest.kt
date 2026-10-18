package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSegment
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.testing.AggregationResult
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.testing.FakePermissionController
import androidx.health.connect.client.testing.stubs.MutableStub
import androidx.health.connect.client.time.TimeRangeFilter
import com.caplugins.health.generated.Registry
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Workouts on Android (T48, decisions #67, #69). */
class WorkoutsTest {
    private val permissions = FakePermissionController(grantAll = true)
    private val client = FakeHealthConnectClient(permissionController = permissions)
    private val types = HealthTypes { true }
    private val samples = samples(ReadByIdClient(client))
    private val entry = Registry.byId.getValue("workout")

    private fun samples(client: HealthConnectClient) = Samples(
        client,
        types,
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )

    private fun at(time: String, day: Int = 2) = "2026-10-0${day}T$time:00.000+02:00"

    private fun span(start: String, end: String) = """"startDate":"${at(start)}","endDate":"${at(end)}""""

    private fun run(extra: String = "", activity: String = "running") =
        """{"type":"workout","activityType":"$activity",${span("07:00", "08:00")}$extra}"""

    private fun decode(json: String) = RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), entry)

    private fun session(json: String) = decode(json).primary as ExerciseSessionRecord

    private fun reason(block: () -> Unit): String? = assertThrows(HealthException::class.java) { block() }.data.getString("reason")

    private suspend fun save(vararg json: String) = samples.save(JSONArray(json.map { JSONObject(it) })).getJSONArray("ids")

    private suspend fun read(type: String = "workout", from: String = at("00:00"), to: String = at("23:00")) =
        samples.read(Fields(JSONObject("""{"type":"$type","startDate":"$from","endDate":"$to"}"""))).getJSONArray("samples")

    private suspend fun clientIds(type: String): List<String> = read(type).let { list -> (0 until list.length()).map { list.getJSONObject(it).optString("clientId") } }

    @Test
    fun isSupportedWithExerciseTime() {
        val support = types.support("workout")
        assertTrue(support.getBoolean("supported"))
        assertTrue(support.getBoolean("writable"))
        assertEquals(listOf("duration"), Aggregation.metrics(entry))
        assertEquals(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL, entry.aggregates["duration"])
    }

    @Test
    fun everyActivityRoundTrips() {
        for ((id, constant) in Registry.workoutActivities) {
            val record = session(run(activity = id))
            assertEquals(id, constant, record.exerciseType)
            assertEquals(id, RecordCodec.encode(record, entry).getString("activityType"))
        }
    }

    @Test
    fun unknownExerciseTypesReadAsOther() {
        val record = ExerciseSessionRecord(
            Instant.parse("2026-10-02T05:00:00Z"), null, Instant.parse("2026-10-02T06:00:00Z"), null,
            Metadata.manualEntry(), exerciseType = 9999,
        )
        val out = RecordCodec.encode(record, entry)
        assertEquals("other", out.getString("activityType"))
        assertEquals(9999, out.getJSONObject("native").getInt("value"))
        assertEquals(0, out.getJSONObject("totals").length())
    }

    @Test
    fun roundTripsSegmentsLapsTitleAndNotes() {
        val json = run(
            ""","title":"Morning run","notes":"Felt good","clientId":"w1","clientVersion":2,""" +
                """"segments":[{${span("07:30", "07:40")},"segmentType":"walking"},{${span("07:20", "07:25")},"segmentType":"pause"},{${span("07:50", "07:55")},"repetitions":0}],""" +
                """"laps":[{${span("07:30", "08:00")},"length":4000},{${span("07:00", "07:30")}}]""",
        )
        val decoded = decode(json)
        assertTrue(decoded.extras.isEmpty())
        val record = decoded.primary as ExerciseSessionRecord
        assertEquals(ExerciseSegment.EXERCISE_SEGMENT_TYPE_UNKNOWN, record.segments.last().segmentType)
        val out = RecordCodec.encode(record, entry)
        assertEquals("special", out.getString("kind"))
        assertEquals("running", out.getString("activityType"))
        assertEquals("Morning run", out.getString("title"))
        assertEquals("Felt good", out.getString("notes"))
        assertFalse(out.getBoolean("hasRoute"))
        assertFalse(out.has("activities"))
        assertEquals("w1", out.getString("clientId"))
        val segments = out.getJSONArray("segments")
        assertEquals(listOf("pause", "walking"), (0..1).map { segments.getJSONObject(it).getString("segmentType") })
        assertEquals(at("07:20"), segments.getJSONObject(0).getString("startDate"))
        assertFalse(segments.getJSONObject(2).has("segmentType"))
        assertFalse(segments.getJSONObject(2).has("repetitions"))
        val laps = out.getJSONArray("laps")
        assertFalse(laps.getJSONObject(0).has("length"))
        assertEquals(4000.0, laps.getJSONObject(1).getDouble("length"), 0.0)
        val native = out.getJSONObject("native")
        assertEquals("ExerciseSessionRecord", native.getString("type"))
        assertEquals(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, native.getInt("value"))
        assertEquals(ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE, native.getJSONArray("segments").getInt(0))
    }

    @Test
    fun repetitionsRoundTrip() {
        val record = session(run(""","segments":[{${span("07:00", "07:10")},"segmentType":"squat","repetitions":12}]""", activity = "strengthTraining"))
        assertEquals(12, record.segments.single().repetitions)
        assertEquals(12, RecordCodec.encode(record, entry).getJSONArray("segments").getJSONObject(0).getInt("repetitions"))
    }

    /** The registry's `workoutSegments` table says what `ExerciseSegment.isCompatibleWith` does, for every pair. */
    @Test
    fun segmentRulesMatchHealthConnect() {
        val start = Instant.parse("2026-10-02T05:00:00Z")
        val segmentTypes = Registry.valueSets.getValue("workoutSegmentType").constants
        for ((activity, exerciseType) in Registry.workoutActivities) {
            for ((segmentType, constant) in segmentTypes) {
                val accepted = runCatching {
                    ExerciseSessionRecord(
                        start, null, start.plusSeconds(3600), null, Metadata.manualEntry(), exerciseType,
                        segments = listOf(ExerciseSegment(start, start.plusSeconds(60), constant)),
                    )
                }.isSuccess
                assertEquals("$activity / $segmentType", accepted, Workouts.segmentAllowed(activity, segmentType))
            }
        }
    }

    @Test
    fun rejectsWhatHealthConnectWouldBeforeItDoes() {
        assertEquals("segmentNotAllowed", reason { decode(run(""","segments":[{${span("07:00", "07:10")},"segmentType":"yoga"}]""")) })
        assertEquals("outsideSession", reason { decode(run(""","segments":[{${span("07:50", "08:10")}}]""")) })
        assertEquals("outsideSession", reason { decode(run(""","laps":[{${span("06:50", "07:10")}}]""")) })
        assertEquals("segmentsOverlap", reason { decode(run(""","segments":[{${span("07:00", "07:20")}},{${span("07:10", "07:30")}}]""")) })
        assertEquals("lapsOverlap", reason { decode(run(""","laps":[{${span("07:00", "07:20")}},{${span("07:10", "07:30")}}]""")) })
        assertEquals("endNotAfterStart", reason { decode(run(""","laps":[{${span("07:10", "07:10")}}]""")) })
        assertEquals("endNotAfterStart", reason { decode("""{"type":"workout","activityType":"running",${span("07:00", "07:00")}}""") })
        assertEquals("required", reason { decode("""{"type":"workout","activityType":"running","startDate":"${at("07:00")}"}""") })
        assertEquals("outOfRange", reason { decode(run(""","laps":[{${span("07:00", "07:10")},"length":1000001}]""")) })
        assertEquals("outOfRange", reason { decode(run(""","segments":[{${span("07:00", "07:10")},"repetitions":-1}]""")) })
        assertEquals("outOfRange", reason { decode(run(""","totals":{"energy":-1}""")) })
        assertEquals("notApplicable", reason { decode(run(""","totals":{"steps":10}""")) })
        assertEquals("valueUnsupportedOnPlatform", reason { decode(run(activity = "archery")) })
        assertEquals("valueUnsupportedOnPlatform", reason { decode(run(""","segments":[{${span("07:00", "07:10")},"segmentType":"nap"}]""")) })
        assertEquals(
            "valueUnsupportedOnPlatform",
            reason { decode(run(""","activities":[{"activityType":"running",${span("07:00", "08:00")}}]""")) },
        )
        // Named by the caller's indexes, after sorting by start.
        val overlap = assertThrows(HealthException::class.java) {
            decode(run(""","segments":[{${span("07:10", "07:30")}},{${span("07:00", "07:20")}}]"""))
        }
        assertEquals("samples[0].segments[0]", overlap.data.getString("field"))
    }

    @Test
    fun totalsAreWrittenAsRecordsSpanningTheWorkout() {
        val decoded = decode(run(""","totals":{"energy":420,"distance":8000},"clientId":"w1","clientVersion":3,"recordingMethod":"manual""""))
        val energy = decoded.extras.filterIsInstance<ActiveCaloriesBurnedRecord>().single()
        val distance = decoded.extras.filterIsInstance<DistanceRecord>().single()
        val session = decoded.primary as ExerciseSessionRecord
        assertEquals(420.0, energy.energy.inKilocalories, 1e-9)
        assertEquals(8000.0, distance.distance.inMeters, 1e-9)
        for (record in listOf<Record>(energy, distance)) assertEquals(session.startTime to session.endTime, RecordCodec.times(record).let { it.start to it.end })
        assertEquals("w1:energy", energy.metadata.clientRecordId)
        assertEquals("w1:distance", distance.metadata.clientRecordId)
        assertEquals(3L, distance.metadata.clientRecordVersion)
        assertEquals(Metadata.RECORDING_METHOD_MANUAL_ENTRY, energy.metadata.recordingMethod)
        // Without a clientId the totals have none either.
        assertTrue(decode(run(""","totals":{"energy":1}""")).extras.single().metadata.clientRecordId == null)
    }

    @Test
    fun sharesCountRecordsPartlyInsideInProportion() {
        val start = Instant.parse("2026-10-02T05:00:00Z")
        val end = start.plusSeconds(3600)
        assertEquals(100.0, Workouts.share(start, end, start, end, 100.0)!!, 1e-9)
        assertEquals(50.0, Workouts.share(start, end, start.minusSeconds(1800), start.plusSeconds(1800), 100.0)!!, 1e-9)
        assertEquals(25.0, Workouts.share(start, end, start.plusSeconds(3600 - 900), end.plusSeconds(2700), 100.0)!!, 1e-9)
        assertNull(Workouts.share(start, end, end, end.plusSeconds(60), 100.0))
        assertNull(Workouts.share(start, end, start.minusSeconds(60), start, 100.0))
    }

    @Test
    fun readsTotalsFromTheWorkoutAppsRecords() = runTest {
        val ids = save(run(""","totals":{"energy":420,"distance":8000},"clientId":"w1""""))
        // The same app's energy record from 07:30 to 08:30 counts half; another app's doesn't count.
        save("""{"type":"activeEnergy",${span("07:30", "08:30")},"value":100}""")
        client.setPackageName("com.example.other")
        save("""{"type":"activeEnergy",${span("07:00", "08:00")},"value":999}""")
        client.setPackageName(FakeHealthConnectClient.DEFAULT_PACKAGE_NAME)
        val workout = read().getJSONObject(0)
        assertEquals(ids.getString(0), workout.getString("id"))
        val totals = workout.getJSONObject("totals")
        assertEquals(470.0, totals.getDouble("energy"), 1e-6)
        assertEquals(8000.0, totals.getDouble("distance"), 1e-6)
    }

    @Test
    fun anotherAppsWorkoutSumsThatAppsRecords() = runTest {
        client.setPackageName("com.example.other")
        save(run(), """{"type":"distance",${span("07:00", "07:30")},"value":3000}""")
        client.setPackageName(FakeHealthConnectClient.DEFAULT_PACKAGE_NAME)
        save("""{"type":"distance",${span("07:00", "08:00")},"value":1}""")
        val workout = read().getJSONObject(0)
        assertEquals("com.example.other", workout.getJSONObject("source").getString("id"))
        assertEquals(3000.0, workout.getJSONObject("totals").getDouble("distance"), 1e-6)
        assertFalse(workout.getJSONObject("totals").has("energy"))
    }

    @Test
    fun readsWorkoutsThatStartBeforeTheRange() = runTest {
        save(run())
        assertEquals(1, read(from = at("07:30")).length())
        assertEquals(0, read(from = at("08:30")).length())
    }

    @Test
    fun rewritingDropsTotalsTheNewVersionLacks() = runTest {
        save(run(""","totals":{"energy":420,"distance":8000},"clientId":"w1""""))
        // A lower version is ignored by Health Connect, so its totals stay too.
        save(run(""","totals":{"energy":300},"clientId":"w1","clientVersion":0"""))
        assertEquals(listOf("w1:distance"), clientIds("distance"))
        // A new version, shorter and without a distance.
        save("""{"type":"workout","activityType":"cyclingStationary",${span("07:00", "07:45")},"totals":{"energy":300},"clientId":"w1","clientVersion":2}""")
        assertEquals(emptyList<String>(), clientIds("distance"))
        assertEquals(listOf("w1:energy"), clientIds("activeEnergy"))
        val workout = read().getJSONObject(0)
        assertEquals("cyclingStationary", workout.getString("activityType"))
        assertEquals(300.0, workout.getJSONObject("totals").getDouble("energy"), 1e-6)
        assertFalse(workout.getJSONObject("totals").has("distance"))
    }

    @Test
    fun deletingByClientIdDeletesItsTotals() = runTest {
        save(run(""","totals":{"energy":420,"distance":8000},"clientId":"w1""""), """{"type":"distance",${span("07:00", "08:00")},"value":5}""")
        val deleted = samples.delete(Fields(JSONObject("""{"type":"workout","clientIds":["w1"]}"""))).getInt("deleted")
        assertEquals(1, deleted)
        assertEquals(0, read().length())
        assertEquals(0, read("activeEnergy").length())
        // A record that only happens to span the workout stays: the workout had a clientId.
        assertEquals(1, read("distance").length())
    }

    @Test
    fun deletingByIdOrRangeDeletesTotalsSpanningTheWorkout() = runTest {
        val ids = save(run(""","totals":{"energy":420}"""), """{"type":"activeEnergy",${span("07:00", "07:30")},"value":5}""")
        samples.delete(Fields(JSONObject("""{"type":"workout","ids":["${ids.getString(0)}"]}""")))
        assertEquals(0, read().length())
        assertEquals(listOf(5.0), read("activeEnergy").let { list -> (0 until list.length()).map { list.getJSONObject(it).getDouble("value") } })

        save(run(""","totals":{"distance":10}"""))
        samples.delete(Fields(JSONObject("""{"type":"workout","startDate":"${at("06:00")}","endDate":"${at("09:00")}"}""")))
        assertEquals(0, read().length())
        assertEquals(0, read("distance").length())
    }

    @Test
    fun deletingAnotherAppsWorkoutLeavesItsTotals() = runTest {
        client.setPackageName("com.example.other")
        val ids = save(run(""","totals":{"energy":420}"""))
        client.setPackageName(FakeHealthConnectClient.DEFAULT_PACKAGE_NAME)
        val ownEnergy = save("""{"type":"activeEnergy",${span("07:00", "08:00")},"value":5}""")
        samples.delete(Fields(JSONObject("""{"type":"workout","ids":["${ids.getString(0)}"]}""")))
        assertTrue(read("activeEnergy").let { list -> (0 until list.length()).any { list.getJSONObject(it).getString("id") == ownEnergy.getString(0) } })
    }

    @Test
    fun writingTotalsNeedsWriteAccessToTheirTypes() = runTest {
        permissions.replaceGrantedPermissions(
            setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class), HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)),
        )
        save(run(""","totals":{"energy":1}"""))
        val error = assertThrows(HealthException::class.java) { kotlinx.coroutines.runBlocking { save(run(""","totals":{"energy":1,"distance":2}""")) } }
        assertEquals(HealthException.PERMISSION_DENIED, error.code)
        assertEquals("distance", error.data.getString("type"))
        // Without totals no write access to them is needed.
        permissions.replaceGrantedPermissions(setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class)))
        save(run())
    }

    @Test
    fun deletingWithoutWriteAccessToTheTotalsStillDeletesTheWorkout() = runTest {
        save(run(""","totals":{"energy":420,"distance":10},"clientId":"w1""""))
        permissions.replaceGrantedPermissions(
            setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class), HealthPermission.getWritePermission(DistanceRecord::class)),
        )
        val deleted = samples.delete(Fields(JSONObject("""{"type":"workout","clientIds":["w1"]}"""))).getInt("deleted")
        assertEquals(1, deleted)
        assertEquals(listOf("w1:energy"), clientIds("activeEnergy"))
        assertEquals(emptyList<String>(), clientIds("distance"))
    }

    @Test
    fun changesCarryTotals() = runTest {
        val changes = Changes(client, types, samples, FakeHealthConnectClient.DEFAULT_PACKAGE_NAME, { Base64.getEncoder().encodeToString(it) }, { Base64.getDecoder().decode(it) })
        val cursor = changes.changes(Fields(JSONObject("""{"types":["workout"]}"""))).getString("nextCursor")
        save(run(""","totals":{"energy":420}"""))
        val upserted = changes.changes(Fields(JSONObject("""{"types":["workout"],"cursor":"$cursor"}"""))).getJSONArray("upserted")
        assertEquals(1, upserted.length())
        assertEquals(420.0, upserted.getJSONObject(0).getJSONObject("totals").getDouble("energy"), 1e-6)
    }

    @Test
    fun aggregatesExerciseTimeInSeconds() = runTest {
        val requests = mutableListOf<AggregateRequest>()
        client.overrides.aggregate = MutableStub { request: AggregateRequest ->
            requests += request
            @Suppress("UNCHECKED_CAST")
            AggregationResult(metrics = mapOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL to Duration.ofMinutes(55)) as Map<AggregateMetric<Any>, Any>)
        }
        val json = Aggregation(client, types) { ZoneId.of("Europe/Berlin") }.aggregate(
            Fields(JSONObject("""{"type":"workout","startDate":"${at("00:00")}","endDate":"${at("12:00")}","metrics":["duration"]}""")),
        )
        val bucket = json.getJSONArray("buckets").getJSONObject(0)
        assertEquals(3300.0, bucket.getJSONObject("values").getDouble("duration"), 0.0)
        assertEquals("s", bucket.getString("unit"))
        val expected = AggregateRequest(
            setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL),
            TimeRangeFilter.between(Instant.parse("2026-10-01T22:00:00Z"), Instant.parse("2026-10-02T10:00:00Z")),
        )
        assertEquals(expected, requests.single())
    }
}
