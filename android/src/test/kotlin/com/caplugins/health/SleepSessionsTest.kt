package com.caplugins.health

import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.testing.AggregationResult
import androidx.health.connect.client.testing.FakeHealthConnectClient
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
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Sleep sessions on Android (T45, decisions #64, #66). */
class SleepSessionsTest {
    private val client = FakeHealthConnectClient()
    private val types = HealthTypes { true }
    private val samples = Samples(
        client,
        types,
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val entry = Registry.byId.getValue("sleepSession")

    private fun at(time: String, day: Int = 2) = "2026-10-0${day}T$time:00.000+02:00"

    private fun stage(stage: String, start: String, end: String) =
        """{"stage":"$stage","startDate":"${at(start)}","endDate":"${at(end)}"}"""

    private fun night(stages: String, extra: String = "") =
        """{"type":"sleepSession","startDate":"${at("23:00", 1)}","endDate":"${at("07:00")}","stages":[$stages]$extra}"""

    private fun decode(json: String) = RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), entry).primary as SleepSessionRecord

    private fun reason(block: () -> Unit): String? = assertThrows(HealthException::class.java) { block() }.data.getString("reason")

    @Test
    fun isSupportedWithItsStagesAndTimeAsleep() {
        val support = types.support("sleepSession")
        assertTrue(support.getBoolean("supported"))
        assertTrue(support.getBoolean("writable"))
        assertEquals(listOf("duration"), Aggregation.metrics(entry))
        val values = support.getJSONArray("values")
        assertEquals(
            listOf("inBed", "asleep", "awake", "light", "deep", "rem", "outOfBed", "unknown"),
            (0 until values.length()).map { values.getString(it) },
        )
    }

    @Test
    fun everyStageMapsToItsConstant() {
        val expected = mapOf(
            "inBed" to SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
            "asleep" to SleepSessionRecord.STAGE_TYPE_SLEEPING,
            "awake" to SleepSessionRecord.STAGE_TYPE_AWAKE,
            "light" to SleepSessionRecord.STAGE_TYPE_LIGHT,
            "deep" to SleepSessionRecord.STAGE_TYPE_DEEP,
            "rem" to SleepSessionRecord.STAGE_TYPE_REM,
            "outOfBed" to SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
            "unknown" to SleepSessionRecord.STAGE_TYPE_UNKNOWN,
        )
        for ((name, constant) in expected) {
            val record = decode(night(stage(name, "00:00", "01:00")))
            assertEquals(name, constant, record.stages.single().stage)
            assertEquals(name, RecordCodec.encode(record, entry).getJSONArray("stages").getJSONObject(0).getString("stage"))
        }
    }

    @Test
    fun roundTripsStagesTitleAndNotes() {
        val json = night(
            "${stage("rem", "02:00", "02:30")},${stage("light", "23:15", "02:00").replace("-10-02T23", "-10-01T23")}",
            ""","title":"Night","notes":"Slept well","clientId":"s1","clientVersion":3""",
        )
        val record = decode(json)
        assertEquals("Night", record.title)
        assertEquals("Slept well", record.notes)
        assertEquals(Duration.ofHours(8), Duration.between(record.startTime, record.endTime))
        val out = RecordCodec.encode(record, entry)
        assertEquals("special", out.getString("kind"))
        assertEquals("sleepSession", out.getString("type"))
        assertEquals(at("23:00", 1), out.getString("startDate"))
        assertEquals(at("07:00"), out.getString("endDate"))
        assertEquals("Night", out.getString("title"))
        assertEquals("Slept well", out.getString("notes"))
        assertFalse(out.getBoolean("derived"))
        assertFalse(out.has("stageSampleIds"))
        assertEquals("s1", out.getString("clientId"))
        assertEquals(3L, out.getLong("clientVersion"))
        val stages = out.getJSONArray("stages")
        assertEquals(2, stages.length())
        // Sorted by start, in the session's offset.
        assertEquals("light", stages.getJSONObject(0).getString("stage"))
        assertEquals(at("23:15", 1), stages.getJSONObject(0).getString("startDate"))
        assertEquals("rem", stages.getJSONObject(1).getString("stage"))
        assertEquals(at("02:30"), stages.getJSONObject(1).getString("endDate"))
        val native = out.getJSONObject("native")
        assertEquals("SleepSessionRecord", native.getString("type"))
        assertEquals(SleepSessionRecord.STAGE_TYPE_LIGHT, native.getJSONArray("stages").getInt(0))
    }

    @Test
    fun aSessionWithoutStagesOrTextReadsEmpty() {
        val out = RecordCodec.encode(decode(night("", ",\"title\":\"\"")), entry)
        assertEquals(0, out.getJSONArray("stages").length())
        assertFalse(out.has("title"))
        assertFalse(out.has("notes"))
    }

    @Test
    fun stagesTouchingAndWithGapsAreAccepted() {
        val record = decode(night("${stage("light", "00:00", "01:00")},${stage("deep", "01:00", "02:00")},${stage("rem", "03:00", "04:00")}"))
        assertEquals(3, record.stages.size)
    }

    @Test
    fun rejectsWhatHealthConnectWouldBeforeItDoes() {
        assertEquals("outsideSession", reason { decode(night(stage("light", "06:30", "07:30"))) })
        assertEquals("outsideSession", reason { decode(night(stage("light", "22:30", "23:30").replace("-10-02", "-10-01"))) })
        assertEquals("stagesOverlap", reason { decode(night("${stage("light", "00:00", "01:30")},${stage("deep", "01:00", "02:00")}")) })
        assertEquals("endNotAfterStart", reason { decode(night(stage("light", "01:00", "01:00"))) })
        assertEquals("endNotAfterStart", reason { decode("""{"type":"sleepSession","startDate":"${at("07:00")}","endDate":"${at("07:00")}"}""") })
        assertEquals("required", reason { decode("""{"type":"sleepSession","startDate":"${at("07:00")}"}""") })
        val overlap = assertThrows(HealthException::class.java) {
            decode(night("${stage("deep", "01:00", "02:00")},${stage("light", "00:00", "01:30")}"))
        }
        // Named by the caller's indexes, after sorting by start.
        assertEquals("samples[0].stages[0]", overlap.data.getString("field"))
    }

    @Test
    fun rejectsAStageNameItDoesNotKnow() {
        assertEquals("valueUnsupportedOnPlatform", reason { decode(night(stage("nap", "00:00", "01:00"))) })
    }

    @Test
    fun readsSessionsThatStartBeforeTheRange() = runTest {
        val ids = samples.save(JSONArray(listOf(JSONObject(night(stage("asleep", "00:00", "06:00"), ""","clientId":"s1"""")))))
            .getJSONArray("ids")
        // From 03:00 on the morning: the session started at 23:00 the evening before.
        val read = samples.read(Fields(JSONObject("""{"type":"sleepSession","startDate":"${at("03:00")}","endDate":"${at("12:00")}"}""")))
        val list = read.getJSONArray("samples")
        assertEquals(1, list.length())
        assertEquals(ids.getString(0), list.getJSONObject(0).getString("id"))
        assertEquals("asleep", list.getJSONObject(0).getJSONArray("stages").getJSONObject(0).getString("stage"))
        // A range after the session ends finds nothing.
        val later = samples.read(Fields(JSONObject("""{"type":"sleepSession","startDate":"${at("08:00")}","endDate":"${at("12:00")}"}""")))
        assertEquals(0, later.getJSONArray("samples").length())
    }

    @Test
    fun rewritingByClientIdReplacesTheStages() = runTest {
        val first = samples.save(JSONArray(listOf(JSONObject(night(stage("light", "00:00", "01:00"), ""","clientId":"s1"""")))))
        val second = samples.save(
            JSONArray(listOf(JSONObject(night("${stage("asleep", "00:00", "05:00")},${stage("awake", "05:00", "05:10")}", ""","clientId":"s1","clientVersion":2""")))),
        )
        assertEquals(first.getJSONArray("ids").getString(0), second.getJSONArray("ids").getString(0))
        val list = samples.read(Fields(JSONObject("""{"type":"sleepSession","startDate":"${at("00:00")}","endDate":"${at("12:00")}"}"""))).getJSONArray("samples")
        assertEquals(1, list.length())
        assertEquals(2, list.getJSONObject(0).getJSONArray("stages").length())
    }

    @Test
    fun aggregatesTimeAsleepInSeconds() = runTest {
        val requests = mutableListOf<AggregateRequest>()
        client.overrides.aggregate = MutableStub { request: AggregateRequest ->
            requests += request
            @Suppress("UNCHECKED_CAST")
            AggregationResult(metrics = mapOf(SleepSessionRecord.SLEEP_DURATION_TOTAL to Duration.ofMinutes(440)) as Map<AggregateMetric<Any>, Any>)
        }
        val aggregation = Aggregation(client, types) { ZoneId.of("Europe/Berlin") }
        val json = aggregation.aggregate(
            Fields(JSONObject("""{"type":"sleepSession","startDate":"${at("12:00", 1)}","endDate":"${at("12:00")}","metrics":["duration"]}""")),
        )
        val bucket = json.getJSONArray("buckets").getJSONObject(0)
        assertEquals(26400.0, bucket.getJSONObject("values").getDouble("duration"), 0.0)
        assertEquals("s", bucket.getString("unit"))
        val expected = AggregateRequest(
            setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
            TimeRangeFilter.between(Instant.parse("2026-10-01T10:00:00Z"), Instant.parse("2026-10-02T10:00:00Z")),
        )
        assertEquals(expected, requests.single())
    }

    @Test
    fun aggregateRejectsOtherMetrics() = runTest {
        val aggregation = Aggregation(client, types)
        val error = assertThrows(HealthException::class.java) {
            kotlinx.coroutines.runBlocking {
                aggregation.aggregate(Fields(JSONObject("""{"type":"sleepSession","startDate":"${at("12:00", 1)}","endDate":"${at("12:00")}","metrics":["sum"]}""")))
            }
        }
        assertEquals("metricUnsupported", error.data.getString("reason"))
    }
}
