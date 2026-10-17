package com.caplugins.health

import android.util.Log

/** Logging that may contain health values, so it's off unless the app sets `debugLogging` (N1). */
object HealthLog {
    @Volatile var enabled = false

    fun debug(message: String) {
        if (enabled) Log.d("CapacitorHealth", message)
    }
}
