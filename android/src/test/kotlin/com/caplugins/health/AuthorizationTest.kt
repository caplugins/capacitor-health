package com.caplugins.health

import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthorizationTest {
    private val flowRead = "android.permission.health.READ_MENSTRUATION"
    private val flowWrite = "android.permission.health.WRITE_MENSTRUATION"
    private val skinRead = "android.permission.health.READ_SKIN_TEMPERATURE"

    private fun authorization(vararg available: Int): Authorization {
        val features = { feature: Int -> feature in available }
        return Authorization(HealthTypes(features), features)
    }

    @Test
    fun mapsTypesToPermissionsAndSkipsUnsupportedOnes() {
        val request = Authorization.Request(
            read = listOf("menstrualFlow", "menstruationPeriod", "pregnancyTest", "skinTemperature"),
            write = listOf("menstrualFlow", "wristTemperature"),
        )
        assertEquals(setOf(flowRead, flowWrite), authorization().permissions(request))
    }

    @Test
    fun featureGatedTypesNeedTheFeature() {
        val request = Authorization.Request(read = listOf("skinTemperature"), write = emptyList())
        assertEquals(emptySet<String>(), authorization().permissions(request))
        assertEquals(setOf(skinRead), authorization(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE).permissions(request))
    }

    @Test
    fun historyAndBackgroundOnlyWhenAskedAndSupported() {
        val request = Authorization.Request(read = listOf("menstrualFlow"), write = emptyList(), history = true, background = true)
        assertEquals(setOf(flowRead), authorization().permissions(request))
        val all = authorization(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY,
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
        ).permissions(request)
        assertEquals(
            setOf(flowRead, HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY, HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND),
            all,
        )
        assertEquals(setOf(flowRead), authorization(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY).permissions(request.copy(history = false, background = false)))
    }

    @Test
    fun reportsExactGrants() {
        val request = Authorization.Request(
            read = listOf("menstrualFlow", "ovulationTest", "acne"),
            write = listOf("menstrualFlow", "ovulationTest"),
        )
        val result = authorization().result(request, setOf(flowRead, HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY))
        val read = result.getJSObject("read")!!
        val write = result.getJSObject("write")!!
        assertEquals("granted", read.getString("menstrualFlow"))
        assertEquals("notGranted", read.getString("ovulationTest"))
        assertEquals("unsupported", read.getString("acne"))
        assertEquals("notGranted", write.getString("menstrualFlow"))
        assertEquals("notGranted", write.getString("ovulationTest"))
        assertTrue(result.getBoolean("historyGranted"))
        assertFalse(result.getBoolean("backgroundGranted"))
    }

    @Test
    fun periodAndFlowShareThePermission() {
        val result = authorization().result(
            Authorization.Request(read = listOf("menstruationPeriod"), write = listOf("menstruationPeriod")),
            setOf(flowRead, flowWrite),
        )
        assertEquals("granted", result.getJSObject("read")!!.getString("menstruationPeriod"))
        assertEquals("granted", result.getJSObject("write")!!.getString("menstruationPeriod"))
    }

    @Test
    fun missingFeatureReportsUnsupported() {
        val result = authorization().result(Authorization.Request(read = listOf("skinTemperature"), write = emptyList()), setOf(skinRead))
        assertEquals("unsupported", result.getJSObject("read")!!.getString("skinTemperature"))
    }
}
