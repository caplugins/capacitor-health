package com.caplugins.health

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import com.caplugins.health.generated.Registry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@CapacitorPlugin(name = "CapacitorHealth")
class CapacitorHealthPlugin : Plugin() {

    // Decision #22.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }
    private val features: (Int) -> Boolean = { feature ->
        client.features.getFeatureStatus(feature) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    }
    private val types by lazy { HealthTypes(features) }
    private val authorization by lazy { Authorization(types, features) }
    private val samples by lazy { Samples(client, types) }
    private val changes by lazy { Changes(client, types, samples, context.packageName, Samples::base64, Samples::unbase64) }
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    override fun load() {
        HealthLog.enabled = config.getBoolean("debugLogging", false)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    // region Availability

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(Availability.result(context))
    }

    @PluginMethod
    fun getSupportedTypes(call: PluginCall) =
        launch(call) {
            requireAvailable()
            JSObject()
                .put("types", JSArray(Registry.allTypeIds.map(types::support)))
                .put(
                    "android",
                    JSObject()
                        .put("history", features(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY))
                        .put("background", features(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)),
                )
        }

    // endregion

    // region Authorization

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        scope.launch {
            try {
                requireAvailable()
                val request = authorizationRequest(call)
                val permissions = authorization.permissions(request)
                val missing = Declarations.missing(permissions, Declarations.declaredPermissions(context))
                if (missing.isNotEmpty()) throw Declarations.missingDeclarationError(missing)
                if (permissions.isEmpty()) {
                    call.resolve(authorization.result(request, client.permissionController.getGrantedPermissions()))
                    return@launch
                }
                val intent = permissionContract.createIntent(context, permissions)
                withContext(Dispatchers.Main) { startActivityForResult(call, intent, "permissionsResult") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                call.reject(HealthException.from(e))
            }
        }
    }

    /**
     * The dialog's own result can't tell a refusal from a suppressed or missing dialog (T08 A1–A3), so
     * the plugin reports what's granted now.
     */
    @ActivityCallback
    private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        HealthLog.debug("Permission dialog returned ${result.resultCode}")
        launch(call) { authorization.result(authorizationRequest(call), client.permissionController.getGrantedPermissions()) }
    }

    @PluginMethod
    fun checkAuthorization(call: PluginCall) =
        launch(call) {
            requireAvailable()
            authorization.result(authorizationRequest(call), client.permissionController.getGrantedPermissions())
        }

    private fun authorizationRequest(call: PluginCall): Authorization.Request {
        val android = call.getObject("android") ?: JSObject()
        return Authorization.Request(
            read = call.getArray("read")?.toList<String>() ?: emptyList(),
            write = call.getArray("write")?.toList<String>() ?: emptyList(),
            history = android.optBoolean("history", false),
            background = android.optBoolean("background", false),
        )
    }

    // endregion

    // region Samples

    @PluginMethod
    fun readSamples(call: PluginCall) =
        launch(call) {
            requireAvailable()
            samples.read(Fields(call.data))
        }

    @PluginMethod
    fun getChanges(call: PluginCall) =
        launch(call) {
            requireAvailable()
            changes.changes(Fields(call.data))
        }

    @PluginMethod
    fun saveSamples(call: PluginCall) =
        launch(call) {
            requireAvailable()
            samples.save(call.data.optJSONArray("samples") ?: org.json.JSONArray())
        }

    @PluginMethod
    fun deleteSamples(call: PluginCall) =
        launch(call) {
            requireAvailable()
            samples.delete(Fields(call.data))
        }

    // endregion

    // region Settings

    /**
     * Opens Health Connect's settings, where users find "App permissions". The direct per-app screen
     * (`MANAGE_HEALTH_PERMISSIONS`) needs a system permission: starting it crashes with a SecurityException (T14).
     */
    @PluginMethod
    fun openHealthSettings(call: PluginCall) {
        startFirst(call, listOf(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)), "Health Connect's settings couldn't be opened.")
    }

    @PluginMethod
    fun openHealthConnectInstall(call: PluginCall) {
        val provider = Availability.PROVIDER_PACKAGE
        val market =
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$provider&url=healthconnect%3A%2F%2Fonboarding"))
                .setPackage("com.android.vending")
                .putExtra("overlay", true)
                .putExtra("callerId", context.packageName)
        val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$provider"))
        startFirst(call, listOf(market, web), "No app store is available to install Health Connect.")
    }

    private fun startFirst(call: PluginCall, intents: List<Intent>, failure: String) {
        activity.runOnUiThread {
            for (intent in intents) {
                try {
                    activity.startActivity(intent)
                    call.resolve()
                    return@runOnUiThread
                } catch (_: ActivityNotFoundException) {
                    continue
                } catch (_: SecurityException) {
                    continue
                }
            }
            call.reject(HealthException(HealthException.UNAVAILABLE, failure))
        }
    }

    // endregion

    // region Helpers

    /** Runs [block] on the plugin scope and resolves with its result, or rejects with the mapped error. */
    private fun launch(call: PluginCall, block: suspend () -> JSObject) {
        scope.launch {
            try {
                call.resolve(block())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                call.reject(HealthException.from(e))
            }
        }
    }

    private fun requireAvailable() {
        when (Availability.result(context).getString("status")) {
            "available" -> return
            "notInstalled" -> throw HealthException(HealthException.NOT_INSTALLED, "Health Connect isn't installed.")
            "updateRequired" -> throw HealthException(HealthException.UPDATE_REQUIRED, "Health Connect needs an update.")
            else -> throw HealthException(HealthException.UNAVAILABLE, "Health Connect isn't available on this device.")
        }
    }

    // endregion
}
