package com.caplugins.health

import androidx.health.connect.client.records.MenstruationPeriodRecord
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Decision #16: Health Connect flow records have no cycle-start flag, so `menstrualFlow.isCycleStart` is
 * `true` when a period from the same app starts on the flow's local date, `false` when one covers the date
 * but started earlier, and absent when no period covers it.
 */
object CycleStart {
    data class Period(val origin: String, val firstDay: LocalDate, val lastDay: LocalDate)

    fun of(day: LocalDate, origin: String, periods: List<Period>): Boolean? {
        val covering = periods.filter { it.origin == origin && !day.isBefore(it.firstDay) && !day.isAfter(it.lastDay) }
        if (covering.isEmpty()) return null
        return covering.any { it.firstDay == day }
    }

    fun period(record: MenstruationPeriodRecord): Period =
        Period(record.metadata.dataOrigin.packageName, PeriodDays.firstDay(record), PeriodDays.lastDay(record))
}

/** Decision #30: a period's days are the local dates from its start through `end − 1 ms`, end-exclusive. */
object PeriodDays {
    fun firstDay(record: MenstruationPeriodRecord): LocalDate =
        record.startTime.atOffset(record.startZoneOffset ?: ZoneOffset.UTC).toLocalDate()

    fun lastDay(record: MenstruationPeriodRecord): LocalDate =
        record.endTime.minusMillis(1).atOffset(record.endZoneOffset ?: ZoneOffset.UTC).toLocalDate()
}
