package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.testing.FakeHealthConnectClient
import java.util.Base64
import kotlin.reflect.KClass
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Android 14's Health Connect rejects a delete by ids that includes another app's record with an
 * `IllegalArgumentException` naming only the first such record it stores, and deletes nothing, not even the caller's
 * own ids (decision #47; API 34 emulator, Health Connect module 360915160). Missing ids are skipped.
 * FakeHealthConnectClient has no other apps, so this client adds that on top of it: records whose ids are in
 * [othersIds] stand for other apps', stored in the order they were added.
 */
private class PlatformClient(private val fake: FakeHealthConnectClient) : HealthConnectClient by fake {
    var deleteCalls = 0
    var failWith: Exception? = null
    val othersIds = linkedSetOf<String>()

    override suspend fun deleteRecords(recordType: KClass<out Record>, recordIdsList: List<String>, clientRecordIdsList: List<String>) {
        deleteCalls++
        failWith?.let { throw it }
        othersIds.firstOrNull { it in recordIdsList }?.let {
            // `connect-client` 1.1.0 rethrows the platform's HealthConnectException as an IllegalArgumentException.
            throw IllegalArgumentException("android.health.connect.HealthConnectException: java.lang.IllegalArgumentException: 1 is not the owner for $it")
        }
        fake.deleteRecords(recordType, recordIdsList, clientRecordIdsList)
    }
}

class PlatformOtherAppsDeletesTest {
    private val client = PlatformClient(FakeHealthConnectClient())
    private val samples = Samples(
        client,
        HealthTypes { true },
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-31T00:00:00.000+00:00""""

    private fun flow(minute: Int, clientId: String) =
        JSONObject("""{"type":"menstrualFlow","startDate":"2026-10-05T10:${"%02d".format(minute)}:00.000+00:00","value":"light","clientId":"$clientId"}""")

    private suspend fun save(vararg samples: JSONObject) = this.samples.save(JSONArray(samples.toList())).getJSONArray("ids")

    private suspend fun delete(json: String) = samples.delete(Fields(JSONObject(json))).getInt("deleted")

    private suspend fun flowClientIds(): List<String> {
        val list = samples.read(Fields(JSONObject("""{"type":"menstrualFlow",$range}"""))).getJSONArray("samples")
        return (0 until list.length()).map { list.getJSONObject(it).optString("clientId") }
    }

    @Test
    fun deletingByIdLeavesOtherAppsRecords() = runTest {
        val own = save(flow(1, "c1"), flow(2, "c2"))
        val others = save(flow(3, "o1"), flow(4, "o2"))
        client.othersIds += listOf(others.getString(0), others.getString(1))
        client.deleteCalls = 0
        val ids = JSONArray(listOf(others.getString(1), own.getString(0), others.getString(0), own.getString(1)))
        assertEquals(2, delete("""{"type":"menstrualFlow","ids":$ids}"""))
        // Each rejection names one other app's id: two rejected calls, then one without them.
        assertEquals(3, client.deleteCalls)
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
        val ids = JSONArray(listOf("00000000-0000-0000-0000-000000000000", others.getString(0), own.getString(0)))
        assertEquals(1, delete("""{"type":"menstrualFlow","ids":$ids}"""))
        assertEquals(listOf("o1"), flowClientIds())
    }

    @Test
    fun otherInvalidArgumentsStillReject() = runTest {
        val own = save(flow(1, "c1"))
        client.failWith = IllegalArgumentException("Invalid UUID string: not-a-uuid")
        val error = runCatching { delete("""{"type":"menstrualFlow","ids":["${own.getString(0)}"]}""") }.exceptionOrNull()
        assertTrue("$error", error is IllegalArgumentException)
        assertEquals(listOf("c1"), flowClientIds())
    }

    @Test
    fun recognizesThePlatformOwnershipMessage() {
        val message = "android.health.connect.HealthConnectException: java.lang.IllegalArgumentException: 1 is not the owner for 27B5BAEF-10be-3810-abda-01c1bd404c17"
        assertEquals(setOf("27b5baef-10be-3810-abda-01c1bd404c17"), HealthException.otherAppsRecordIds(IllegalArgumentException(message)))
        assertEquals(
            setOf("27b5baef-10be-3810-abda-01c1bd404c17"),
            HealthException.otherAppsRecordIds(IllegalStateException(IllegalArgumentException(message))),
        )
        assertNull(HealthException.otherAppsRecordIds(IllegalArgumentException("Invalid UUID string: not-a-uuid")))
        // Without the id it's found by halving instead.
        assertEquals(emptySet<String>(), HealthException.otherAppsRecordIds(IllegalArgumentException("1 is not the owner for")))
    }
}
