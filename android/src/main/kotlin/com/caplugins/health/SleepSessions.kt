package com.caplugins.health

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Duration
import java.time.Instant

/**
 * `sleepSession` ⇄ `SleepSessionRecord` (decisions #64, #66). Health Connect stores the session itself, so
 * nothing is derived: stages map one to one through the `sleepStage` value set, and `title` / `notes` are
 * unified fields here (Android only).
 */
object SleepSessions {
    const val TYPE_ID = "sleepSession"
    private const val STAGE_SET = "sleepStage"

    /**
     * How far before a read's start the query reaches. Health Connect matches sessions by start time only (T16), and
     * a session has no maximum length, so a night that started before the range is found by looking back; the iOS
     * derivation widens reads by the same 24 hours.
     */
    val LOOK_BACK: Duration = Duration.ofHours(24)

    /** The session's stages, title, notes and `derived: false`, added to its base JSON. */
    fun encode(record: SleepSessionRecord, json: JSObject, native: JSObject) {
        val offset = record.startZoneOffset
        json.put(
            "stages",
            JSArray(
                record.stages.sortedBy { it.startTime }.map { stage ->
                    JSObject()
                        .put("stage", RecordCodec.unifiedValue(stage.stage, STAGE_SET) ?: "unknown")
                        .put("startDate", DateCoding.format(stage.startTime, offset))
                        .put("endDate", DateCoding.format(stage.endTime, offset))
                },
            ),
        )
        record.title?.let { json.put("title", it) }
        record.notes?.let { json.put("notes", it) }
        json.put("derived", false)
        native.put("stages", JSArray(record.stages.sortedBy { it.startTime }.map { it.stage }))
    }

    /**
     * A record from a `NewSleepSession`. The TS layer already checks the stage rules; they're checked again here so a
     * bad session rejects with the plugin's reasons (`endNotAfterStart`, `outsideSession`, `stagesOverlap`) rather
     * than the `IllegalArgumentException` Health Connect's constructor throws.
     */
    fun decode(fields: Fields, metadata: Metadata): SleepSessionRecord {
        val start = fields.date("startDate")
        if (!fields.has("endDate")) throw HealthException.invalidArgument(fields.field("endDate"), "is required for a sleep session", "required")
        val end = fields.date("endDate")
        if (!end.toInstant().isAfter(start.toInstant())) {
            throw HealthException.invalidArgument(fields.field("endDate"), "must be after startDate", "endNotAfterStart")
        }
        val stages = stages(fields, start.toInstant(), end.toInstant())
        return SleepSessionRecord(
            startTime = start.toInstant(),
            startZoneOffset = start.offset,
            endTime = end.toInstant(),
            endZoneOffset = end.offset,
            metadata = metadata,
            title = text(fields, "title"),
            notes = text(fields, "notes"),
            stages = stages,
        )
    }

    private fun text(fields: Fields, name: String): String? {
        if (!fields.has(name)) return null
        val value = fields.json.get(name) as? String ?: throw HealthException.invalidArgument(fields.field(name), "must be a string")
        return value.ifEmpty { null }
    }

    private fun stages(fields: Fields, start: Instant, end: Instant): List<SleepSessionRecord.Stage> {
        val array = fields.optArray("stages") ?: return emptyList()
        val stages = (0 until array.length()).map { i ->
            val stage = Fields(array.getJSONObject(i), fields.field("stages[$i]"))
            val stageStart = stage.date("startDate").toInstant()
            val stageEnd = stage.date("endDate").toInstant()
            if (!stageEnd.isAfter(stageStart)) throw HealthException.invalidArgument(stage.field("endDate"), "must be after startDate", "endNotAfterStart")
            if (stageStart.isBefore(start) || stageEnd.isAfter(end)) {
                throw HealthException.invalidArgument(fields.field("stages[$i]"), "must lie inside the session", "outsideSession")
            }
            val value = RecordCodec.constant(stage.string("stage"), STAGE_SET, stage.field("stage"))
            IndexedValue(i, SleepSessionRecord.Stage(stageStart, stageEnd, value))
        }.sortedWith(compareBy({ it.value.startTime }, { it.index }))
        stages.zipWithNext().forEach { (previous, next) ->
            if (next.value.startTime.isBefore(previous.value.endTime)) {
                throw HealthException.invalidArgument(fields.field("stages[${next.index}]"), "overlaps stages[${previous.index}]", "stagesOverlap")
            }
        }
        return stages.map { it.value }
    }
}
