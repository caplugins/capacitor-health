package com.caplugins.health

import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseLap
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSegment
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import com.caplugins.health.generated.Registry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * `workout` ⇄ `ExerciseSessionRecord` (decisions #67, #69). Health Connect stores segments, laps, title and notes on
 * the session; totals aren't stored on it, so they're the session app's active calories and distance records over
 * the session ([share]), and written totals become such records spanning the session.
 */
object Workouts {
    const val TYPE_ID = "workout"
    private const val SEGMENT_SET = "workoutSegmentType"

    /** Health Connect's limit for lap lengths, active calories and distance alike (decision #67). */
    const val MAX_AMOUNT = 1_000_000.0

    /** How far before a read's start the query reaches: sessions have no maximum length (as sleep, decision #66). */
    val LOOK_BACK: Duration = Duration.ofHours(24)

    /** Exercise type → unified activity id; the first id wins where two share a constant. */
    private val ACTIVITY_IDS: Map<Int, String> =
        Registry.workoutActivities.entries.groupBy({ it.value }, { it.key }).mapValues { it.value.first() }

    /** A session's totals, absent where there's nothing to sum or the app may not read the type. */
    class Totals(val energy: Double? = null, val distance: Double? = null)

    /** The clientIds of the totals written with a session (decision #67). */
    fun totalClientIds(clientId: String) = listOf("$clientId:energy", "$clientId:distance")

    // region Read

    /** The workout's activity, text, segments, laps, totals and route flag, added to its base JSON. */
    fun encode(record: ExerciseSessionRecord, json: JSObject, native: JSObject, totals: Totals?) {
        val offset = record.startZoneOffset
        json.put("activityType", ACTIVITY_IDS[record.exerciseType] ?: "other")
        native.put("value", record.exerciseType)
        record.title?.let { json.put("title", it) }
        record.notes?.let { json.put("notes", it) }
        val totalsJson = JSObject()
        totals?.energy?.let { totalsJson.put("energy", it) }
        totals?.distance?.let { totalsJson.put("distance", it) }
        json.put("totals", totalsJson)
        val segments = record.segments.sortedBy { it.startTime }
        json.put(
            "segments",
            JSArray(
                segments.map { segment ->
                    val out = JSObject()
                        .put("startDate", DateCoding.format(segment.startTime, offset))
                        .put("endDate", DateCoding.format(segment.endTime, offset))
                    // UNKNOWN reads as absent; a constant newer than the registry as its number.
                    RecordCodec.unifiedValue(segment.segmentType, SEGMENT_SET)?.let { out.put("segmentType", it) }
                    if (segment.repetitions > 0) out.put("repetitions", segment.repetitions)
                    out
                },
            ),
        )
        native.put("segments", JSArray(segments.map { it.segmentType }))
        json.put(
            "laps",
            JSArray(
                record.laps.sortedBy { it.startTime }.map { lap ->
                    val out = JSObject()
                        .put("startDate", DateCoding.format(lap.startTime, offset))
                        .put("endDate", DateCoding.format(lap.endTime, offset))
                    lap.length?.let { out.put("length", it.inMeters) }
                    out
                },
            ),
        )
        // A route this app may not read without the user's consent is still a route (decision #67).
        json.put("hasRoute", record.exerciseRouteResult !is ExerciseRouteResult.NoData)
    }

    /**
     * The part of a record's [value] that falls inside [start]–[end], in proportion to the overlap (as Health
     * Connect's `*_TOTAL` aggregates count a record partly inside); null when they don't overlap.
     */
    fun share(start: Instant, end: Instant, recordStart: Instant, recordEnd: Instant, value: Double): Double? {
        val from = maxOf(start, recordStart)
        val to = minOf(end, recordEnd)
        if (!to.isAfter(from)) return null
        val length = Duration.between(recordStart, recordEnd).toMillis()
        if (length <= 0) return value
        return value * Duration.between(from, to).toMillis() / length
    }

    /** Sums [records] (start, end, value) over each session; sessions nothing overlaps are left out. */
    fun sum(sessions: List<ExerciseSessionRecord>, records: List<Triple<Instant, Instant, Double>>): Map<String, Double> =
        sessions.mapNotNull { session ->
            val parts = records.mapNotNull { (from, to, value) -> share(session.startTime, session.endTime, from, to, value) }
            if (parts.isEmpty()) null else session.metadata.id to parts.sum()
        }.toMap()

    // endregion

    // region Write

    /**
     * The session from a `NewWorkout`, and its totals as records spanning it (`<clientId>:energy`,
     * `<clientId>:distance`). The TS layer checks the rules first; they're checked again so a bad workout rejects
     * with the plugin's reasons rather than the `IllegalArgumentException` Health Connect's constructor throws.
     */
    fun decode(fields: Fields, metadata: Metadata): RecordCodec.Decoded {
        val start = fields.date("startDate")
        if (!fields.has("endDate")) throw HealthException.invalidArgument(fields.field("endDate"), "is required for a workout", "required")
        val end = fields.date("endDate")
        if (!end.toInstant().isAfter(start.toInstant())) {
            throw HealthException.invalidArgument(fields.field("endDate"), "must be after startDate", "endNotAfterStart")
        }
        if (fields.has("activities")) {
            throw HealthException.invalidArgument(fields.field("activities"), "can't be stored on Android", "valueUnsupportedOnPlatform")
        }
        val activity = fields.string("activityType")
        val exerciseType = Registry.workoutActivities[activity]
            ?: throw HealthException.invalidArgument(fields.field("activityType"), "can't be stored on Android", "valueUnsupportedOnPlatform")
        val session = ExerciseSessionRecord(
            startTime = start.toInstant(),
            startZoneOffset = start.offset,
            endTime = end.toInstant(),
            endZoneOffset = end.offset,
            metadata = metadata,
            exerciseType = exerciseType,
            title = text(fields, "title"),
            notes = text(fields, "notes"),
            segments = segments(fields, activity, start.toInstant(), end.toInstant()),
            laps = laps(fields, start.toInstant(), end.toInstant()),
        )
        return RecordCodec.Decoded(session, totals(fields, start, end))
    }

    /** Whether Health Connect lets a session of [activity] hold a [segmentType] segment (`isCompatibleWith`). */
    fun segmentAllowed(activity: String, segmentType: String): Boolean {
        val table = Registry.WorkoutSegments
        return activity in table.anySegment || segmentType in table.anyActivity || table.activities[activity]?.contains(segmentType) == true
    }

    private fun text(fields: Fields, name: String): String? {
        if (!fields.has(name)) return null
        val value = fields.json.get(name) as? String ?: throw HealthException.invalidArgument(fields.field(name), "must be a string")
        return value.ifEmpty { null }
    }

    private fun amount(fields: Fields, name: String): Double {
        val value = fields.double(name)
        if (value < 0 || value > MAX_AMOUNT) throw HealthException.invalidArgument(fields.field(name), "must be from 0 to 1000000", "outOfRange")
        return value
    }

    /** Children of the session, checked as Health Connect does: inside it, starting before they end, no overlaps. */
    private fun <T> children(
        fields: Fields,
        name: String,
        start: Instant,
        end: Instant,
        overlapReason: String,
        build: (Fields, Instant, Instant) -> T,
    ): List<T> {
        val array = fields.optArray(name) ?: return emptyList()
        val children = (0 until array.length()).map { i ->
            val child = Fields(array.getJSONObject(i), fields.field("$name[$i]"))
            val childStart = child.date("startDate").toInstant()
            val childEnd = child.date("endDate").toInstant()
            if (!childEnd.isAfter(childStart)) throw HealthException.invalidArgument(child.field("endDate"), "must be after startDate", "endNotAfterStart")
            if (childStart.isBefore(start) || childEnd.isAfter(end)) {
                throw HealthException.invalidArgument(fields.field("$name[$i]"), "must lie inside the workout", "outsideSession")
            }
            Triple(i, childStart to childEnd, build(child, childStart, childEnd))
        }.sortedWith(compareBy({ it.second.first }, { it.first }))
        children.zipWithNext().forEach { (previous, next) ->
            if (next.second.first.isBefore(previous.second.second)) {
                throw HealthException.invalidArgument(fields.field("$name[${next.first}]"), "overlaps $name[${previous.first}]", overlapReason)
            }
        }
        return children.map { it.third }
    }

    private fun segments(fields: Fields, activity: String, start: Instant, end: Instant): List<ExerciseSegment> =
        children(fields, "segments", start, end, "segmentsOverlap") { segment, from, to ->
            val type = segment.optString("segmentType")
            if (type != null) {
                val allowed = Registry.valueSets[SEGMENT_SET]?.constants?.containsKey(type) == true
                if (allowed && !segmentAllowed(activity, type)) {
                    throw HealthException.invalidArgument(segment.field("segmentType"), "isn't allowed in a $activity workout on Android", "segmentNotAllowed")
                }
            }
            val constant = type?.let { RecordCodec.constant(it, SEGMENT_SET, segment.field("segmentType")) } ?: ExerciseSegment.EXERCISE_SEGMENT_TYPE_UNKNOWN
            val repetitions = segment.optDouble("repetitions") ?: 0.0
            if (repetitions < 0 || repetitions % 1.0 != 0.0) {
                throw HealthException.invalidArgument(segment.field("repetitions"), "must be a whole number from 0", "outOfRange")
            }
            ExerciseSegment(from, to, constant, repetitions.toInt())
        }

    private fun laps(fields: Fields, start: Instant, end: Instant): List<ExerciseLap> =
        children(fields, "laps", start, end, "lapsOverlap") { lap, from, to ->
            ExerciseLap(from, to, if (lap.has("length")) Length.meters(amount(lap, "length")) else null)
        }

    private fun totals(fields: Fields, start: OffsetDateTime, end: OffsetDateTime): List<Record> {
        val json = fields.optObject("totals") ?: return emptyList()
        val totals = Fields(json, fields.field("totals"))
        json.keys().forEach { key ->
            if (key != "energy" && key != "distance") {
                throw HealthException.invalidArgument(totals.field(key), "isn't a workout total (energy, distance)", "notApplicable")
            }
        }
        val clientId = fields.optString("clientId")
        val records = mutableListOf<Record>()
        if (totals.has("energy")) {
            records += ActiveCaloriesBurnedRecord(
                startTime = start.toInstant(),
                startZoneOffset = start.offset,
                endTime = end.toInstant(),
                endZoneOffset = end.offset,
                energy = Energy.kilocalories(amount(totals, "energy")),
                metadata = RecordCodec.metadata(fields, clientId?.let { "$it:energy" }),
            )
        }
        if (totals.has("distance")) {
            records += DistanceRecord(
                startTime = start.toInstant(),
                startZoneOffset = start.offset,
                endTime = end.toInstant(),
                endZoneOffset = end.offset,
                distance = Length.meters(amount(totals, "distance")),
                metadata = RecordCodec.metadata(fields, clientId?.let { "$it:distance" }),
            )
        }
        return records
    }

    // endregion
}
