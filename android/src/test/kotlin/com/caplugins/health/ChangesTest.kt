package com.caplugins.health

import androidx.health.connect.client.testing.FakeHealthConnectClient
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangesTest {
    private val client = FakeHealthConnectClient()
    private val encode = { b: ByteArray -> Base64.getEncoder().encodeToString(b) }
    private val decode = { s: String -> Base64.getDecoder().decode(s) }
    private val types = HealthTypes { true }
    private val samples = Samples(client, types, encode, decode)
    private val changes = Changes(client, types, samples, FakeHealthConnectClient.DEFAULT_PACKAGE_NAME, encode, decode)

    private suspend fun call(json: String) = changes.changes(Fields(JSONObject(json)))

    private suspend fun write(clientId: String) =
        samples.save(JSONArray(listOf(JSONObject("""{"type":"ovulationTest","startDate":"2026-10-01T08:00:00.000+00:00","value":"negative","clientId":"$clientId"}""")))).getJSONArray("ids").getString(0)

    @Test
    fun noCursorReturnsOnlyACursor() = runTest {
        write("before")
        val first = call("""{"types":["ovulationTest","menstrualFlow"]}""")
        assertEquals(0, first.getJSONArray("upserted").length())
        assertEquals(0, first.getJSONArray("deleted").length())
        assertFalse(first.getBoolean("hasMore"))
        val tokens = JSONObject(String(decode(first.getString("nextCursor")!!))).getJSONObject("tokens")
        assertEquals(setOf("ovulationTest", "menstrualFlow"), tokens.keys().asSequence().toSet())
    }

    @Test
    fun reportsUpsertsAndDeletions() = runTest {
        val cursor = call("""{"types":["ovulationTest"]}""").getString("nextCursor")
        val id = write("c1")
        val second = call("""{"types":["ovulationTest"],"cursor":"$cursor"}""")
        val upserted = second.getJSONArray("upserted")
        assertEquals(1, upserted.length())
        assertEquals("c1", upserted.getJSONObject(0).getString("clientId"))

        samples.delete(Fields(JSONObject("""{"type":"ovulationTest","clientIds":["c1"]}""")))
        val third = call("""{"types":["ovulationTest"],"cursor":"${second.getString("nextCursor")}"}""")
        val deleted = third.getJSONArray("deleted")
        assertEquals(1, deleted.length())
        assertEquals(id, deleted.getJSONObject(0).getString("id"))
        assertEquals("ovulationTest", deleted.getJSONObject(0).getString("type"))
        assertFalse(deleted.getJSONObject(0).has("clientId"))
    }

    @Test
    fun excludesOwnWrites() = runTest {
        val cursor = call("""{"types":["ovulationTest"]}""").getString("nextCursor")
        write("c1")
        assertEquals(0, call("""{"types":["ovulationTest"],"cursor":"$cursor","excludeOwnWrites":true}""").getJSONArray("upserted").length())
    }

    @Test
    fun expiredTokenIsCursorExpired() = runTest {
        val cursor = call("""{"types":["ovulationTest"]}""").getString("nextCursor")
        val token = JSONObject(String(decode(cursor!!))).getJSONObject("tokens").getString("ovulationTest")
        client.expireToken(token)
        val error = runCatching { call("""{"types":["ovulationTest"],"cursor":"$cursor"}""") }.exceptionOrNull() as HealthException
        assertEquals(HealthException.CURSOR_EXPIRED, error.code)
        assertEquals("ovulationTest", error.data.getString("type"))
    }

    @Test
    fun cursorMustMatchTheTypes() = runTest {
        val cursor = call("""{"types":["ovulationTest"]}""").getString("nextCursor")
        val error = runCatching { call("""{"types":["ovulationTest","menstrualFlow"],"cursor":"$cursor"}""") }.exceptionOrNull() as HealthException
        assertEquals("cursorMismatch", error.data.getString("reason"))
        val garbage = runCatching { call("""{"types":["ovulationTest"],"cursor":"bm9wZQ=="}""") }.exceptionOrNull() as HealthException
        assertEquals("cursor", garbage.data.getString("field"))
    }

    @Test
    fun pagesWithHasMore() = runTest {
        client.pageSizeGetChanges = 2
        val cursor = call("""{"types":["ovulationTest"]}""").getString("nextCursor")
        (1..3).forEach { write("p$it") }
        val first = call("""{"types":["ovulationTest"],"cursor":"$cursor"}""")
        assertTrue(first.getBoolean("hasMore"))
        assertEquals(2, first.getJSONArray("upserted").length())
        val second = call("""{"types":["ovulationTest"],"cursor":"${first.getString("nextCursor")}"}""")
        assertFalse(second.getBoolean("hasMore"))
        assertEquals(1, second.getJSONArray("upserted").length())
    }

    @Test
    fun unknownTypesReject() {
        assertThrows(HealthException::class.java) { kotlinx.coroutines.runBlocking { call("""{"types":["acne"]}""") } }
    }
}
