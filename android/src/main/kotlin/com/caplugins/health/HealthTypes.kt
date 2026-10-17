package com.caplugins.health

import com.caplugins.health.generated.Registry
import com.caplugins.health.generated.RegistryEntry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Registry lookups with Health Connect feature gating. The only way the plugin turns a unified id into a
 * record type. [features] answers whether a `HealthConnectFeatures` constant is available on this device.
 */
class HealthTypes(private val features: (Int) -> Boolean) {
    /** The entry for [typeId], or why there is none (`notOnPlatform`, `featureUnavailable`). */
    fun lookup(typeId: String): Result<RegistryEntry> {
        val entry = Registry.byId[typeId] ?: return Result.failure(HealthException.unsupportedType(typeId, "notOnPlatform"))
        val feature = entry.feature
        if (feature != null && !features(feature)) return Result.failure(HealthException.unsupportedType(typeId, "featureUnavailable"))
        return Result.success(entry)
    }

    fun resolve(typeId: String): RegistryEntry = lookup(typeId).getOrThrow()

    fun resolveWritable(typeId: String): RegistryEntry =
        resolve(typeId).also { if (!it.writable) throw HealthException.readOnlyType(typeId) }

    /** `TypeSupport` for one unified id (requirement R18). */
    fun support(typeId: String): JSObject {
        val result = JSObject().put("type", typeId).put("aggregatable", false)
        val entry = Registry.byId[typeId]
        if (entry != null) {
            entry.valueSet?.let { Registry.valueSets[it] }?.let { result.put("values", JSArray(it.constants.keys)) }
            if (entry.units.isNotEmpty()) result.put("units", JSArray(entry.units))
        }
        val failure = lookup(typeId).exceptionOrNull() as HealthException?
        if (failure != null || entry == null) {
            return result
                .put("supported", false)
                .put("readable", false)
                .put("writable", false)
                .put("reason", failure?.data?.getString("reason") ?: "notOnPlatform")
        }
        result.put("supported", true).put("readable", true).put("writable", entry.writable)
        if (!entry.writable) result.put("reason", "readOnly")
        return result
    }
}
