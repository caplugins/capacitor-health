package com.caplugins.health

import android.util.Base64
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.caplugins.health.generated.RecordTime
import com.caplugins.health.generated.RegistryEntry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.math.ceil
import kotlin.reflect.KClass
import org.json.JSONArray
import org.json.JSONObject

/** `readSamples`, `saveSamples` and `deleteSamples` (decisions #30, #31, #16). */
class Samples(
    private val client: HealthConnectClient,
    private val types: HealthTypes,
    private val ownPackage: String,
    private val encodeBase64: (ByteArray) -> String = ::base64,
    private val decodeBase64: (String) -> ByteArray = ::unbase64,
) {
    companion object {
        const val DEFAULT_LIMIT = 1000
        const val MAX_LIMIT = 10000

        /** Health Connect's largest read page. */
        const val MAX_PAGE_SIZE = 5000

        /** How far either side of a re-written workout to look for its old version (decision #68). */
        val REWRITE_SEARCH: Duration = Duration.ofDays(14)

        /** Insert at most this many records per call (rate limits, binder size). */
        const val WRITE_CHUNK = 1000

        fun base64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

        fun unbase64(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
    }

    // region Read

    suspend fun read(options: Fields): JSObject {
        val typeId = options.string("type")
        val entry = types.resolveSamples(typeId)
        val start = options.date("startDate").toInstant()
        val end = options.date("endDate").toInstant()
        val limit = (options.optInt("limit") ?: DEFAULT_LIMIT).coerceIn(1, MAX_LIMIT)
        val ascending = options.optBoolean("ascending") ?: true
        val unit = options.optString("unit")
        if (unit != null && unit !in entry.units) throw HealthException.invalidArgument("unit", "isn't a unit of $typeId")
        val origins = options.optStrings("sourceIds")?.map { DataOrigin(it) }?.toSet() ?: emptySet()
        var token = options.optString("cursor")?.let { decodeCursor(it, typeId) }
        // Health Connect matches interval records by start time only (T16, API 34). For records with a
        // maximum length, query that much earlier and keep the ones that overlap, so reads mean "overlap"
        // as on iOS; sleep sessions and workouts look back a day (decisions #66, #69). Other interval records
        // without one (skin temperature) keep start-time matching.
        val lookBack = when {
            entry.id == SleepSessions.TYPE_ID -> SleepSessions.LOOK_BACK
            entry.id == Workouts.TYPE_ID -> Workouts.LOOK_BACK
            entry.time == RecordTime.INTERVAL -> entry.maxDuration
            else -> null
        }
        val queryStart = lookBack?.let { start.minus(it) } ?: start

        // Equal page sizes that add up to at most `limit`: Health Connect pages are 5,000 at most.
        val pages = ceil(limit / MAX_PAGE_SIZE.toDouble()).toInt()
        val pageSize = ceil(limit / pages.toDouble()).toInt()
        val records = mutableListOf<Record>()
        repeat(pages) {
            if (it > 0 && token == null) return@repeat
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = entry.record,
                    timeRangeFilter = TimeRangeFilter.between(queryStart, end),
                    dataOriginFilter = origins,
                    ascendingOrder = ascending,
                    pageSize = pageSize,
                    pageToken = token,
                ),
            )
            records += if (lookBack == null) response.records else response.records.filter { r -> RecordCodec.times(r).end.isAfter(start) }
            token = response.pageToken?.takeIf { t -> t.isNotEmpty() }
        }

        val cycleStarts = if (entry.record == MenstruationFlowRecord::class) cycleStarts(records.filterIsInstance<MenstruationFlowRecord>()) else emptyMap()
        val totals = workoutTotals(records.filterIsInstance<ExerciseSessionRecord>())
        // A series record gives one sample per point, so a page can hold more samples than `limit` (decision #53).
        val result = JSObject().put(
            "samples",
            JSArray(records.flatMap { RecordCodec.encodeAll(it, entry, unit, cycleStarts[it.metadata.id], totals[it.metadata.id]) }),
        )
        token?.let { result.put("nextCursor", encodeCursor(typeId, it)) }
        HealthLog.debug("readSamples $typeId: ${records.size} records")
        return result
    }

    /**
     * Decision #16 for each flow record id, from the periods around them. The window reaches a full period
     * length past both ends, so it finds every covering period whether Health Connect matches interval
     * records by start time or only when they fit inside the range (FakeHealthConnectClient does the latter).
     */
    suspend fun cycleStarts(flows: List<MenstruationFlowRecord>): Map<String, Boolean> {
        if (flows.isEmpty()) return emptyMap()
        val margin = Duration.ofDays(RecordCodec.MAX_PERIOD_DAYS.toLong() + 1)
        val from = flows.minOf { it.time }.minus(margin)
        val to = flows.maxOf { it.time }.plus(margin)
        val periods = readAll(MenstruationPeriodRecord::class, from, to).map(CycleStart::period)
        return flows.mapNotNull { flow ->
            val day = flow.time.atOffset(flow.zoneOffset ?: ZoneOffset.UTC).toLocalDate()
            CycleStart.of(day, flow.metadata.dataOrigin.packageName, periods)?.let { flow.metadata.id to it }
        }.toMap()
    }

    private suspend fun <T : Record> readAll(type: KClass<T>, from: Instant, to: Instant, origins: Set<DataOrigin> = emptySet()): List<T> {
        val all = mutableListOf<T>()
        var token: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(from, to), origins, pageSize = MAX_PAGE_SIZE, pageToken = token))
            all += response.records
            token = response.pageToken?.takeIf { it.isNotEmpty() }
        } while (token != null)
        return all
    }

    /**
     * Totals of [sessions] (decision #67): the active calories and distance records each session's app wrote over it,
     * a record partly inside counted in proportion. Each app's sessions are read in windows reaching a day either
     * side, merged where they meet: Health Connect matches records by start time (T16), and a client that matches
     * only records inside the range (the Health Connect app, FakeHealthConnectClient) still finds those crossing the
     * session's edges. A type this app may not read has no totals.
     */
    suspend fun workoutTotals(sessions: List<ExerciseSessionRecord>): Map<String, Workouts.Totals> {
        if (sessions.isEmpty()) return emptyMap()
        val energy = sumOver(ActiveCaloriesBurnedRecord::class, sessions) { it.energy.inKilocalories }
        val distance = sumOver(DistanceRecord::class, sessions) { it.distance.inMeters }
        return sessions.associate { it.metadata.id to Workouts.Totals(energy[it.metadata.id], distance[it.metadata.id]) }
    }

    private suspend fun <T : Record> sumOver(type: KClass<T>, sessions: List<ExerciseSessionRecord>, value: (T) -> Double): Map<String, Double> =
        try {
            sessions.groupBy { it.metadata.dataOrigin.packageName }.flatMap { (app, own) ->
                val windows = mutableListOf<Pair<Instant, Instant>>()
                for (session in own.sortedBy { it.startTime }) {
                    val from = session.startTime.minus(Workouts.LOOK_BACK)
                    val to = session.endTime.plus(Workouts.LOOK_BACK)
                    val last = windows.lastOrNull()
                    if (last != null && !from.isAfter(last.second)) {
                        windows[windows.lastIndex] = last.first to maxOf(last.second, to)
                    } else {
                        windows += from to to
                    }
                }
                val records = windows.flatMap { (from, to) -> readAll(type, from, to, setOf(DataOrigin(app))) }.distinctBy { it.metadata.id }
                val parts = records.map { record -> RecordCodec.times(record).let { Triple(it.start, it.end, value(record)) } }
                Workouts.sum(own, parts).entries
            }.associate { it.key to it.value }
        } catch (_: SecurityException) {
            emptyMap()
        }

    /** Wraps Health Connect's page token so a cursor can't be replayed against another type. */
    private fun encodeCursor(typeId: String, pageToken: String): String =
        encodeBase64(JSONObject().put("v", 1).put("t", typeId).put("p", pageToken).toString().toByteArray())

    private fun decodeCursor(cursor: String, typeId: String): String {
        val json = runCatching { JSONObject(String(decodeBase64(cursor))) }.getOrNull()
        if (json == null || json.optInt("v") != 1 || json.optString("p").isEmpty()) {
            throw HealthException.invalidArgument("cursor", "isn't a readSamples cursor")
        }
        if (json.optString("t") != typeId) throw HealthException.invalidArgument("cursor", "belongs to another type", "cursorMismatch")
        return json.getString("p")
    }

    // endregion

    // region Save

    /** Inserts in chunks; Health Connect's ids are stable and derived from `clientRecordId` (decision #31). */
    suspend fun save(samples: JSONArray): JSObject {
        if (samples.length() == 0) throw HealthException.invalidArgument("samples", "must be a non-empty array")
        val records = mutableListOf<Record>()
        val primaryIndex = IntArray(samples.length())
        val periods = mutableListOf<RecordCodec.Decoded>()
        val workouts = mutableListOf<RecordCodec.Decoded>()
        for (i in 0 until samples.length()) {
            val fields = Fields(samples.getJSONObject(i), "samples[$i]")
            val decoded = RecordCodec.decode(fields, types.resolveWritable(fields.string("type")))
            primaryIndex[i] = records.size
            records += decoded.primary
            records += decoded.extras
            if (decoded.primary is MenstruationPeriodRecord && decoded.primary.metadata.clientRecordId != null) periods += decoded
            if (decoded.primary is ExerciseSessionRecord) workouts += decoded
        }
        if (workouts.any { it.extras.isNotEmpty() }) requireTotalsAccess(workouts)
        if (periods.isNotEmpty()) deleteReplacedDayFlows(periods)
        workouts.filter { it.primary.metadata.clientRecordId != null }.takeIf { it.isNotEmpty() }?.let { deleteReplacedTotals(it) }
        val ids = records.chunked(WRITE_CHUNK).flatMap { client.insertRecords(it).recordIdsList }
        return JSObject().put("ids", JSArray(primaryIndex.map { ids[it] }))
    }

    // endregion

    // region Period day flows

    /**
     * A period written with `flow` also writes flow records with clientIds `<clientId>:<yyyy-mm-dd>`; they
     * belong to the period, as the per-day samples do on iOS. Health Connect has no prefix query, so the
     * plugin finds this app's periods (few per year) and works out their day clientIds.
     */
    private suspend fun ownPeriods(): List<MenstruationPeriodRecord> =
        readAll(MenstruationPeriodRecord::class, Instant.EPOCH, Instant.now().plus(Duration.ofDays(366)), setOf(DataOrigin(ownPackage)))

    private fun dayFlowClientIds(period: MenstruationPeriodRecord): List<String> {
        val clientId = period.metadata.clientRecordId ?: return emptyList()
        val first = PeriodDays.firstDay(period)
        val last = PeriodDays.lastDay(period)
        return generateSequence(first) { it.plusDays(1) }.takeWhile { !it.isAfter(last) }.map { "$clientId:$it" }.toList()
    }

    /** Before re-writing a period, deletes its old day flows the new write doesn't replace. */
    private suspend fun deleteReplacedDayFlows(periods: List<RecordCodec.Decoded>) {
        val existing = ownPeriods().associateBy { it.metadata.clientRecordId }
        val stale = periods.flatMap { decoded ->
            val period = decoded.primary as MenstruationPeriodRecord
            val old = existing[period.metadata.clientRecordId] ?: return@flatMap emptyList()
            // A lower version is ignored by Health Connect, so its flows must stay too.
            if (period.metadata.clientRecordVersion < old.metadata.clientRecordVersion) return@flatMap emptyList()
            val kept = decoded.extras.mapNotNull { it.metadata.clientRecordId }.toSet()
            dayFlowClientIds(old).filterNot { it in kept }
        }
        deleteSkippingMissing(MenstruationFlowRecord::class, stale, byClientId = true)
    }

    // endregion

    // region Workout totals

    /**
     * Totals are records of their own types (decision #67). Health Connect rejects the whole insert without write
     * access to them, with a message that doesn't say which type, so the plugin checks first (as on iOS, #68).
     */
    private suspend fun requireTotalsAccess(workouts: List<RecordCodec.Decoded>) {
        val granted = client.permissionController.getGrantedPermissions()
        val needed = workouts.flatMap { it.extras }.map { it::class }.distinct()
        for (record in needed) {
            if (HealthPermission.getWritePermission(record) in granted) continue
            val typeId = if (record == DistanceRecord::class) "distance" else "activeEnergy"
            throw HealthException(
                HealthException.PERMISSION_DENIED,
                "Writing a workout's totals needs write access to $typeId.",
                JSObject().put("type", typeId),
            )
        }
    }

    /**
     * Before re-writing a workout with a clientId, deletes its old totals the new version lacks. This app's sessions
     * within 14 days either side are searched for the old version (as on iOS, #68); when it's newer, Health Connect
     * ignores the write and its totals stay.
     */
    private suspend fun deleteReplacedTotals(workouts: List<RecordCodec.Decoded>) {
        val stale = workouts.flatMap<RecordCodec.Decoded, Pair<String, KClass<out Record>>> { decoded ->
            val session = decoded.primary as ExerciseSessionRecord
            val clientId = session.metadata.clientRecordId ?: return@flatMap emptyList()
            val old = readAll(
                ExerciseSessionRecord::class,
                session.startTime.minus(REWRITE_SEARCH),
                session.endTime.plus(REWRITE_SEARCH),
                setOf(DataOrigin(ownPackage)),
            ).firstOrNull { it.metadata.clientRecordId == clientId }
            if (old != null && session.metadata.clientRecordVersion < old.metadata.clientRecordVersion) return@flatMap emptyList()
            val kept = decoded.extras.mapNotNull { it.metadata.clientRecordId }.toSet()
            Workouts.totalClientIds(clientId).filterNot { it in kept }.map { key ->
                val record: KClass<out Record> = if (key.endsWith(":energy")) ActiveCaloriesBurnedRecord::class else DistanceRecord::class
                key to record
            }
        }
        stale.groupBy({ it.second }, { it.first }).forEach { (record, keys) -> deleteSkippingMissing(record, keys, byClientId = true) }
    }

    /**
     * Deleting workouts deletes the totals this app wrote with them (decision #67): `<clientId>:energy` /
     * `<clientId>:distance`, and this app's active calories and distance records spanning exactly one of its sessions.
     * Other apps' data is never touched, nor a type this app may not write (it can't delete it, and the workout's
     * delete mustn't fail for it; as on iOS, #68).
     */
    private suspend fun deleteWorkoutTotals(ids: List<String>?, clientIds: List<String>?, range: Pair<Instant, Instant>?) {
        val own = setOf(DataOrigin(ownPackage))
        val sessions: List<ExerciseSessionRecord> = when {
            ids != null -> ids.mapNotNull { id -> runCatching { client.readRecord(ExerciseSessionRecord::class, id).record }.getOrNull() }
                .filter { it.metadata.dataOrigin.packageName == ownPackage }
            range != null -> readAll(ExerciseSessionRecord::class, range.first, range.second, own)
            else -> emptyList()
        }
        val keys = (clientIds.orEmpty() + sessions.mapNotNull { it.metadata.clientRecordId }).flatMap(Workouts::totalClientIds)
        val unnamed = sessions.filter { it.metadata.clientRecordId == null }
        val granted = client.permissionController.getGrantedPermissions()
        val writable = listOf<KClass<out Record>>(ActiveCaloriesBurnedRecord::class, DistanceRecord::class)
            .filter { HealthPermission.getWritePermission(it) in granted }
        for (record in writable) {
            deleteSkippingMissing(record, keys.filter { it.endsWith(if (record == DistanceRecord::class) ":distance" else ":energy") }, byClientId = true)
            if (unnamed.isEmpty()) continue
            val spanning = unnamed.flatMap { session ->
                // A range's end is exclusive where a client matches records inside it.
                val found = try {
                    readAll(record, session.startTime, session.endTime.plusSeconds(1), own)
                } catch (_: SecurityException) {
                    emptyList()
                }
                found.filter { r -> RecordCodec.times(r).let { it.start == session.startTime && it.end == session.endTime } }
            }
            deleteSkippingMissing(record, spanning.map { it.metadata.id }, byClientId = false)
        }
    }

    // endregion

    // region Delete

    /**
     * Health Connect's delete calls return nothing, so the count comes from the Changes API: a token taken
     * just before deleting reports exactly the deletions. That needs read access; without it the count is
     * the number of ids or clientIds passed (0 for a range).
     */
    suspend fun delete(options: Fields): JSObject {
        val entry: RegistryEntry = types.resolveWritable(options.string("type"))
        // A series point's id (`<recordId>#<index>`) deletes its whole record (decision #53).
        val ids = options.optStrings("ids")?.map { it.substringBefore('#') }?.distinct()
        val clientIds = options.optStrings("clientIds")
        val token = runCatching { client.getChangesToken(ChangesTokenRequest(setOf(entry.record))) }.getOrNull()
        if (entry.record == MenstruationPeriodRecord::class) {
            val range = if (ids == null && clientIds == null) options.date("startDate").toInstant() to options.date("endDate").toInstant() else null
            val targets = ownPeriods().filter { period ->
                when {
                    ids != null -> period.metadata.id in ids
                    clientIds != null -> period.metadata.clientRecordId in clientIds
                    range != null -> period.startTime.isBefore(range.second) && period.endTime.isAfter(range.first)
                    else -> false
                }
            }
            deleteSkippingMissing(MenstruationFlowRecord::class, targets.flatMap(::dayFlowClientIds), byClientId = true)
        }
        if (entry.record == ExerciseSessionRecord::class) {
            val range = if (ids == null && clientIds == null) options.date("startDate").toInstant() to options.date("endDate").toInstant() else null
            deleteWorkoutTotals(ids, clientIds, range)
        }
        when {
            ids != null -> deleteSkippingMissing(entry.record, ids, byClientId = false)
            clientIds != null -> deleteSkippingMissing(entry.record, clientIds, byClientId = true)
            else -> client.deleteRecords(entry.record, TimeRangeFilter.between(options.date("startDate").toInstant(), options.date("endDate").toInstant()))
        }
        val deleted = token?.let { countDeletions(it) } ?: (ids?.size ?: clientIds?.size ?: 0)
        return JSObject().put("deleted", deleted)
    }

    /**
     * Deletes by [keys] (ids or clientIds), skipping the ones that don't exist and other apps' records. Health Connect
     * instead rejects the whole call and deletes nothing when ids belong to other apps: the error names them (all of
     * them on the Health Connect app, the first one on Android 14+), so they're dropped and the rest retried
     * (decisions #46, #47). The Health Connect app (Android 13 and lower) also rejects keys that don't exist
     * (`INVALID_UID`, decision #45), which Android 14+ skips: then the list is halved until each missing key is alone.
     */
    private suspend fun deleteSkippingMissing(record: KClass<out Record>, keys: List<String>, byClientId: Boolean) {
        if (keys.isEmpty()) return
        try {
            if (byClientId) client.deleteRecords(record, emptyList(), keys) else client.deleteRecords(record, keys, emptyList())
        } catch (e: Exception) {
            val othersIds = HealthException.otherAppsRecordIds(e)
            if (othersIds == null && !HealthException.isMissingRecord(e)) throw e
            val rest = othersIds?.let { ids -> keys.filterNot { it.lowercase() in ids } } ?: keys
            if (rest.size < keys.size) return deleteSkippingMissing(record, rest, byClientId)
            if (keys.size == 1) return
            val half = keys.size / 2
            deleteSkippingMissing(record, keys.subList(0, half), byClientId)
            deleteSkippingMissing(record, keys.subList(half, keys.size), byClientId)
        }
    }

    private suspend fun countDeletions(start: String): Int? =
        runCatching {
            var token = start
            var count = 0
            do {
                val response = client.getChanges(token)
                count += response.changes.count { it is DeletionChange }
                token = response.nextChangesToken
            } while (response.hasMore)
            count
        }.getOrNull()

    // endregion
}
