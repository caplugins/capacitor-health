package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.util.Base64
import kotlin.reflect.KClass
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Stands in for the `android.os.RemoteException` the app path throws: android.jar's stub drops its message in JVM tests. */
private class AppRemoteException(message: String) : Exception(message)

/**
 * The Health Connect app (Android 13 and lower) rejects a delete by ids or clientIds when any of them doesn't
 * exist, and deletes nothing (API 33 emulator, Health Connect 2026.09.03, decision #45). FakeHealthConnectClient
 * skips missing ones like Android 14, so this client adds the app's behaviour on top of it.
 */
private class HealthConnectAppClient(private val fake: FakeHealthConnectClient) : HealthConnectClient by fake {
    var deleteCalls = 0
    var failWith: Exception? = null

    override suspend fun deleteRecords(recordType: KClass<out Record>, recordIdsList: List<String>, clientRecordIdsList: List<String>) {
        deleteCalls++
        failWith?.let { throw it }
        @Suppress("UNCHECKED_CAST")
        val stored = fake.readRecords(ReadRecordsRequest(recordType as KClass<Record>, TimeRangeFilter.between(Instant.EPOCH, Instant.parse("2100-01-01T00:00:00Z")))).records
        val ids = stored.map { it.metadata.id }.toSet()
        val clientIds = stored.mapNotNull { it.metadata.clientRecordId }.toSet()
        if (!ids.containsAll(recordIdsList) || !clientIds.containsAll(clientRecordIdsList)) throw AppRemoteException("Request contains invalid UID.")
        fake.deleteRecords(recordType, recordIdsList, clientRecordIdsList)
    }
}

class HealthConnectAppDeletesTest {
    private val client = HealthConnectAppClient(FakeHealthConnectClient())
    private val samples = Samples(
        client,
        HealthTypes { true },
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-31T00:00:00.000+00:00""""

    private fun flow(minute: Int, clientId: String? = null) =
        JSONObject("""{"type":"menstrualFlow","startDate":"2026-10-05T10:${"%02d".format(minute)}:00.000+00:00","value":"light"}""").apply {
            clientId?.let { put("clientId", it) }
        }

    private suspend fun save(vararg samples: JSONObject) = this.samples.save(JSONArray(samples.toList())).getJSONArray("ids")

    private suspend fun delete(json: String) = samples.delete(Fields(JSONObject(json))).getInt("deleted")

    private suspend fun flowClientIds(): List<String> {
        val list = samples.read(Fields(JSONObject("""{"type":"menstrualFlow",$range}"""))).getJSONArray("samples")
        return (0 until list.length()).map { list.getJSONObject(it).optString("clientId") }
    }

    @Test
    fun deletingByClientIdSkipsMissingOnes() = runTest {
        save(flow(1, "c1"), flow(2, "c2"), flow(3, "c3"))
        assertEquals(2, delete("""{"type":"menstrualFlow","clientIds":["c1","missing","c3"]}"""))
        assertEquals(listOf("c2"), flowClientIds())
        assertEquals(0, delete("""{"type":"menstrualFlow","clientIds":["c1"]}"""))
    }

    @Test
    fun deletingByIdSkipsMissingOnes() = runTest {
        val ids = save(flow(1), flow(2))
        assertEquals(1, delete("""{"type":"menstrualFlow","ids":["${ids.getString(0)}","00000000-0000-0000-0000-000000000000"]}"""))
        assertEquals(1, flowClientIds().size)
    }

    @Test
    fun aMissingKeyCostsAFewCallsNotOnePerKey() = runTest {
        save(*(0 until 64).map { flow(it % 60, "c$it") }.toTypedArray())
        val clientIds = (0 until 64).map { if (it == 37) "missing" else "c$it" }
        client.deleteCalls = 0
        assertEquals(63, delete("""{"type":"menstrualFlow","clientIds":${JSONArray(clientIds)}}"""))
        // One failed call for the whole list, then two per halving down to the missing key: 1 + 2 × log2(64).
        assertTrue("${client.deleteCalls} calls", client.deleteCalls <= 13)
        assertEquals(listOf("c37"), flowClientIds())
    }

    @Test
    fun rewritingAndDeletingAPeriodWithoutDayFlows() = runTest {
        // The acceptance runner's case: no `flow`, so every day clientId the plugin cleans up is missing.
        val period = """{"type":"menstruationPeriod","startDate":"2026-10-02T00:00:00.000+00:00","endDate":"2026-10-04T00:00:00.000+00:00","clientId":"p"}"""
        save(JSONObject(period))
        save(JSONObject(period).put("clientVersion", 2).put("endDate", "2026-10-05T00:00:00.000+00:00"))
        assertEquals(1, delete("""{"type":"menstruationPeriod","clientIds":["p"]}"""))
        assertEquals(0, delete("""{"type":"menstruationPeriod",$range}"""))
    }

    @Test
    fun deletingAPeriodKeepsOtherFlowsAndDropsItsOwn() = runTest {
        val period = JSONObject(
            """{"type":"menstruationPeriod","startDate":"2026-10-02T00:00:00.000+00:00","endDate":"2026-10-04T00:00:00.000+00:00","clientId":"p","flow":{"2026-10-02":"heavy"}}""",
        )
        save(period, flow(1, "other"))
        assertEquals(1, delete("""{"type":"menstruationPeriod","clientIds":["p"]}"""))
        assertEquals(listOf("other"), flowClientIds())
    }

    @Test
    fun otherDeleteErrorsStillReject() = runTest {
        save(flow(1, "c1"))
        client.failWith = AppRemoteException("Database error")
        val error = runCatching { delete("""{"type":"menstrualFlow","clientIds":["c1","missing"]}""") }.exceptionOrNull()
        assertEquals("Database error", error?.message)
    }

    @Test
    fun recognizesTheAppsInvalidUidMessages() {
        assertTrue(HealthException.isMissingRecord(AppRemoteException("Request contains invalid UID.")))
        assertTrue(HealthException.isMissingRecord(IllegalStateException(AppRemoteException("Invalid UID not-a-uuid"))))
        assertFalse(HealthException.isMissingRecord(AppRemoteException("Database error")))
    }
}
