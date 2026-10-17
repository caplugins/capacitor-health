package com.caplugins.health

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * The plugin declares no health permissions (decision #9). Health Connect silently ignores a request for
 * an undeclared one (T08 A1), so the plugin checks the app's merged manifest first (R4).
 */
object Declarations {
    fun missing(requested: Collection<String>, declared: Set<String>): List<String> = requested.filterNot { it in declared }.sorted()

    fun declaredPermissions(context: Context): Set<String> {
        val pm = context.packageManager
        val info =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
            }
        return info.requestedPermissions?.toSet() ?: emptySet()
    }

    fun missingDeclarationError(missing: List<String>) =
        HealthException(
            HealthException.MISSING_DECLARATION,
            "Declare ${missing.joinToString()} in the app's AndroidManifest.xml.",
            com.getcapacitor.JSObject().put("missing", com.getcapacitor.JSArray(missing)),
        )
}
