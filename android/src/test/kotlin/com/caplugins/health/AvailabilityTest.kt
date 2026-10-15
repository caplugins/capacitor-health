package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient.Companion.SDK_AVAILABLE
import androidx.health.connect.client.HealthConnectClient.Companion.SDK_UNAVAILABLE
import androidx.health.connect.client.HealthConnectClient.Companion.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class AvailabilityTest {

    private fun status(sdkInt: Int, sdkStatus: Int, installed: Boolean = true) =
        Availability.status(sdkInt, { sdkStatus }, { installed })

    @Test
    fun belowApi28IsNotSupportedWithoutTouchingTheClient() {
        val status = Availability.status(27, { fail("must not query the SDK"); 0 }, { fail("must not query"); false })
        assertEquals("notSupported", status)
    }

    @Test
    fun available() = assertEquals("available", status(34, SDK_AVAILABLE))

    @Test
    fun unavailable() = assertEquals("notSupported", status(34, SDK_UNAVAILABLE))

    @Test
    fun missingPlayAppOnAndroid13IsNotInstalled() =
        assertEquals("notInstalled", status(33, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED, installed = false))

    @Test
    fun oldPlayAppOnAndroid13NeedsUpdate() =
        assertEquals("updateRequired", status(33, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED, installed = true))

    @Test
    fun builtInHealthConnectNeedsUpdate() =
        assertEquals("updateRequired", status(34, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED, installed = false))
}
