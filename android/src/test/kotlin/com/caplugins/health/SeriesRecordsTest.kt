package com.caplugins.health

import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Velocity
import com.caplugins.health.generated.Registry
import com.caplugins.health.generated.RegistryKind
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Series records, read as points and written one point per record (T28, decision #53). */
class SeriesRecordsTest {
    private val client = FakeHealthConnectClient()
    private val encode = { b: ByteArray -> Base64.getEncoder().encodeToString(b) }
    private val decode = { s: String -> Base64.getDecoder().decode(s) }
    private val types = HealthTypes { true }
    private val samples = Samples(client, types, FakeHealthConnectClient.DEFAULT_PACKAGE_NAME, encode, decode)
    private val changes = Changes(client, types, samples, FakeHealthConnectClient.DEFAULT_PACKAGE_NAME, encode, decode)

    private val t0 = Instant.parse("2026-10-01T06:30:00Z")
    private val ist = ZoneOffset.ofHoursMinutes(5, 30)
    private val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-02T00:00:00.000+00:00""""

    /** A heart-rate record holding several points, as a watch app writes them. */
    private suspend fun insertSeries(vararg bpm: Long, clientId: String? = null): String {
        val points = bpm.mapIndexed { i, v -> HeartRateRecord.Sample(t0.plusSeconds(60L * i), v) }
        val metadata = clientId?.let { Metadata.autoRecorded(androidx.health.connect.client.records.metadata.Device(type = 0), it, 1) }
            ?: Metadata.manualEntry()
        val record = HeartRateRecord(t0, ist, t0.plusSeconds(60L * bpm.size), ist, points, metadata)
        return client.insertRecords(listOf(record)).recordIdsList.single()
    }

    private suspend fun read(extra: String = "") = samples.read(Fields(JSONObject("""{"type":"heartRate",$range$extra}""")))

    private fun point(bpm: Double, minute: Int, clientId: String? = null) =
        JSONObject("""{"type":"heartRate","startDate":"2026-10-01T12:0$minute:00.000+05:30","value":$bpm}""").apply {
            clientId?.let { put("clientId", it) }
        }

    @Test
    fun aSeriesRecordReadsAsOnePointEach() = runTest {
        val id = insertSeries(60, 62, 65, clientId = "watch-1")
        val list = read().getJSONArray("samples")
        assertEquals(3, list.length())
        for (i in 0 until 3) {
            val sample = list.getJSONObject(i)
            assertEquals("$id#$i", sample.getString("id"))
            assertEquals(id, sample.getString("seriesId"))
            assertEquals("heartRate", sample.getString("type"))
            assertEquals("watch-1", sample.getString("clientId"))
            assertEquals("count/min", sample.getString("unit"))
            assertEquals(sample.getString("startDate"), sample.getString("endDate"))
            assertEquals("HeartRateRecord", sample.getJSONObject("native").getString("type"))
        }
        assertEquals(listOf(60.0, 62.0, 65.0), (0 until 3).map { list.getJSONObject(it).getDouble("value") })
        assertEquals("2026-10-01T12:01:00.000+05:30", list.getJSONObject(1).getString("startDate"))
    }

    @Test
    fun aWrittenSampleIsAOnePointRecord() = runTest {
        val ids = samples.save(JSONArray(listOf(point(72.0, 0, "hr-1"), point(75.0, 1, "hr-2"), point(80.0, 2)))).getJSONArray("ids")
        val stored = client.readRecords(ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.after(Instant.EPOCH))).records
        assertEquals(3, stored.size)
        assertTrue(stored.all { it.samples.size == 1 && it.startTime == it.endTime && it.samples.single().time == it.startTime })
        assertEquals(setOf("hr-1", "hr-2", null), stored.map { it.metadata.clientRecordId }.toSet())

        val list = read().getJSONArray("samples")
        assertEquals(3, list.length())
        // One point: the sample is the record, with its id and no seriesId.
        assertEquals(ids.getString(0), list.getJSONObject(0).getString("id"))
        assertFalse(list.getJSONObject(0).has("seriesId"))
        assertEquals(72.0, list.getJSONObject(0).getDouble("value"), 0.0)

        // Upserts work per sample, as on iOS.
        samples.save(JSONArray(listOf(point(73.0, 0, "hr-1").put("clientVersion", 2))))
        assertEquals(73.0, read().getJSONArray("samples").getJSONObject(0).getDouble("value"), 0.0)
    }

    @Test
    fun otherUnitsAndRanges() = runTest {
        val speed = JSONObject("""{"type":"speed","startDate":"2026-10-01T12:00:00.000+05:30","value":36,"unit":"km/h"}""")
        samples.save(JSONArray(listOf(speed)))
        val stored = client.readRecords(ReadRecordsRequest(SpeedRecord::class, TimeRangeFilter.after(Instant.EPOCH))).records.single()
        assertEquals(10.0, stored.samples.single().speed.inMetersPerSecond, 1e-9)
        val out = samples.read(Fields(JSONObject("""{"type":"speed",$range,"unit":"km/h"}"""))).getJSONArray("samples").getJSONObject(0)
        assertEquals(36.0, out.getDouble("value"), 1e-9)

        val decodeError = { json: JSONObject -> assertThrows(HealthException::class.java) { RecordCodec.decode(Fields(json, "samples[0]"), Registry.byId.getValue("heartRate")) } }
        assertEquals("outOfRange", decodeError(point(301.0, 0)).data.getString("reason"))
        assertEquals("wholeNumberOnly", decodeError(point(72.5, 0)).data.getString("reason"))
        assertEquals("instantOnly", decodeError(point(72.0, 0).put("endDate", "2026-10-01T12:05:00.000+05:30")).data.getString("reason"))
    }

    @Test
    fun everySeriesTypeRoundTripsInEveryUnit() {
        var checked = 0
        for (entry in Registry.entries) {
            if (entry.kind != RegistryKind.QUANTITY || Registry.seriesAdapters[entry.record] == null) continue
            for (unit in entry.units) {
                val json = JSONObject().put("type", entry.id).put("startDate", "2026-10-01T12:00:00.000+05:30").put("value", 2.0).put("unit", unit)
                val record = RecordCodec.decode(Fields(json, "samples[0]"), entry).primary
                val out = RecordCodec.encodeAll(record, entry, unit).single()
                assertEquals("${entry.id} in $unit", 2.0, out.getDouble("value"), 1e-9)
                checked++
            }
        }
        assertTrue("checked $checked", checked >= 7)
    }

    @Test
    fun pagesCountRecordsNotPoints() = runTest {
        insertSeries(60, 61, 62)
        insertSeries(70, 71)
        val first = read(""","limit":1""")
        assertEquals(3, first.getJSONArray("samples").length())
        assertTrue(first.has("nextCursor"))
        val second = read(""","limit":1,"cursor":"${first.getString("nextCursor")}"""")
        assertEquals(2, second.getJSONArray("samples").length())
        assertFalse(second.has("nextCursor"))
    }

    @Test
    fun aPointIdDeletesItsWholeRecord() = runTest {
        val series = insertSeries(60, 61, 62)
        val single = samples.save(JSONArray(listOf(point(80.0, 5)))).getJSONArray("ids").getString(0)
        val deleted = samples.delete(Fields(JSONObject("""{"type":"heartRate","ids":["$series#1","$series#2"]}"""))).getInt("deleted")
        assertEquals(1, deleted)
        val left = read().getJSONArray("samples")
        assertEquals(1, left.length())
        assertEquals(single, left.getJSONObject(0).getString("id"))
    }

    @Test
    fun changesFlattenUpsertsAndNameTheDeletedRecord() = runTest {
        val cursor = changes.changes(Fields(JSONObject("""{"types":["heartRate"]}"""))).getString("nextCursor")
        val series = insertSeries(60, 61)
        val second = changes.changes(Fields(JSONObject("""{"types":["heartRate"],"cursor":"$cursor"}""")))
        val upserted = second.getJSONArray("upserted")
        assertEquals(2, upserted.length())
        assertEquals(series, upserted.getJSONObject(1).getString("seriesId"))

        samples.delete(Fields(JSONObject("""{"type":"heartRate","ids":["$series#0"]}""")))
        val third = changes.changes(Fields(JSONObject("""{"types":["heartRate"],"cursor":"${second.getString("nextCursor")}"}""")))
        val deleted = third.getJSONArray("deleted")
        assertEquals(1, deleted.length())
        assertEquals(series, deleted.getJSONObject(0).getString("id"))
        assertEquals("heartRate", deleted.getJSONObject(0).getString("type"))
    }

    @Test
    fun speedPointsKeepTheirUnitObject() {
        val record = SpeedRecord(t0, ist, t0.plusSeconds(10), ist, listOf(SpeedRecord.Sample(t0, Velocity.metersPerSecond(2.5))), Metadata.manualEntry())
        val out = RecordCodec.encodeAll(record, Registry.byId.getValue("speed"), "m/s").single()
        assertEquals(2.5, out.getDouble("value"), 1e-9)
        assertEquals("2026-10-01T12:00:00.000+05:30", out.getString("startDate"))
    }
}
