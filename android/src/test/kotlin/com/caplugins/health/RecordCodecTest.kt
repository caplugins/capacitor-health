package com.caplugins.health

import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BodyTemperatureMeasurementLocation
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.SexualActivityRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.metadata.Device
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

class RecordCodecTest {
    private val noon = "2026-10-01T12:00:00.000+05:30"
    private val ist = ZoneOffset.ofHoursMinutes(5, 30)

    private fun decode(json: String) = RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), Registry.byId.getValue(JSONObject(json).getString("type")))

    private fun encode(json: String, unit: String? = null) =
        decode(json).primary.let { RecordCodec.encode(it, Registry.byId.getValue(JSONObject(json).getString("type")), unit) }

    @Test
    fun menstrualFlow() {
        val record = decode("""{"type":"menstrualFlow","startDate":"$noon","value":"heavy","clientId":"f1","clientVersion":2,"recordingMethod":"manual"}""").primary as MenstruationFlowRecord
        assertEquals(MenstruationFlowRecord.FLOW_HEAVY, record.flow)
        assertEquals(ist, record.zoneOffset)
        assertEquals(Instant.parse("2026-10-01T06:30:00Z"), record.time)
        assertEquals("f1", record.metadata.clientRecordId)
        assertEquals(2L, record.metadata.clientRecordVersion)
        assertEquals(Metadata.RECORDING_METHOD_MANUAL_ENTRY, record.metadata.recordingMethod)

        val json = RecordCodec.encode(record, Registry.byId.getValue("menstrualFlow"), isCycleStart = true)
        assertEquals("heavy", json.getString("value"))
        assertEquals("category", json.getString("kind"))
        assertEquals(noon, json.getString("startDate"))
        assertEquals(noon, json.getString("endDate"))
        assertEquals("+05:30", json.getString("zoneOffset"))
        assertEquals("manual", json.getString("recordingMethod"))
        assertEquals("f1", json.getString("clientId"))
        assertEquals(2L, json.getLong("clientVersion"))
        assertTrue(json.getBoolean("isCycleStart"))
        assertEquals("MenstruationFlowRecord", json.getJSONObject("native").getString("type"))
        assertEquals(MenstruationFlowRecord.FLOW_HEAVY, json.getJSONObject("native").getInt("value"))
        assertEquals("android", json.getString("platform"))
    }

    @Test
    fun clientVersionDefaultsToOne() {
        val record = decode("""{"type":"ovulationTest","startDate":"$noon","value":"lhSurge","clientId":"o1"}""").primary as OvulationTestRecord
        assertEquals(1L, record.metadata.clientRecordVersion)
        assertEquals(OvulationTestRecord.RESULT_POSITIVE, record.result)
        assertEquals(Metadata.RECORDING_METHOD_UNKNOWN, record.metadata.recordingMethod)
        assertEquals("estrogenSurge", RecordCodec.encode(OvulationTestRecord(record.time, ist, OvulationTestRecord.RESULT_HIGH, record.metadata), Registry.byId.getValue("ovulationTest")).getString("value"))
    }

    @Test
    fun noneFlowIsNotStorable() {
        val error = assertThrows(HealthException::class.java) { decode("""{"type":"menstrualFlow","startDate":"$noon","value":"none"}""") }
        assertEquals("valueUnsupportedOnPlatform", error.data.getString("reason"))
        assertEquals("samples[0].value", error.data.getString("field"))
    }

    @Test
    fun instantRecordsRejectIntervals() {
        val error = assertThrows(HealthException::class.java) {
            decode("""{"type":"intermenstrualBleeding","startDate":"$noon","endDate":"2026-10-01T13:00:00.000+05:30"}""")
        }
        assertEquals("instantOnly", error.data.getString("reason"))
        assertTrue(decode("""{"type":"intermenstrualBleeding","startDate":"$noon","endDate":"$noon"}""").primary is IntermenstrualBleedingRecord)
    }

    @Test
    fun cervicalMucusSensation() {
        val record = decode("""{"type":"cervicalMucus","startDate":"$noon","value":"unusual","sensation":"light"}""").primary as CervicalMucusRecord
        assertEquals(CervicalMucusRecord.APPEARANCE_UNUSUAL, record.appearance)
        assertEquals(CervicalMucusRecord.SENSATION_LIGHT, record.sensation)
        assertEquals("light", RecordCodec.encode(record, Registry.byId.getValue("cervicalMucus")).getString("sensation"))

        val unknown = decode("""{"type":"cervicalMucus","startDate":"$noon","value":"dry"}""").primary as CervicalMucusRecord
        assertEquals(CervicalMucusRecord.SENSATION_UNKNOWN, unknown.sensation)
        assertFalse(RecordCodec.encode(unknown, Registry.byId.getValue("cervicalMucus")).has("sensation"))
    }

    @Test
    fun sexualActivityProtection() {
        val record = decode("""{"type":"sexualActivity","startDate":"$noon","protectionUsed":true}""").primary as SexualActivityRecord
        assertEquals(SexualActivityRecord.PROTECTION_USED_PROTECTED, record.protectionUsed)
        val json = RecordCodec.encode(record, Registry.byId.getValue("sexualActivity"))
        assertTrue(json.getBoolean("protectionUsed"))
        assertEquals("event", json.getString("kind"))
        assertFalse(json.has("value"))
        val unknown = decode("""{"type":"sexualActivity","startDate":"$noon"}""").primary as SexualActivityRecord
        assertEquals(SexualActivityRecord.PROTECTION_USED_UNKNOWN, unknown.protectionUsed)
        assertFalse(RecordCodec.encode(unknown, Registry.byId.getValue("sexualActivity")).has("protectionUsed"))
    }

    @Test
    fun basalBodyTemperatureUnitsAndLocation() {
        val record = decode("""{"type":"basalBodyTemperature","startDate":"$noon","value":98.6,"unit":"degF","measurementLocation":"vagina"}""").primary as BasalBodyTemperatureRecord
        assertEquals(37.0, record.temperature.inCelsius, 0.0001)
        assertEquals(BodyTemperatureMeasurementLocation.MEASUREMENT_LOCATION_VAGINA, record.measurementLocation)
        val entry = Registry.byId.getValue("basalBodyTemperature")
        val celsius = RecordCodec.encode(record, entry)
        assertEquals(37.0, celsius.getDouble("value"), 0.0001)
        assertEquals("degC", celsius.getString("unit"))
        assertEquals("vagina", celsius.getString("measurementLocation"))
        assertEquals(98.6, RecordCodec.encode(record, entry, "degF").getDouble("value"), 0.0001)
        assertEquals("quantity", celsius.getString("kind"))
    }

    @Test
    fun skinTemperatureDeltas() {
        val record = decode(
            """{"type":"skinTemperature","startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-01T08:00:00.000+00:00",
               "baseline":33.5,"unit":"degC","measurementLocation":"wrist",
               "deltas":[{"time":"2026-10-01T02:00:00.000+00:00","delta":0.3},{"time":"2026-10-01T01:00:00.000+00:00","delta":-0.2}]}""",
        ).primary as SkinTemperatureRecord
        assertEquals(33.5, record.baseline!!.inCelsius, 0.0001)
        assertEquals(listOf(-0.2, 0.3), record.deltas.map { it.delta.inCelsius })
        assertEquals(SkinTemperatureRecord.MEASUREMENT_LOCATION_WRIST, record.measurementLocation)
        val json = RecordCodec.encode(record, Registry.byId.getValue("skinTemperature"))
        assertEquals("special", json.getString("kind"))
        assertEquals(2, json.getJSONArray("deltas").length())
        assertEquals(-0.2, json.getJSONArray("deltas").getJSONObject(0).getDouble("delta"), 0.0001)
        assertEquals("wrist", json.getString("measurementLocation"))
    }

    @Test
    fun periodCoversWholeLocalDays() {
        val decoded = decode(
            """{"type":"menstruationPeriod","startDate":"2026-10-01T09:00:00.000+05:30","endDate":"2026-10-05T18:00:00.000+05:30",
               "clientId":"p1","flow":{"2026-10-01":"heavy","2026-10-02":"medium"}}""",
        )
        val period = decoded.primary as MenstruationPeriodRecord
        assertEquals(Instant.parse("2026-09-30T18:30:00Z"), period.startTime)
        assertEquals(Instant.parse("2026-10-05T18:29:59.999Z"), period.endTime)
        assertEquals("p1", period.metadata.clientRecordId)
        val json = RecordCodec.encode(period, Registry.byId.getValue("menstruationPeriod"))
        assertEquals("2026-10-01", json.getString("firstDay"))
        assertEquals("2026-10-05", json.getString("lastDay"))
        assertFalse(json.getBoolean("derived"))

        assertEquals(2, decoded.extras.size)
        val day1 = decoded.extras[0] as MenstruationFlowRecord
        assertEquals("p1:2026-10-01", day1.metadata.clientRecordId)
        assertEquals(MenstruationFlowRecord.FLOW_HEAVY, day1.flow)
        assertEquals(Instant.parse("2026-10-01T06:30:00Z"), day1.time)
    }

    @Test
    fun periodReadsEndExclusive() {
        val nextMidnight = MenstruationPeriodRecord(
            Instant.parse("2026-09-30T18:30:00Z"), ist, Instant.parse("2026-10-05T18:30:00Z"), ist, Metadata.manualEntry(),
        )
        assertEquals("2026-10-05", PeriodDays.lastDay(nextMidnight).toString())
    }

    @Test
    fun periodsLongerThan31DaysReject() {
        decode("""{"type":"menstruationPeriod","startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-31T00:00:00.000+00:00"}""")
        val error = assertThrows(HealthException::class.java) {
            decode("""{"type":"menstruationPeriod","startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-11-01T00:00:00.000+00:00"}""")
        }
        assertEquals("periodTooLong", error.data.getString("reason"))
    }

    @Test
    fun periodUsesTheTimeZoneForMidnight() {
        // Europe/Berlin moves from +02:00 to +01:00 on 2026-10-25.
        val period = decode(
            """{"type":"menstruationPeriod","startDate":"2026-10-24T08:00:00.000+02:00","endDate":"2026-10-26T08:00:00.000+01:00","timeZone":"Europe/Berlin"}""",
        ).primary as MenstruationPeriodRecord
        assertEquals(Instant.parse("2026-10-23T22:00:00Z"), period.startTime)
        assertEquals(Instant.parse("2026-10-26T22:59:59.999Z"), period.endTime)
        assertEquals(ZoneOffset.ofHours(1), period.endZoneOffset)
        assertEquals(Duration.ofHours(73).minusMillis(1), Duration.between(period.startTime, period.endTime))
    }

    @Test
    fun recordingMethodsAndDevices() {
        val auto = decode("""{"type":"basalBodyTemperature","startDate":"$noon","value":36.5,"recordingMethod":"automatic","device":{"type":"ring","manufacturer":"Acme"}}""").primary
        assertEquals(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED, auto.metadata.recordingMethod)
        assertEquals(Device.TYPE_RING, auto.metadata.device?.type)
        val json = RecordCodec.encode(auto, Registry.byId.getValue("basalBodyTemperature"))
        assertEquals("automatic", json.getString("recordingMethod"))
        assertEquals("ring", json.getJSONObject("device").getString("type"))
        assertEquals("Acme", json.getJSONObject("device").getString("manufacturer"))

        val active = decode("""{"type":"basalBodyTemperature","startDate":"$noon","value":36.5,"recordingMethod":"active"}""").primary
        assertEquals(Metadata.RECORDING_METHOD_ACTIVELY_RECORDED, active.metadata.recordingMethod)
    }

    @Test
    fun cycleStartRule() {
        val periods = listOf(
            CycleStart.Period("a", java.time.LocalDate.parse("2026-10-01"), java.time.LocalDate.parse("2026-10-05")),
            CycleStart.Period("b", java.time.LocalDate.parse("2026-10-03"), java.time.LocalDate.parse("2026-10-06")),
        )
        assertEquals(true, CycleStart.of(java.time.LocalDate.parse("2026-10-01"), "a", periods))
        assertEquals(false, CycleStart.of(java.time.LocalDate.parse("2026-10-03"), "a", periods))
        assertEquals(true, CycleStart.of(java.time.LocalDate.parse("2026-10-03"), "b", periods))
        assertEquals(null, CycleStart.of(java.time.LocalDate.parse("2026-10-06"), "a", periods))
        assertEquals(null, CycleStart.of(java.time.LocalDate.parse("2026-10-01"), "c", periods))
    }
}
