package com.caplugins.health

import android.os.RemoteException
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Test

class HealthExceptionTest {
    private fun code(error: Throwable) = HealthException.from(error).code

    @Test
    fun mapsClientExceptions() {
        assertEquals(HealthException.PERMISSION_DENIED, code(SecurityException("Caller doesn't have READ_MENSTRUATION")))
        assertEquals(HealthException.INVALID_ARGUMENT, code(IllegalArgumentException("bad")))
        assertEquals(HealthException.UNAVAILABLE, code(UnsupportedOperationException("Provider not installed")))
        assertEquals(HealthException.NATIVE_ERROR, code(IOException("disk")))
        assertEquals(HealthException.NATIVE_ERROR, code(IllegalStateException("internal")))
        assertEquals(HealthException.NATIVE_ERROR, code(RuntimeException("other")))
    }

    @Test
    fun detectsRateLimitsByMessageAnywhereInTheChain() {
        assertEquals(HealthException.RATE_LIMITED, code(IllegalStateException(RuntimeException("API call quota exceeded"))))
        assertEquals(HealthException.RATE_LIMITED, code(IllegalStateException("Rate limit exceeded")))
    }

    @Test
    fun hidesInvalidArgumentMessages() {
        val error = HealthException.from(IllegalArgumentException("temperature 123.0 must be at most 100"))
        assertFalse(error.message.contains("123"))
    }

    @Test
    fun passesHealthExceptionsThrough() {
        val original = HealthException.invalidArgument("limit", "is too big", "tooBig")
        assertSame(original, HealthException.from(original))
        assertEquals("limit", original.data.getString("field"))
        assertEquals("tooBig", original.data.getString("reason"))
    }

    @Test
    fun unsupportedTypeCarriesTheReason() {
        val error = HealthException.unsupportedType("acne", "notOnPlatform")
        assertEquals(HealthException.UNSUPPORTED_TYPE, error.code)
        assertEquals("acne", error.data.getString("type"))
        assertEquals("notOnPlatform", error.data.getString("reason"))
    }
}
