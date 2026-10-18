package com.caplugins.health

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.caplugins.health.generated.RecordTimes
import com.caplugins.health.generated.Registry
import com.getcapacitor.JSObject

/**
 * `nutrition` ⇄ `NutritionRecord` (decision #71): the record's nutrient properties through the registry's nutrient
 * table, in their canonical units, with `name` and `mealType`.
 */
object Nutrition {
    const val TYPE_ID = "nutrition"
    private const val MEAL_SET = "mealType"

    /** The entry's name, meal type and nutrients, added to its base JSON. */
    fun encode(record: NutritionRecord, json: JSObject) {
        record.name?.takeIf { it.isNotEmpty() }?.let { json.put("name", it) }
        RecordCodec.unifiedValue(record.mealType, MEAL_SET)?.let { json.put("mealType", it) }
        val nutrients = JSObject()
        for ((id, nutrient) in Registry.nutrients) {
            val value = nutrient.read(record) ?: continue
            nutrients.put(id, Registry.units.getValue(nutrient.unit).read(value))
        }
        json.put("nutrients", nutrients)
    }

    /**
     * A record from a `NewNutrition`. The TS layer checks the amounts first; they're checked again so a bad entry
     * rejects naming the nutrient rather than with the `IllegalArgumentException` Health Connect's constructor throws.
     */
    fun decode(fields: Fields, metadata: Metadata): NutritionRecord {
        val start = fields.date("startDate")
        val end = if (fields.has("endDate")) fields.date("endDate") else start
        if (!end.toInstant().isAfter(start.toInstant())) {
            throw HealthException.invalidArgument(fields.field("endDate"), "must be after startDate on Android", "intervalOnly")
        }
        val json = fields.optObject("nutrients") ?: throw HealthException.invalidArgument(fields.field("nutrients"), "must be an object")
        val amounts = Fields(json, fields.field("nutrients"))
        val values = json.keys().asSequence().sorted().associateWith { id ->
            val nutrient = Registry.nutrients[id]
                ?: throw HealthException.invalidArgument(amounts.field(id), "can't be stored on Android", "valueUnsupportedOnPlatform")
            val amount = amounts.double(id)
            if (amount < 0 || amount > nutrient.max) {
                throw HealthException.invalidArgument(amounts.field(id), "must be from 0 to ${nutrient.max} ${nutrient.unit}", "outOfRange")
            }
            Registry.units.getValue(nutrient.unit).build(amount)
        }
        if (values.isEmpty()) throw HealthException.invalidArgument(fields.field("nutrients"), "must have at least one nutrient", "required")
        val mealType = fields.optString("mealType")?.let { RecordCodec.constant(it, MEAL_SET, fields.field("mealType")) }
            ?: Registry.valueSets[MEAL_SET]?.absent ?: 0
        return Registry.nutritionRecord(
            RecordTimes(start.toInstant(), start.offset, end.toInstant(), end.offset),
            metadata,
            fields.optString("name"),
            mealType,
            values,
        )
    }
}
