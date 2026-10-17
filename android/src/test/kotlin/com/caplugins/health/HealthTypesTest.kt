package com.caplugins.health

import androidx.health.connect.client.HealthConnectFeatures
import com.caplugins.health.generated.Registry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthTypesTest {
    private val noFeatures = HealthTypes { false }
    private val allFeatures = HealthTypes { true }

    @Test
    fun iosOnlyTypesAreNotOnPlatform() {
        val error = assertThrows(HealthException::class.java) { noFeatures.resolve("acne") }
        assertEquals("notOnPlatform", error.data.getString("reason"))
        val support = noFeatures.support("acne")
        assertFalse(support.getBoolean("supported"))
        assertEquals("notOnPlatform", support.getString("reason"))
    }

    @Test
    fun featureGatedTypeNeedsTheFeature() {
        val error = assertThrows(HealthException::class.java) { noFeatures.resolve("skinTemperature") }
        assertEquals("featureUnavailable", error.data.getString("reason"))
        assertEquals("featureUnavailable", noFeatures.support("skinTemperature").getString("reason"))
        val gated = HealthTypes { it == HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE }
        assertTrue(gated.support("skinTemperature").getBoolean("supported"))
    }

    @Test
    fun supportListsAndroidValuesInOrder() {
        val flow = allFeatures.support("menstrualFlow")
        assertTrue(flow.getBoolean("writable"))
        assertFalse(flow.getBoolean("aggregatable"))
        val values = flow.getJSONArray("values")
        assertEquals(listOf("unspecified", "light", "medium", "heavy"), (0 until values.length()).map { values.getString(it) })
        val units = allFeatures.support("basalBodyTemperature").getJSONArray("units")
        assertEquals("degC", units.getString(0))
    }

    @Test
    fun everyTypeHasASupportEntry() {
        assertEquals(Registry.allTypeIds.size, Registry.allTypeIds.toSet().size)
        assertTrue(Registry.entries.all { it.id in Registry.allTypeIds })
        Registry.allTypeIds.forEach { assertEquals(it, allFeatures.support(it).getString("type")) }
    }
}
