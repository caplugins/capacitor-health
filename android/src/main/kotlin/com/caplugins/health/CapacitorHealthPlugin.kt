package com.caplugins.health

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

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
}
