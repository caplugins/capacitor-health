package com.caplugins.health

import androidx.health.connect.client.permission.HealthPermission
import com.caplugins.health.generated.Registry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/** Checks the generated registry against connect-client (constants are compile-checked already). */
class RegistryTest {
    @Test
    fun idsAreUnique() {
        assertEquals(Registry.entries.size, Registry.byId.size)
    }

    @Test
    fun permissionsMatchHealthPermission() {
        for (entry in Registry.entries) {
            assertEquals(entry.id, HealthPermission.getReadPermission(entry.record), entry.readPermission)
            assertEquals(entry.id, HealthPermission.getWritePermission(entry.record), entry.writePermission)
        }
    }

    @Test
    fun referencesResolve() {
        for (entry in Registry.entries) {
            entry.valueSet?.let { assertNotNull("${entry.id}.valueSet", Registry.valueSets[it]) }
            for (field in entry.fields) {
                field.valueSet?.let { assertNotNull("${entry.id}.${field.name}", Registry.valueSets[it]) }
            }
        }
    }

    @Test
    fun valueSetConstantsAreDistinct() {
        for ((name, set) in Registry.valueSets) {
            val constants = set.constants.values + listOfNotNull(set.absent)
            assertEquals(name, constants.size, constants.toSet().size)
        }
    }
}
