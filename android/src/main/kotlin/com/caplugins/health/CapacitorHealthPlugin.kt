package com.caplugins.health

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "CapacitorHealth")
class CapacitorHealthPlugin : Plugin() {

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(Availability.result(context))
    }
}
