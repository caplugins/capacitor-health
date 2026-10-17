package com.caplugins.health

import org.junit.Assert.assertEquals
import org.junit.Test

class DeclarationsTest {
    @Test
    fun listsUndeclaredPermissionsSorted() {
        val declared = setOf("android.permission.health.READ_MENSTRUATION", "android.permission.INTERNET")
        val requested = listOf(
            "android.permission.health.WRITE_MENSTRUATION",
            "android.permission.health.READ_MENSTRUATION",
            "android.permission.health.READ_CERVICAL_MUCUS",
        )
        assertEquals(
            listOf("android.permission.health.READ_CERVICAL_MUCUS", "android.permission.health.WRITE_MENSTRUATION"),
            Declarations.missing(requested, declared),
        )
    }

    @Test
    fun nothingMissing() {
        assertEquals(emptyList<String>(), Declarations.missing(listOf("a"), setOf("a", "b")))
    }

    @Test
    fun errorListsWhatToAdd() {
        val error = Declarations.missingDeclarationError(listOf("android.permission.health.READ_MENSTRUATION"))
        assertEquals(HealthException.MISSING_DECLARATION, error.code)
        assertEquals("android.permission.health.READ_MENSTRUATION", error.data.getJSONArray("missing").getString(0))
    }
}
