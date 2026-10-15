package com.caplugins.health

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.PermissionController
import com.caplugins.health.spike.MenstruationSpike
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
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

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(Availability.result(context))
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    // region M0 spike (removed in T10)

    private val spike by lazy { MenstruationSpike(context) }
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    private fun spikeLaunch(call: PluginCall, block: suspend () -> JSObject) {
        scope.launch {
            runCatching { block() }
                .onSuccess { call.resolve(it) }
                .onFailure { call.reject("${it.javaClass.name}: ${it.message}", "SPIKE_ERROR") }
        }
    }

    @PluginMethod
    fun spikeRequestAuth(call: PluginCall) {
        val requested = call.getArray("permissions")?.toList<String>() ?: MenstruationSpike.PERMISSIONS
        val missing = spike.missingDeclarations(requested)
        if (missing.isNotEmpty() && call.getBoolean("skipCheck", false) != true) {
            call.reject("Not declared in AndroidManifest.xml: ${missing.joinToString()}", "MISSING_DECLARATION")
            return
        }
        scope.launch {
            val before = spike.granted()
            val intent = permissionContract.createIntent(context, requested.toSet())
            withContext(Dispatchers.Main) {
                call.data.put("grantedBefore", JSArray(before))
                startActivityForResult(call, intent, "spikePermissionsResult")
            }
        }
    }

    @ActivityCallback
    private fun spikePermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val fromResult = permissionContract.parseResult(result.resultCode, result.data)
        spikeLaunch(call) {
            JSObject().apply {
                put("resultCode", result.resultCode)
                put("hasData", result.data != null)
                put("grantedBefore", call.data.getJSONArray("grantedBefore"))
                put("grantedFromResult", JSArray(fromResult))
                put("grantedNow", JSArray(spike.granted()))
            }
        }
    }

    @PluginMethod
    fun spikeGranted(call: PluginCall) = spikeLaunch(call) { JSObject().put("granted", JSArray(spike.granted())) }

    @PluginMethod
    fun spikeRevokeAll(call: PluginCall) =
        spikeLaunch(call) {
            spike.client.permissionController.revokeAllPermissions()
            JSObject().put("revoked", true)
        }

    @PluginMethod
    fun spikeWrite(call: PluginCall) =
        spikeLaunch(call) {
            spike.write(
                startDay = call.getString("startDay") ?: "",
                days = call.getInt("days") ?: 5,
                flow = call.getInt("value") ?: 2,
                prefix = call.getString("syncPrefix") ?: "spike",
                version = (call.getInt("version") ?: 1).toLong(),
                withPeriod = call.getBoolean("withPeriod", true) == true,
                withFlows = call.getBoolean("withFlows", true) == true,
                periodEnd = call.getString("periodEnd") ?: "nextMidnight",
            )
        }

    @PluginMethod
    fun spikeRead(call: PluginCall) = spikeLaunch(call) { spike.read() }

    @PluginMethod
    fun spikeChanges(call: PluginCall) =
        spikeLaunch(call) { spike.changes(call.getString("cursor")?.let { JSObject(it) }) }

    @PluginMethod
    fun spikeDelete(call: PluginCall) =
        spikeLaunch(call) {
            spike.delete(
                type = call.getString("type") ?: "flow",
                ids = call.getArray("ids")?.toList<String>() ?: emptyList(),
                clientIds = call.getArray("clientIds")?.toList<String>() ?: emptyList(),
            )
        }

    @PluginMethod
    fun spikePeriodLimit(call: PluginCall) = spikeLaunch(call) { spike.periodLimit() }

    @PluginMethod
    fun spikeRawValues(call: PluginCall) {
        call.resolve(MenstruationSpike.rawValues())
    }

    // endregion
}
