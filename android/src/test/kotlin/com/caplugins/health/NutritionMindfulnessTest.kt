@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package com.caplugins.health

import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.caplugins.health.generated.Registry
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hydration, single nutrients and mindful sessions on Android (T41–T42, decision #61). */
class NutritionMindfulnessTest {
    private val start = "2026-10-01T12:00:00.000+02:00"
    private val end = "2026-10-01T12:20:00.000+02:00"

    private fun decode(json: String) =
        RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), Registry.byId.getValue(JSONObject(json).getString("type"))).primary

    private fun reason(block: () -> Unit): String? =
        assertThrows(HealthException::class.java) { block() }.data?.getString("reason")

    @Test
    fun hydrationRoundTripsInEveryUnit() {
        val record = decode("""{"type":"hydration","startDate":"$start","endDate":"$end","value":12,"unit":"flOz"}""") as HydrationRecord
        assertEquals(12.0, record.volume.inFluidOuncesUs, 1e-9)
        val entry = Registry.byId.getValue("hydration")
        assertEquals(354.88, RecordCodec.encode(record, entry).getDouble("value"), 0.01)
        assertEquals("mL", RecordCodec.encode(record, entry).getString("unit"))
        assertEquals(0.35488, RecordCodec.encode(record, entry, "L").getDouble("value"), 1e-5)
    }

    @Test
    fun hydrationNeedsAnInterval() {
        assertEquals("intervalOnly", reason { decode("""{"type":"hydration","startDate":"$start","value":250}""") })
    }

    @Test
    fun mindfulSessionRoundTripsWithItsType() {
        val record = decode("""{"type":"mindfulSession","startDate":"$start","endDate":"$end","sessionType":"breathing","clientId":"m1"}""") as MindfulnessSessionRecord
        assertEquals(MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_BREATHING, record.mindfulnessSessionType)
        assertEquals(Duration.ofMinutes(20), Duration.between(record.startTime, record.endTime))
        val json = RecordCodec.encode(record, Registry.byId.getValue("mindfulSession"))
        assertEquals("event", json.getString("kind"))
        assertEquals("breathing", json.getString("sessionType"))
        assertEquals(end, json.getString("endDate"))
        assertEquals("m1", json.getString("clientId"))
    }

    @Test
    fun mindfulSessionWithoutATypeStoresUnknownAndReadsNoField() {
        val record = decode("""{"type":"mindfulSession","startDate":"$start","endDate":"$end"}""") as MindfulnessSessionRecord
        assertEquals(MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_UNKNOWN, record.mindfulnessSessionType)
        assertFalse(RecordCodec.encode(record, Registry.byId.getValue("mindfulSession")).has("sessionType"))
    }

    @Test
    fun mindfulSessionTitleAndNotesReadAsMetadata() {
        val record = MindfulnessSessionRecord(
            startTime = Instant.parse("2026-10-01T10:00:00Z"),
            startZoneOffset = ZoneOffset.UTC,
            endTime = Instant.parse("2026-10-01T10:10:00Z"),
            endZoneOffset = ZoneOffset.UTC,
            metadata = Metadata.manualEntry(),
            mindfulnessSessionType = MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_MEDITATION,
            title = "Morning",
            notes = "Calm",
        )
        val metadata = RecordCodec.encode(record, Registry.byId.getValue("mindfulSession")).getJSONObject("metadata")
        assertEquals("Morning", metadata.getString("hc.title"))
        assertEquals("Calm", metadata.getString("hc.notes"))
        assertTrue(metadata.has("hc.lastModifiedTime"))
    }

    @Test
    fun mindfulSessionNeedsAnInterval() {
        assertEquals("intervalOnly", reason { decode("""{"type":"mindfulSession","startDate":"$start","endDate":"$start"}""") })
    }

    @Test
    fun mindfulSessionIsFeatureGated() {
        val types = HealthTypes { false }
        assertEquals("featureUnavailable", reason { types.resolve("mindfulSession") })
        assertEquals("featureUnavailable", types.support("mindfulSession").getString("reason"))
        assertTrue(HealthTypes { true }.support("mindfulSession").getBoolean("writable"))
    }

    @Test
    fun singleNutrientsAreAggregateOnly() {
        val types = HealthTypes { true }
        assertEquals("aggregateOnly", reason { types.resolveSamples("dietaryProtein") })
        val support = types.support("dietaryProtein")
        assertFalse(support.getBoolean("readable"))
        assertFalse(support.getBoolean("writable"))
        assertTrue(support.getBoolean("aggregatable"))
        assertEquals("aggregateOnly", support.getString("reason"))
        assertEquals("android.permission.health.READ_NUTRITION", Registry.byId.getValue("dietaryTransFat").readPermission)
        for ((id, nutrient) in Registry.nutrients) {
            val entry = Registry.byId.getValue("dietary${id.replaceFirstChar { it.uppercase() }}")
            assertEquals(id, nutrient.aggregate, entry.aggregates.getValue("sum"))
        }
    }

    @Test
    fun aggregateMetricsComeFromTheRegistry() {
        // Stubbing these aggregations isn't possible: connect-client's aggregation mappings call SdkExtensions, which
        // the JVM test runtime lacks. They're checked on the API 34 emulator.
        assertEquals(listOf("sum"), Aggregation.metrics(Registry.byId.getValue("hydration")))
        assertEquals(listOf("sum"), Aggregation.metrics(Registry.byId.getValue("dietaryEnergy")))
        // connect-client 1.1.0 can't aggregate mindfulness on Android 14+ (decision #63).
        assertEquals(emptyList<String>(), Aggregation.metrics(Registry.byId.getValue("mindfulSession")))
    }
}
