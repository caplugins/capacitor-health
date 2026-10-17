package com.caplugins.health

import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.testing.FakeHealthConnectClient
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SamplesTest {
    private val client = FakeHealthConnectClient()
    private val samples = Samples(
        client,
        HealthTypes { true },
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-31T00:00:00.000+00:00""""

    private fun flow(day: Int, value: String, clientId: String? = null, version: Int = 1) =
        JSONObject("""{"type":"menstrualFlow","startDate":"2026-10-${"%02d".format(day)}T12:00:00.000+00:00","value":"$value"}""").apply {
            clientId?.let { put("clientId", it).put("clientVersion", version) }
        }

    private suspend fun save(vararg samples: JSONObject) = this.samples.save(JSONArray(samples.toList())).getJSONArray("ids")

    private suspend fun read(extra: String = "") = samples.read(Fields(JSONObject("""{"type":"menstrualFlow",$range$extra}""")))

    @Test
    fun savesAndReadsBack() = runTest {
        val ids = save(flow(1, "light", "c1"), flow(2, "heavy"))
        val result = read()
        val list = result.getJSONArray("samples")
        assertEquals(2, list.length())
        assertEquals(ids.getString(0), list.getJSONObject(0).getString("id"))
        assertEquals("light", list.getJSONObject(0).getString("value"))
        assertEquals("c1", list.getJSONObject(0).getString("clientId"))
        assertFalse(result.has("nextCursor"))
    }

    @Test
    fun upsertsByClientId() = runTest {
        val first = save(flow(1, "light", "c1"))
        val second = save(flow(1, "heavy", "c1", version = 2))
        assertEquals(first.getString(0), second.getString(0))
        val list = read().getJSONArray("samples")
        assertEquals(1, list.length())
        assertEquals("heavy", list.getJSONObject(0).getString("value"))
    }

    @Test
    fun pagesWithCursors() = runTest {
        save(*(1..5).map { flow(it, "medium") }.toTypedArray())
        val seen = mutableListOf<String>()
        var cursor: String? = null
        var pages = 0
        do {
            val page = read(""","limit":2${cursor?.let { ""","cursor":"$it"""" } ?: ""}""")
            val list = page.getJSONArray("samples")
            (0 until list.length()).forEach { seen += list.getJSONObject(it).getString("startDate") }
            cursor = if (page.has("nextCursor")) page.getString("nextCursor") else null
            pages++
        } while (cursor != null)
        assertEquals(3, pages)
        assertEquals((1..5).map { "2026-10-0${it}T12:00:00.000+00:00" }, seen)
    }

    // FakeHealthConnectClient ignores ascendingOrder, so descending reads are checked on the emulator.

    @Test
    fun cursorFromAnotherTypeRejects() = runTest {
        save(flow(1, "light"), flow(2, "light"))
        val cursor = read(""","limit":1""").getString("nextCursor")
        val error = assertThrows(HealthException::class.java) {
            kotlinx.coroutines.runBlocking {
                samples.read(Fields(JSONObject("""{"type":"ovulationTest",$range,"cursor":"$cursor"}""")))
            }
        }
        assertEquals("cursorMismatch", error.data.getString("reason"))
    }

    @Test
    fun filtersBySource() = runTest {
        save(flow(1, "light"))
        assertEquals(1, read(""","sourceIds":["${FakeHealthConnectClient.DEFAULT_PACKAGE_NAME}"]""").getJSONArray("samples").length())
        assertEquals(0, read(""","sourceIds":["com.other.app"]""").getJSONArray("samples").length())
    }

    @Test
    fun computesCycleStartFromPeriods() = runTest {
        save(
            JSONObject("""{"type":"menstruationPeriod","startDate":"2026-10-02T00:00:00.000+00:00","endDate":"2026-10-04T00:00:00.000+00:00"}"""),
            flow(1, "light"),
            flow(2, "heavy"),
            flow(3, "medium"),
        )
        val list = read().getJSONArray("samples")
        val byDay = (0 until list.length()).associate { list.getJSONObject(it).getString("startDate").substring(0, 10) to list.getJSONObject(it) }
        assertFalse(byDay.getValue("2026-10-01").has("isCycleStart"))
        assertTrue(byDay.getValue("2026-10-02").getBoolean("isCycleStart"))
        assertFalse(byDay.getValue("2026-10-03").getBoolean("isCycleStart"))
    }

    @Test
    fun periodWithFlowReturnsThePeriodId() = runTest {
        val ids = save(
            JSONObject("""{"type":"menstruationPeriod","startDate":"2026-10-02T00:00:00.000+00:00","endDate":"2026-10-03T00:00:00.000+00:00","clientId":"p","flow":{"2026-10-02":"heavy"}}"""),
        )
        // FakeHealthConnectClient.readRecord can't find ids derived from a clientRecordId, so read the range.
        val periods = samples.read(Fields(JSONObject("""{"type":"menstruationPeriod",$range}"""))).getJSONArray("samples")
        assertEquals(ids.getString(0), periods.getJSONObject(0).getString("id"))
        assertEquals("p", periods.getJSONObject(0).getString("clientId"))
        val flows = read().getJSONArray("samples")
        assertEquals(1, flows.length())
        assertEquals("p:2026-10-02", flows.getJSONObject(0).getString("clientId"))
        assertTrue(flows.getJSONObject(0).getBoolean("isCycleStart"))
    }

    @Test
    fun deletesByClientIdAndCounts() = runTest {
        save(flow(1, "light", "c1"), flow(2, "light", "c2"), flow(3, "light", "c3"))
        val result = samples.delete(Fields(JSONObject("""{"type":"menstrualFlow","clientIds":["c1","c3"]}""")))
        assertEquals(2, result.getInt("deleted"))
        assertEquals(1, read().getJSONArray("samples").length())
    }

    @Test
    fun deletesByIdAndRange() = runTest {
        val ids = save(flow(1, "light"), flow(2, "light"), flow(20, "light"))
        assertEquals(1, samples.delete(Fields(JSONObject("""{"type":"menstrualFlow","ids":["${ids.getString(0)}"]}"""))).getInt("deleted"))
        val ranged = samples.delete(Fields(JSONObject("""{"type":"menstrualFlow","startDate":"2026-10-15T00:00:00.000+00:00","endDate":"2026-10-25T00:00:00.000+00:00"}""")))
        assertEquals(1, ranged.getInt("deleted"))
        assertEquals(1, read().getJSONArray("samples").length())
    }

    @Test
    fun chunksLargeWrites() = runTest {
        val many = (0 until 2500).map { i ->
            JSONObject("""{"type":"menstrualFlow","startDate":"${Instant.parse("2026-10-01T00:00:00Z").plusSeconds(i * 60L).atOffset(ZoneOffset.UTC)}","value":"light"}""")
        }
        val ids = samples.save(JSONArray(many)).getJSONArray("ids")
        assertEquals(2500, ids.length())
        assertNotEquals(ids.getString(0), ids.getString(2499))
    }

    @Test
    fun readsRecordsOtherAppsWrote() = runTest {
        client.insertRecords(listOf(MenstruationFlowRecord(Instant.parse("2026-10-05T10:00:00Z"), ZoneOffset.UTC, Metadata.manualEntry(), MenstruationFlowRecord.FLOW_LIGHT)))
        assertEquals(1, read().getJSONArray("samples").length())
    }

    private fun period(end: String, version: Int, flow: String) =
        JSONObject("""{"type":"menstruationPeriod","startDate":"2026-10-02T00:00:00.000+00:00","endDate":"$end","clientId":"p","clientVersion":$version,"flow":$flow}""")

    @Test
    fun rewritingAPeriodReplacesItsDayFlows() = runTest {
        save(period("2026-10-04T00:00:00.000+00:00", 1, """{"2026-10-02":"heavy","2026-10-03":"medium","2026-10-04":"light"}"""))
        assertEquals(3, read().getJSONArray("samples").length())
        save(period("2026-10-03T00:00:00.000+00:00", 2, """{"2026-10-02":"heavy"}"""))
        val flows = read().getJSONArray("samples")
        assertEquals(1, flows.length())
        assertEquals("p:2026-10-02", flows.getJSONObject(0).getString("clientId"))
    }

    @Test
    fun deletingAPeriodDeletesItsDayFlows() = runTest {
        save(period("2026-10-04T00:00:00.000+00:00", 1, """{"2026-10-02":"heavy","2026-10-03":"medium"}"""), flow(10, "light"))
        val result = samples.delete(Fields(JSONObject("""{"type":"menstruationPeriod","clientIds":["p"]}""")))
        assertEquals(1, result.getInt("deleted"))
        val flows = read().getJSONArray("samples")
        assertEquals(1, flows.length())
        assertEquals("2026-10-10T12:00:00.000+00:00", flows.getJSONObject(0).getString("startDate"))
    }
}
