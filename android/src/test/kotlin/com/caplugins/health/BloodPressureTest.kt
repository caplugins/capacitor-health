package com.caplugins.health

import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.testing.FakeHealthConnectClient
import com.caplugins.health.generated.Registry
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class BloodPressureTest {
    private val entry = Registry.byId.getValue("bloodPressure")
    private val noon = "2026-10-01T12:00:00.000+05:30"

    private fun reading(extra: String = "") = JSONObject("""{"type":"bloodPressure","startDate":"$noon","systolic":120,"diastolic":80$extra}""")

    private fun decode(json: JSONObject) = RecordCodec.decode(Fields(json, "samples[0]"), entry).primary

    @Test
    fun roundTrip() {
        val record = decode(reading(""","bodyPosition":"sittingDown","measurementLocation":"leftUpperArm","clientId":"bp1"""")) as BloodPressureRecord
        assertEquals(120.0, record.systolic.inMillimetersOfMercury, 1e-9)
        assertEquals(80.0, record.diastolic.inMillimetersOfMercury, 1e-9)
        assertEquals(BloodPressureRecord.BODY_POSITION_SITTING_DOWN, record.bodyPosition)
        assertEquals(BloodPressureRecord.MEASUREMENT_LOCATION_LEFT_UPPER_ARM, record.measurementLocation)
        val json = RecordCodec.encodeAll(record, entry).single()
        assertEquals("special", json.getString("kind"))
        assertEquals(120.0, json.getDouble("systolic"), 1e-9)
        assertEquals(80.0, json.getDouble("diastolic"), 1e-9)
        assertEquals("mmHg", json.getString("unit"))
        assertEquals("sittingDown", json.getString("bodyPosition"))
        assertEquals("leftUpperArm", json.getString("measurementLocation"))
        assertEquals(noon, json.getString("startDate"))
        assertEquals("bp1", json.getString("clientId"))
        assertFalse(json.has("value"))
    }

    @Test
    fun absentFieldsStayAbsent() {
        val record = decode(reading()) as BloodPressureRecord
        assertEquals(BloodPressureRecord.BODY_POSITION_UNKNOWN, record.bodyPosition)
        val json = RecordCodec.encodeAll(record, entry).single()
        assertFalse(json.has("bodyPosition"))
        assertFalse(json.has("measurementLocation"))
    }

    @Test
    fun rangesAndShape() {
        val high = assertThrows(HealthException::class.java) { decode(reading().put("systolic", 250)) }
        assertEquals("outOfRange", high.data.getString("reason"))
        assertEquals("samples[0].systolic", high.data.getString("field"))
        val low = assertThrows(HealthException::class.java) { decode(reading().put("diastolic", 5)) }
        assertEquals("samples[0].diastolic", low.data.getString("field"))
        val interval = assertThrows(HealthException::class.java) { decode(reading().put("endDate", "2026-10-01T12:05:00.000+05:30")) }
        assertEquals("instantOnly", interval.data.getString("reason"))
    }

    @Test
    fun savesAndReads() = runTest {
        val client = FakeHealthConnectClient()
        val samples = Samples(
            client,
            HealthTypes { true },
            FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
            encodeBase64 = { Base64.getEncoder().encodeToString(it) },
            decodeBase64 = { Base64.getDecoder().decode(it) },
        )
        samples.save(JSONArray(listOf(reading(""","clientId":"bp1""""))))
        samples.save(JSONArray(listOf(reading(""","clientId":"bp1","clientVersion":2""").put("systolic", 118))))
        val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-02T00:00:00.000+00:00""""
        val list = samples.read(Fields(JSONObject("""{"type":"bloodPressure",$range}"""))).getJSONArray("samples")
        assertEquals(1, list.length())
        assertEquals(118.0, list.getJSONObject(0).getDouble("systolic"), 1e-9)
    }
}
