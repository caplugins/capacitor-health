package com.caplugins.health

import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BodyTemperatureMeasurementLocation
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.testing.FakeHealthConnectClient
import com.caplugins.health.generated.RecordTime
import com.caplugins.health.generated.Registry
import com.caplugins.health.generated.RegistryEntry
import com.caplugins.health.generated.RegistryKind
import java.time.Instant
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The generated quantity record adapters (T27). */
class QuantityRecordsTest {
    private val start = "2026-10-01T12:00:00.000+05:30"
    private val end = "2026-10-01T12:30:00.000+05:30"

    private fun entry(id: String) = Registry.byId.getValue(id)

    private fun sample(entry: RegistryEntry, value: Double, unit: String? = null): JSONObject {
        val json = JSONObject().put("type", entry.id).put("startDate", start).put("value", value)
        unit?.let { json.put("unit", it) }
        if (entry.time == RecordTime.INTERVAL) json.put("endDate", end)
        return json
    }

    private fun decode(json: JSONObject) = RecordCodec.decode(Fields(json, "samples[0]"), entry(json.getString("type"))).primary

    private fun rejection(json: JSONObject) = assertThrows(HealthException::class.java) { decode(json) }

    /** A value every unit of [entry] holds inside Health Connect's ranges. */
    private fun valueFor(entry: RegistryEntry): Double =
        when {
            entry.wholeNumber -> 2.0
            Registry.units.getValue(entry.unit!!).dimension == "temperature" -> 37.0
            else -> 1.5
        }

    @Test
    fun everyQuantityRecordRoundTripsInEveryUnit() {
        var checked = 0
        for (entry in Registry.entries) {
            if (entry.kind != RegistryKind.QUANTITY || entry.aggregateOnly || Registry.adapters[entry.record] == null) continue
            for (unit in entry.units) {
                val value = valueFor(entry)
                val record = decode(sample(entry, value, unit))
                assertEquals(entry.id, entry.record, record::class)
                val json = RecordCodec.encode(record, entry, unit)
                assertEquals("${entry.id} in $unit", value, json.getDouble("value"), 1e-9)
                assertEquals(unit, json.getString("unit"))
                assertEquals(start, json.getString("startDate"))
                assertEquals(if (entry.time == RecordTime.INTERVAL) end else start, json.getString("endDate"))
                checked++
            }
        }
        assertTrue("checked $checked", checked >= 40)
    }

    @Test
    fun readsInTheCanonicalUnitByDefault() {
        val weight = decode(sample(entry("weight"), 154.0, "lb")) as WeightRecord
        assertEquals(69.853, weight.weight.inKilograms, 0.001)
        val json = RecordCodec.encode(weight, entry("weight"))
        assertEquals("kg", json.getString("unit"))
        assertEquals(69.853, json.getDouble("value"), 0.001)
        assertEquals("quantity", json.getString("kind"))
        assertEquals("WeightRecord", json.getJSONObject("native").getString("type"))
    }

    @Test
    fun bloodGlucoseFields() {
        val json = sample(entry("bloodGlucose"), 5.5, "mmol/L")
            .put("relationToMeal", "fasting").put("mealType", "breakfast").put("specimenSource", "capillaryBlood")
        val record = decode(json) as BloodGlucoseRecord
        assertEquals(5.5, record.level.inMillimolesPerLiter, 1e-9)
        assertEquals(BloodGlucoseRecord.RELATION_TO_MEAL_FASTING, record.relationToMeal)
        assertEquals(MealType.MEAL_TYPE_BREAKFAST, record.mealType)
        assertEquals(BloodGlucoseRecord.SPECIMEN_SOURCE_CAPILLARY_BLOOD, record.specimenSource)
        val out = RecordCodec.encode(record, entry("bloodGlucose"))
        assertEquals("mg/dL", out.getString("unit"))
        assertEquals(99.0, out.getDouble("value"), 0.2)
        assertEquals("fasting", out.getString("relationToMeal"))
        assertEquals("breakfast", out.getString("mealType"))
        assertEquals("capillaryBlood", out.getString("specimenSource"))

        // Without the fields Health Connect stores its "unknown" constants, which read as absent.
        val bare = decode(sample(entry("bloodGlucose"), 95.0)) as BloodGlucoseRecord
        assertEquals(BloodGlucoseRecord.RELATION_TO_MEAL_UNKNOWN, bare.relationToMeal)
        assertEquals(MealType.MEAL_TYPE_UNKNOWN, bare.mealType)
        val bareJson = RecordCodec.encode(bare, entry("bloodGlucose"))
        assertFalse(bareJson.has("relationToMeal"))
        assertFalse(bareJson.has("mealType"))
        assertFalse(bareJson.has("specimenSource"))
    }

