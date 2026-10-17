package com.caplugins.health

import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.metadata.Metadata
import com.caplugins.health.generated.RecordTimes
import com.caplugins.health.generated.Registry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

/** The generated nutrient table and NutritionRecord builder wire every nutrient id to its own property (T39). */
class NutrientsTest {
    private val times = RecordTimes(Instant.parse("2026-10-01T12:00:00Z"), ZoneOffset.UTC, Instant.parse("2026-10-01T12:15:00Z"), ZoneOffset.UTC)

    @Test
    fun everyNutrientRoundTripsThroughItsOwnProperty() {
        val ids = Registry.nutrients.keys.toList()
        // A distinct value per nutrient, so two ids sharing a property (or swapped arguments) would show.
        val values = ids.mapIndexed { i, id -> id to Registry.units.getValue(Registry.nutrients.getValue(id).unit).build(i + 1.0) }.toMap()
        val record = Registry.nutritionRecord(times, Metadata.manualEntry(), "Lunch", MealType.MEAL_TYPE_LUNCH, values)
        ids.forEachIndexed { i, id ->
            val nutrient = Registry.nutrients.getValue(id)
            assertEquals(id, i + 1.0, Registry.units.getValue(nutrient.unit).read(nutrient.read(record)!!), 1e-9)
        }
        assertEquals(42, ids.size)
    }

    @Test
    fun nutrientsNotListedStayUnset() {
        val record = Registry.nutritionRecord(times, Metadata.manualEntry(), null, MealType.MEAL_TYPE_UNKNOWN, emptyMap())
        for ((id, nutrient) in Registry.nutrients) assertNull(id, nutrient.read(record))
    }
}
