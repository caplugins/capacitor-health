package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.caplugins.health.generated.Registry
import com.caplugins.health.generated.RegistryEntry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId

/**
 * `aggregate()` (R7, decisions #56–#58): Health Connect's aggregations, which remove overlap between apps only
 * for activity types. Minute and hour buckets are durations; day, week and month buckets are periods in the
 * device's zone (Health Connect places each record by its own zone offset).
 */
class Aggregation(
    private val client: HealthConnectClient,
    private val types: HealthTypes,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
) {
    companion object {
        /** The metrics `aggregate()` serves for [entry], in a stable order. */
        fun metrics(entry: RegistryEntry): List<String> = listOf("sum", "avg", "min", "max", "count", "duration").filter { it in entry.aggregates }

        /** A metric's value as the bridge reports it: in [unit], a count, or seconds. */
        fun bridgeValue(metric: String, value: Any, unit: String): Double =
            when (metric) {
                "count" -> (value as Number).toDouble()
                "duration" -> (value as Duration).toMillis() / 1000.0
                else -> Registry.units.getValue(unit).read(value)
            }

        /** Duration buckets from [start] to [end]; the last ends at [end]. */
        fun durationBuckets(start: Instant, end: Instant, step: Duration): List<Pair<Instant, Instant>> =
            generateSequence(start) { it.plus(step) }.takeWhile { it.isBefore(end) }.map { it to minOf(it.plus(step), end) }.toList()

        /** Calendar buckets: [start] + n × [step], each counted from [start] so months keep their day. */
        fun periodBuckets(start: LocalDateTime, end: LocalDateTime, step: Period): List<Pair<LocalDateTime, LocalDateTime>> {
            val buckets = mutableListOf<Pair<LocalDateTime, LocalDateTime>>()
            var lower = start
            var index = 1
            while (lower.isBefore(end)) {
                val upper = start.plus(step.multipliedBy(index))
                buckets += lower to minOf(upper, end)
                lower = upper
                index++
            }
            return buckets
        }
    }

    suspend fun aggregate(options: Fields): JSObject {
        val typeId = options.string("type")
        val entry = types.resolve(typeId)
        val available = metrics(entry)
        if (available.isEmpty()) {
            throw HealthException(HealthException.UNSUPPORTED_TYPE, "$typeId can't be aggregated on Android.", JSObject().put("type", typeId).put("reason", "notAggregatable"))
        }
        val requested = options.optStrings("metrics")?.distinct()
        if (requested.isNullOrEmpty() || !available.containsAll(requested)) {
            throw HealthException.invalidArgument("metrics", "must be some of ${available.joinToString(", ")}", "metricUnsupported")
        }
        val start = options.date("startDate").toInstant()
        val end = options.date("endDate").toInstant()
        if (!end.isAfter(start)) throw HealthException.invalidArgument("endDate", "must be after startDate", "emptyRange")
        val unit = options.optString("unit") ?: entry.unit ?: ""
        if (unit !in entry.units) throw HealthException.invalidArgument("unit", "isn't a unit of $typeId")
        val metrics: Map<String, AggregateMetric<*>> = requested.associateWith { entry.aggregates.getValue(it) }
        val origins = options.optStrings("sourceIds")?.map { DataOrigin(it) }?.toSet() ?: emptySet()
        val bucket = options.optObject("bucket")
        val bucketUnit = bucket?.optString("unit")?.ifEmpty { null }
        val size = (bucket?.optInt("size", 1) ?: 1).coerceAtLeast(1).toLong()
        val zone = zone()

        val buckets: List<Triple<Instant, Instant, AggregationResult?>> = when (bucketUnit) {
            null -> listOf(Triple(start, end, client.aggregate(AggregateRequest(metrics.values.toSet(), TimeRangeFilter.between(start, end), origins))))
            "minute", "hour" -> {
                val step = if (bucketUnit == "minute") Duration.ofMinutes(size) else Duration.ofHours(size)
                val groups = client.aggregateGroupByDuration(AggregateGroupByDurationRequest(metrics.values.toSet(), TimeRangeFilter.between(start, end), step, origins))
                    .associateBy { it.startTime }
                durationBuckets(start, end, step).map { (lower, upper) -> Triple(lower, upper, groups[lower]?.result) }
            }
            else -> {
                val step = when (bucketUnit) {
                    "day" -> Period.ofDays(size.toInt())
                    "week" -> Period.ofWeeks(size.toInt())
                    else -> Period.ofMonths(size.toInt())
                }
                // Health Connect wants local times for periods; Instant ranges throw.
                val localStart = LocalDateTime.ofInstant(start, zone)
                val localEnd = LocalDateTime.ofInstant(end, zone)
                val groups = client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(metrics.values.toSet(), TimeRangeFilter.between(localStart, localEnd), step, origins))
                    .associateBy { it.startTime }
                periodBuckets(localStart, localEnd, step).map { (lower, upper) ->
                    Triple(lower.atZone(zone).toInstant(), upper.atZone(zone).toInstant(), groups[lower]?.result)
                }
            }
        }

        val json = buckets.map { (lower, upper, result) ->
            val values = JSObject()
            if (result != null) {
                for ((name, metric) in metrics) {
                    @Suppress("UNCHECKED_CAST")
                    val value = result[metric as AggregateMetric<Any>] ?: continue
                    values.put(name, bridgeValue(name, value, unit))
                }
            }
            JSObject()
                .put("startDate", DateCoding.format(lower, zone.rules.getOffset(lower)))
                .put("endDate", DateCoding.format(upper, zone.rules.getOffset(upper)))
                .put("values", values)
                .put("unit", unit)
        }
        HealthLog.debug("aggregate $typeId: ${json.size} buckets")
        return JSObject().put("buckets", JSArray(json))
    }
}
