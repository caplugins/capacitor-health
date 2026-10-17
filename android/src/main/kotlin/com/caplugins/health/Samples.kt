package com.caplugins.health

import android.util.Base64
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
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
    private val encodeBase64: (ByteArray) -> String = ::base64,
    private val decodeBase64: (String) -> ByteArray = ::unbase64,
) {
    companion object {
        const val DEFAULT_LIMIT = 1000
        const val MAX_LIMIT = 10000

        /** Health Connect's largest read page. */
        const val MAX_PAGE_SIZE = 5000

        /** Insert at most this many records per call (rate limits, binder size). */
        const val WRITE_CHUNK = 1000

        fun base64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

        fun unbase64(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
    }

    // region Read

    suspend fun read(options: Fields): JSObject {
        val typeId = options.string("type")
        val entry = types.resolve(typeId)
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
        // as on iOS. Interval records without one (skin temperature) keep start-time matching.
        val lookBack = if (entry.time == RecordTime.INTERVAL) entry.maxDuration else null
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
        val result = JSObject().put("samples", JSArray(records.map { RecordCodec.encode(it, entry, unit, cycleStarts[it.metadata.id]) }))
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

    private suspend fun <T : Record> readAll(type: KClass<T>, from: Instant, to: Instant): List<T> {
        val all = mutableListOf<T>()
        var token: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(from, to), pageSize = MAX_PAGE_SIZE, pageToken = token))
            all += response.records
            token = response.pageToken?.takeIf { it.isNotEmpty() }
        } while (token != null)
        return all
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
        for (i in 0 until samples.length()) {
            val fields = Fields(samples.getJSONObject(i), "samples[$i]")
            val decoded = RecordCodec.decode(fields, types.resolveWritable(fields.string("type")))
            primaryIndex[i] = records.size
            records += decoded.primary
            records += decoded.extras
        }
        val ids = records.chunked(WRITE_CHUNK).flatMap { client.insertRecords(it).recordIdsList }
        return JSObject().put("ids", JSArray(primaryIndex.map { ids[it] }))
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
        val ids = options.optStrings("ids")
        val clientIds = options.optStrings("clientIds")
        val token = runCatching { client.getChangesToken(ChangesTokenRequest(setOf(entry.record))) }.getOrNull()
        when {
            ids != null -> client.deleteRecords(entry.record, ids, emptyList())
            clientIds != null -> client.deleteRecords(entry.record, emptyList(), clientIds)
            else -> client.deleteRecords(entry.record, TimeRangeFilter.between(options.date("startDate").toInstant(), options.date("endDate").toInstant()))
        }
        val deleted = token?.let { countDeletions(it) } ?: (ids?.size ?: clientIds?.size ?: 0)
        return JSObject().put("deleted", deleted)
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