    @Test
    fun vo2MaxAndBodyTemperatureFields() {
        val vo2 = decode(sample(entry("vo2Max"), 42.0).put("measurementMethod", "cooperTest")) as Vo2MaxRecord
        assertEquals(Vo2MaxRecord.MEASUREMENT_METHOD_COOPER_TEST, vo2.measurementMethod)
        assertEquals("cooperTest", RecordCodec.encode(vo2, entry("vo2Max")).getString("measurementMethod"))

        val temperature = decode(sample(entry("bodyTemperature"), 98.6, "degF").put("measurementLocation", "ear")) as BodyTemperatureRecord
        assertEquals(37.0, temperature.temperature.inCelsius, 1e-9)
        assertEquals(BodyTemperatureMeasurementLocation.MEASUREMENT_LOCATION_EAR, temperature.measurementLocation)
        assertEquals("ear", RecordCodec.encode(temperature, entry("bodyTemperature")).getString("measurementLocation"))
    }

    @Test
    fun percentagesAreZeroToHundred() {
        val json = RecordCodec.encode(decode(sample(entry("oxygenSaturation"), 97.0)), entry("oxygenSaturation"))
        assertEquals(97.0, json.getDouble("value"), 1e-9)
        assertEquals("%", json.getString("unit"))
    }

    @Test
    fun recordShapesAreChecked() {
        assertEquals("wholeNumberOnly", rejection(sample(entry("steps"), 12.5)).data.getString("reason"))
        assertEquals("intervalOnly", rejection(sample(entry("steps"), 12.0).put("endDate", start)).data.getString("reason"))
        assertEquals("instantOnly", rejection(sample(entry("weight"), 70.0).put("endDate", end)).data.getString("reason"))
    }

    @Test
    fun healthConnectRangesRejectWithoutTheValue() {
        val error = rejection(sample(entry("weight"), 2345.0))
        assertEquals(HealthException.INVALID_ARGUMENT, error.code)
        assertEquals("outOfRange", error.data.getString("reason"))
        assertEquals("samples[0].value", error.data.getString("field"))
        assertFalse(error.message.contains("2345"))
        assertEquals("outOfRange", rejection(sample(entry("oxygenSaturation"), 150.0)).data.getString("reason"))
    }

    @Test
    fun aggregateOnlyTypesHaveNoRecords() {
        val types = HealthTypes { true }
        val support = types.support("basalEnergy")
        assertTrue(support.getBoolean("supported"))
        assertFalse(support.getBoolean("readable"))
        assertFalse(support.getBoolean("writable"))
        assertEquals("aggregateOnly", support.getString("reason"))
        val error = assertThrows(HealthException::class.java) { types.resolveSamples("basalEnergy") }
        assertEquals(HealthException.UNSUPPORTED_TYPE, error.code)
        assertEquals("aggregateOnly", error.data.getString("reason"))
        assertEquals("basalMetabolicRate", types.resolveSamples("basalMetabolicRate").id)
    }

    @Test
    fun savesReadsAndDeletesThroughHealthConnect() = runTest {
        val client = FakeHealthConnectClient()
        val samples = Samples(
            client,
            HealthTypes { true },
            FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
            encodeBase64 = { Base64.getEncoder().encodeToString(it) },
            decodeBase64 = { Base64.getDecoder().decode(it) },
        )
        val steps = sample(entry("steps"), 1200.0).put("clientId", "s1")
        val ids = samples.save(JSONArray(listOf(steps, sample(entry("weight"), 70.0)))).getJSONArray("ids")
        assertEquals(2, ids.length())

        val range = """"startDate":"2026-10-01T00:00:00.000+00:00","endDate":"2026-10-02T00:00:00.000+00:00""""
        val read = samples.read(Fields(JSONObject("""{"type":"steps",$range}"""))).getJSONArray("samples")
        assertEquals(1, read.length())
        assertEquals(1200.0, read.getJSONObject(0).getDouble("value"), 0.0)
        assertEquals("s1", read.getJSONObject(0).getString("clientId"))
        val stored = client.readRecords(
            androidx.health.connect.client.request.ReadRecordsRequest(
                StepsRecord::class,
                androidx.health.connect.client.time.TimeRangeFilter.after(Instant.EPOCH),
            ),
        ).records
        assertEquals(1200L, stored.single().count)

        samples.delete(Fields(JSONObject("""{"type":"steps","clientIds":["s1"]}""")))
        assertEquals(0, samples.read(Fields(JSONObject("""{"type":"steps",$range}"""))).getJSONArray("samples").length())
        assertEquals(1, samples.read(Fields(JSONObject("""{"type":"weight",$range}"""))).getJSONArray("samples").length())
    }
}
