package com.caplugins.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import com.caplugins.health.generated.Registry
import org.junit.Assert.assertEquals
import org.junit.Test
import java.lang.reflect.Modifier

/** The generated activity map covers every exercise type connect-client has, once each (decision #62). */
class WorkoutActivitiesTest {
    private val exerciseTypes = ExerciseSessionRecord::class.java.fields
        .filter { Modifier.isStatic(it.modifiers) && it.type == Int::class.javaPrimitiveType && it.name.startsWith("EXERCISE_TYPE_") }
        .associate { it.name to it.getInt(null) }

    @Test
    fun everyExerciseTypeHasOneActivity() {
        assertEquals(61, exerciseTypes.size)
        assertEquals(exerciseTypes.values.sorted(), Registry.workoutActivities.values.sorted())
    }

    @Test
    fun otherIsTheFallback() {
        assertEquals(ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT, Registry.workoutActivities["other"])
    }
}
