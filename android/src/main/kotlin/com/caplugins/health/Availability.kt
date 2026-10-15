package com.caplugins.health

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import com.getcapacitor.JSObject

/** Maps Health Connect availability to the plugin's `AvailabilityResult` (requirement R1). */
object Availability {
    /** Health Connect runs on Android 9 (API 28) and later, although connect-client allows minSdk 26. */
    const val MIN_SDK = Build.VERSION_CODES.P

    /** On API 34+ Health Connect is part of the platform; below that it's this Play app. */
    private const val BUILT_IN_SDK = Build.VERSION_CODES.UPSIDE_DOWN_CAKE

    /** The Health Connect Play app (Android 9–13). Same value as connect-client's internal default. */
    const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

    fun status(sdkInt: Int, sdkStatus: () -> Int, providerInstalled: () -> Boolean): String {
        if (sdkInt < MIN_SDK) return "notSupported"
        return when (sdkStatus()) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                if (sdkInt < BUILT_IN_SDK && !providerInstalled()) "notInstalled" else "updateRequired"
            else -> "notSupported"
        }
    }

    fun result(context: Context): JSObject {
        val status = status(
            sdkInt = Build.VERSION.SDK_INT,
            sdkStatus = { HealthConnectClient.getSdkStatus(context) },
            providerInstalled = { isInstalled(context, PROVIDER_PACKAGE) },
        )
        return JSObject().apply {
            put("available", status == "available")
            put("status", status)
        }
    }

    private fun isInstalled(context: Context, packageName: String): Boolean =
        try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
}
