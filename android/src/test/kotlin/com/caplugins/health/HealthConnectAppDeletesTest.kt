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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Stands in for the `android.os.RemoteException` the app path throws: android.jar's stub drops its message in JVM tests. */
private class AppRemoteException(message: String) : Exception(message)

/**
 * The Health Connect app (Android 13 and lower) rejects a delete by ids or clientIds when any of them doesn't
 * exist (decision #45), or when ids belong to another app (decision #46), and deletes nothing (API 33 emulator,
 * Health Connect 2026.09.03). FakeHealthConnectClient skips missing ones like Android 14 and has no other apps, so
 * this client adds the app's behaviour on top of it: records whose ids are in [othersIds] stand for other apps'.
 */
private class HealthConnectAppClient(private val fake: FakeHealthConnectClient) : HealthConnectClient by fake {
    var deleteCalls = 0
    var failWith: Exception? = null
    val othersIds = mutableSetOf<String>()

    override suspend fun deleteRecords(recordType: KClass<out Record>, recordIdsList: List<String>, clientRecordIdsList: List<String>) {
        deleteCalls++
        failWith?.let { throw it }
        // Ownership is checked first: with another app's id and a missing one, only the ownership error shows.
        val others = recordIdsList.filter { it in othersIds }.sorted()
        if (others.isNotEmpty()) throw SecurityException("${FakeHealthConnectClient.DEFAULT_PACKAGE_NAME} doesn't own data points of the following UIDs: $others")
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
    fun deletingByIdLeavesOtherAppsRecords() = runTest {
        val own = save(flow(1, "c1"), flow(2, "c2"))
        val others = save(flow(3, "o1"), flow(4, "o2"))
        client.othersIds += listOf(others.getString(0), others.getString(1))
        client.deleteCalls = 0
        val ids = JSONArray(listOf(others.getString(1), own.getString(0), others.getString(0), own.getString(1)))
        assertEquals(2, delete("""{"type":"menstrualFlow","ids":$ids}"""))
        // One call rejected with the other apps' ids, then one without them.
        assertEquals(2, client.deleteCalls)
        assertEquals(listOf("o1", "o2"), flowClientIds())
    }

    @Test
    fun deletingOnlyOtherAppsRecordsDeletesNothing() = runTest {
        val others = save(flow(1, "o1"))
        client.othersIds += others.getString(0)
        assertEquals(0, delete("""{"type":"menstrualFlow","ids":["${others.getString(0)}"]}"""))
        assertEquals(listOf("o1"), flowClientIds())
    }

    @Test
    fun deletingOtherAppsAndMissingIdsTogether() = runTest {
        val own = save(flow(1, "c1"))
        val others = save(flow(2, "o1"))
        client.othersIds += others.getString(0)
        val ids = JSONArray(listOf(others.getString(0), "00000000-0000-0000-0000-000000000000", own.getString(0)))
        assertEquals(1, delete("""{"type":"menstrualFlow","ids":$ids}"""))
        assertEquals(listOf("o1"), flowClientIds())
    }

    @Test
    fun aMissingPermissionStillRejects() = runTest {
        val own = save(flow(1, "c1"))
        client.failWith = SecurityException("${FakeHealthConnectClient.DEFAULT_PACKAGE_NAME} lacks the following permissions: [android.permission.health.WRITE_MENSTRUATION]")
        val error = runCatching { delete("""{"type":"menstrualFlow","ids":["${own.getString(0)}"]}""") }.exceptionOrNull()
        assertTrue("$error", error is SecurityException)
    }

    @Test
    fun recognizesTheAppsOwnershipMessage() {
        val message = "com.example doesn't own data points of the following UIDs: [16C8BF1D-6be8-3f8e-a6ba-106b901e7f64, 42ef4031-df36-3b89-8cf5-525f879e0a6e]"
        assertEquals(
            setOf("16c8bf1d-6be8-3f8e-a6ba-106b901e7f64", "42ef4031-df36-3b89-8cf5-525f879e0a6e"),
            HealthException.otherAppsRecordIds(SecurityException(message)),
        )
        assertNull(HealthException.otherAppsRecordIds(SecurityException("com.example lacks the following permissions: [android.permission.health.WRITE_MENSTRUATION]")))
        assertNull(HealthException.otherAppsRecordIds(AppRemoteException("Request contains invalid UID.")))
        // Without the list the ids are found by halving instead.
        assertEquals(emptySet<String>(), HealthException.otherAppsRecordIds(SecurityException("com.example doesn't own data points")))
    }

    @Test
    fun recognizesTheAppsInvalidUidMessages() {
        assertTrue(HealthException.isMissingRecord(AppRemoteException("Request contains invalid UID.")))
        assertTrue(HealthException.isMissingRecord(IllegalStateException(AppRemoteException("Invalid UID not-a-uuid"))))
        assertFalse(HealthException.isMissingRecord(AppRemoteException("Database error")))
    }
}
