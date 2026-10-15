package com.caplugins.health.spike

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlin.reflect.KClass

// M0 spike (decision #25): hard-coded to menstruation, deleted at the end of M0 (T10).
// Proves the manifest check, the permission flow, clientRecordId upserts, changes tokens and deletes.
class MenstruationSpike(private val context: Context) {
    val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    private val zone: ZoneId get() = ZoneId.systemDefault()

    /** Permissions in [requested] that the app's merged manifest doesn't declare. */
    fun missingDeclarations(requested: Collection<String>): List<String> {
        val pm = context.packageManager
        val info =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
            }
        val declared = info.requestedPermissions?.toSet() ?: emptySet()
        return requested.filterNot { it in declared }
    }

    suspend fun granted(): Set<String> = client.permissionController.getGrantedPermissions()

    /**
     * Writes one instantaneous flow record per local day at noon and, if [withPeriod], one period
     * covering those days, from local midnight of day 1 to [periodEnd]: the next local midnight,
     * the last day's 23:59:59.999999999 (`endOfDay`) or the last day's noon (`lastNoon`).
     */
    suspend fun write(
        startDay: String,
        days: Int,
        flow: Int,
        prefix: String,
        version: Long,
        withPeriod: Boolean,
        withFlows: Boolean = true,
        periodEnd: String = "nextMidnight",
    ): JSObject {
        val first = LocalDate.parse(startDay)
        val records = mutableListOf<Record>()
        for (offset in 0 until if (withFlows) days else 0) {
            val day = first.plusDays(offset.toLong())
            val time = day.atTime(LocalTime.NOON).atZone(zone)
            records +=
                MenstruationFlowRecord(
                    time = time.toInstant(),
                    zoneOffset = time.offset,
                    metadata = Metadata.manualEntry("$prefix:flow:$day", version),
                    flow = flow,
                )
        }
        if (withPeriod) {
            val start = first.atStartOfDay(zone)
            val last = first.plusDays(days - 1L)
            val end =
                when (periodEnd) {
                    "endOfDay" -> last.atTime(LocalTime.MAX).atZone(zone)
                    "lastNoon" -> last.atTime(LocalTime.NOON).atZone(zone)
                    else -> last.plusDays(1).atStartOfDay(zone)
                }
            records +=
                MenstruationPeriodRecord(
                    startTime = start.toInstant(),
                    startZoneOffset = start.offset,
                    endTime = end.toInstant(),
                    endZoneOffset = end.offset,
                    metadata = Metadata.manualEntry("$prefix:period:$first", version),
                )
        }
        val ids = client.insertRecords(records).recordIdsList
        return JSObject().apply {
            put("count", ids.size)
            put("ids", JSArray(ids))
        }
    }

    suspend fun read(): JSObject {
        val range = TimeRangeFilter.between(Instant.parse("2020-01-01T00:00:00Z"), Instant.now().plus(Duration.ofDays(400)))
        val flows = client.readRecords(ReadRecordsRequest(MenstruationFlowRecord::class, range)).records
        val periods = client.readRecords(ReadRecordsRequest(MenstruationPeriodRecord::class, range)).records
        return JSObject().apply {
            put("flowCount", flows.size)
            put("periodCount", periods.size)
            put("flows", JSArray(flows.map(::encode)))
            put("periods", JSArray(periods.map(::encode)))
        }
    }

    /** No cursor → fresh per-type tokens only. Otherwise drains each token and returns the new ones. */
    suspend fun changes(cursor: JSObject?): JSObject {
        val types = mapOf("flow" to MenstruationFlowRecord::class, "period" to MenstruationPeriodRecord::class)
        val next = JSObject()
        val result = JSObject()
        if (cursor == null) {
            types.forEach { (key, type) -> next.put(key, client.getChangesToken(ChangesTokenRequest(setOf(type)))) }
            result.put("nextCursor", next.toString())
            return result
        }
        val upserts = JSArray()
        val deleted = JSArray()
        val expired = JSArray()
        var pages = 0
        for ((key, _) in types) {
            var token = cursor.getString(key) ?: continue
            while (true) {
                val response = client.getChanges(token)
                pages++
                if (response.changesTokenExpired) expired.put(key)
                response.changes.forEach { change ->
                    when (change) {
                        is UpsertionChange -> upserts.put(encode(change.record).put("tokenType", key))
                        is DeletionChange -> deleted.put(JSObject().put("id", change.recordId).put("tokenType", key))
                    }
                }
                token = response.nextChangesToken
                if (!response.hasMore) break
            }
            next.put(key, token)
        }
        return result.apply {
            put("pages", pages)
            put("upserts", upserts)
            put("deleted", deleted)
            put("expired", expired)
            put("nextCursor", next.toString())
        }
    }

    suspend fun delete(type: String, ids: List<String>, clientIds: List<String>): JSObject {
        client.deleteRecords(recordType(type), ids, clientIds)
        return JSObject().put("requested", ids.size + clientIds.size)
    }

    /** Inserts periods of exactly 31 days and 31 days + 1 s; reports what each does, then cleans up. */
    suspend fun periodLimit(): JSObject {
        val start = LocalDate.parse("2026-08-01").atStartOfDay(zone)
        val result = JSObject()
        for ((label, length) in listOf("31d" to Duration.ofDays(31), "31d+1s" to Duration.ofDays(31).plusSeconds(1), "0s" to Duration.ZERO)) {
            val clientId = "spike-limit:$label"
            result.put(
                label,
                runCatching {
                    val end = start.toInstant().plus(length)
                    val record =
                        MenstruationPeriodRecord(start.toInstant(), start.offset, end, start.offset, Metadata.manualEntry(clientId, 1))
                    client.insertRecords(listOf(record)).recordIdsList.first()
                }.fold(
                    onSuccess = { JSObject().put("inserted", it) },
                    onFailure = { JSObject().put("error", it.javaClass.name).put("message", it.message) },
                ),
            )
            runCatching { client.deleteRecords(MenstruationPeriodRecord::class, emptyList(), listOf(clientId)) }
        }
        return result
    }

    private fun recordType(type: String): KClass<out Record> =
        if (type == "period") MenstruationPeriodRecord::class else MenstruationFlowRecord::class

    private fun encode(record: Record): JSObject {
        val m = record.metadata
        val json =
            JSObject().apply {
                put("id", m.id)
                put("clientRecordId", m.clientRecordId)
                put("clientRecordVersion", m.clientRecordVersion)
                put("dataOrigin", m.dataOrigin.packageName)
                put("lastModifiedTime", m.lastModifiedTime.toString())
                put("recordingMethod", m.recordingMethod)
                put("device", m.device?.let { "${it.manufacturer}/${it.model}/${it.type}" })
            }
        when (record) {
            is MenstruationFlowRecord -> {
                json.put("type", "flow")
                json.put("time", record.time.toString())
                json.put("zoneOffset", record.zoneOffset?.toString())
                json.put("flow", record.flow)
            }
            is MenstruationPeriodRecord -> {
                json.put("type", "period")
                json.put("startTime", record.startTime.toString())
                json.put("endTime", record.endTime.toString())
                json.put("startZoneOffset", record.startZoneOffset?.toString())
                json.put("endZoneOffset", record.endZoneOffset?.toString())
            }
        }
        return json
    }

    companion object {
        val PERMISSIONS =
            listOf(
                HealthPermission.getReadPermission(MenstruationFlowRecord::class),
                HealthPermission.getWritePermission(MenstruationFlowRecord::class),
                HealthPermission.getReadPermission(MenstruationPeriodRecord::class),
                HealthPermission.getWritePermission(MenstruationPeriodRecord::class),
            )

        fun rawValues(): JSObject =
            JSObject().apply {
                put("permissions", JSArray(PERMISSIONS))
                put("ovulationTestPermission", HealthPermission.getReadPermission(OvulationTestRecord::class))
                put("historyPermission", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
                put("flowUnknown", MenstruationFlowRecord.FLOW_UNKNOWN)
                put("flowLight", MenstruationFlowRecord.FLOW_LIGHT)
                put("flowMedium", MenstruationFlowRecord.FLOW_MEDIUM)
                put("flowHeavy", MenstruationFlowRecord.FLOW_HEAVY)
                put("ovulationInconclusive", OvulationTestRecord.RESULT_INCONCLUSIVE)
                put("ovulationPositive", OvulationTestRecord.RESULT_POSITIVE)
                put("ovulationHigh", OvulationTestRecord.RESULT_HIGH)
                put("ovulationNegative", OvulationTestRecord.RESULT_NEGATIVE)
            }
    }
}
