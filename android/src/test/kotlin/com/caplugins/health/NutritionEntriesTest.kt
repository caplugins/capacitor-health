package com.caplugins.health

import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.testing.FakeHealthConnectClient
import com.caplugins.health.generated.Registry
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Nutrition entries on Android (T50, decision #71). */
class NutritionEntriesTest {
    private val client = FakeHealthConnectClient()
    private val types = HealthTypes { true }
    private val samples = Samples(
        client,
        types,
        FakeHealthConnectClient.DEFAULT_PACKAGE_NAME,
        encodeBase64 = { Base64.getEncoder().encodeToString(it) },
        decodeBase64 = { Base64.getDecoder().decode(it) },
    )
    private val entry = Registry.byId.getValue("nutrition")

    private fun at(time: String) = "2026-10-02T$time:00.000+02:00"

    private fun meal(nutrients: String, extra: String = "") =
        """{"type":"nutrition","startDate":"${at("08:00")}","endDate":"${at("08:20")}","nutrients":{$nutrients}$extra}"""

    private fun decode(json: String) = RecordCodec.decode(Fields(JSONObject(json), "samples[0]"), entry).primary as NutritionRecord

    private fun reason(block: () -> Unit): String? = assertThrows(HealthException::class.java) { block() }.data.getString("reason")

    @Test
    fun isSupportedWithItsNutrients() {
        val support = types.support("nutrition")
        assertTrue(support.getBoolean("supported"))
        assertTrue(support.getBoolean("writable"))
        assertFalse(support.getBoolean("aggregatable"))
        val values = support.getJSONArray("values")
        assertEquals(Registry.nutrients.keys.toList(), (0 until values.length()).map { values.getString(it) })
        assertEquals(42, values.length())
    }

    @Test
    fun roundTripsAnEntry() {
        val record = decode(meal(""""energy":350,"protein":12.5,"vitaminC":0.0005,"transFat":0.2""", ""","name":"Porridge","mealType":"breakfast","clientId":"m1""""))
        assertEquals("Porridge", record.name)
        assertEquals(MealType.MEAL_TYPE_BREAKFAST, record.mealType)
        assertEquals(350.0, record.energy!!.inKilocalories, 1e-9)
        assertEquals(12.5, record.protein!!.inGrams, 1e-9)
        assertEquals(0.0005, record.vitaminC!!.inGrams, 1e-12)
        assertNull(record.sugar)
        val out = RecordCodec.encode(record, entry)
        assertEquals("nutrition", out.getString("type"))
        assertEquals("special", out.getString("kind"))
        assertEquals("Porridge", out.getString("name"))
        assertEquals("breakfast", out.getString("mealType"))
        assertEquals("m1", out.getString("clientId"))
        val nutrients = out.getJSONObject("nutrients")
        assertEquals(4, nutrients.length())
        assertEquals(350.0, nutrients.getDouble("energy"), 1e-9)
        assertEquals(0.2, nutrients.getDouble("transFat"), 1e-9)
        assertEquals(0.0005, nutrients.getDouble("vitaminC"), 1e-12)
        assertFalse(out.has("value"))
        assertEquals("NutritionRecord", out.getJSONObject("native").getString("type"))
    }

    @Test
    fun everyNutrientRoundTripsThroughItsProperty() {
        for ((id, nutrient) in Registry.nutrients) {
            val record = decode(meal(""""$id":${nutrient.max}"""))
            val out = RecordCodec.encode(record, entry).getJSONObject("nutrients")
            assertEquals(id, listOf(id), out.keys().asSequence().toList())
            assertEquals(id, nutrient.max, out.getDouble(id), 1e-6)
        }
    }

    @Test
    fun withoutNameOrMealTypeTheyReadAbsent() {
        val out = RecordCodec.encode(decode(meal(""""sugar":4""", ""","name":""""")), entry)
        assertFalse(out.has("name"))
        assertFalse(out.has("mealType"))
    }

    @Test
    fun rejectsWhatHealthConnectWouldBeforeItDoes() {
        assertEquals("outOfRange", reason { decode(meal(""""energy":100001""")) })
        assertEquals("outOfRange", reason { decode(meal(""""caffeine":100.5""")) })
        assertEquals("outOfRange", reason { decode(meal(""""protein":-1""")) })
        assertEquals("valueUnsupportedOnPlatform", reason { decode(meal(""""vitaminZ":1""")) })
        assertEquals("valueUnsupportedOnPlatform", reason { decode(meal(""""sugar":1""", ""","mealType":"brunch"""")) })
        assertEquals("required", reason { decode(meal("")) })
        assertEquals("intervalOnly", reason { decode("""{"type":"nutrition","startDate":"${at("08:00")}","nutrients":{"sugar":1}}""") })
        val error = assertThrows(HealthException::class.java) { decode(meal(""""sodium":101""")) }
        assertEquals("samples[0].nutrients.sodium", error.data.getString("field"))
    }

    @Test
    fun savesReadsUpsertsAndDeletesAsOneRecord() = runTest {
        val first = samples.save(JSONArray(listOf(JSONObject(meal(""""energy":350,"sugar":10""", ""","clientId":"m1""""))))).getJSONArray("ids").getString(0)
        val second = samples.save(
            JSONArray(listOf(JSONObject(meal(""""energy":300""", ""","clientId":"m1","clientVersion":2,"name":"Smaller"""")))),
        ).getJSONArray("ids").getString(0)
        assertEquals(first, second)
        val read = samples.read(Fields(JSONObject("""{"type":"nutrition","startDate":"${at("07:00")}","endDate":"${at("12:00")}"}"""))).getJSONArray("samples")
        assertEquals(1, read.length())
        val nutrients = read.getJSONObject(0).getJSONObject("nutrients")
        assertEquals(300.0, nutrients.getDouble("energy"), 1e-9)
        assertFalse(nutrients.has("sugar"))
        assertEquals("Smaller", read.getJSONObject(0).getString("name"))
        val deleted = samples.delete(Fields(JSONObject("""{"type":"nutrition","clientIds":["m1"]}"""))).getInt("deleted")
        assertEquals(1, deleted)
    }
}
