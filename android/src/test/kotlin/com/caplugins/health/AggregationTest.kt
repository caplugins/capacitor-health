package com.caplugins.health

import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.aggregate.AggregationResultGroupedByDuration
import androidx.health.connect.client.aggregate.AggregationResultGroupedByPeriod
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.testing.AggregationResult
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.testing.stubs.MutableStub
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import com.caplugins.health.generated.Registry
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** `aggregate()` on Android (T33) against FakeHealthConnectClient's stubbed aggregations. */
class AggregationTest {
    private val berlin = ZoneId.of("Europe/Berlin")
    private val client = FakeHealthConnectClient()
    private val aggregation = Aggregation(client, HealthTypes { true }) { berlin }

    @Suppress("UNCHECKED_CAST")
    private fun result(vararg values: Pair<AggregateMetric<*>, Any>): AggregationResult =
        AggregationResult(metrics = values.toMap() as Map<AggregateMetric<Any>, Any>)

    private suspend fun call(json: String) = aggregation.aggregate(Fields(JSONObject(json)))

    @Test
    fun metricsComeFromTheRegistry() {
        assertEquals(listOf("sum"), Aggregation.metrics(Registry.byId.getValue("steps")))
        assertEquals(listOf("avg", "min", "max", "count"), Aggregation.metrics(Registry.byId.getValue("heartRate")))
        assertEquals(listOf("sum"), Aggregation.metrics(Registry.byId.getValue("basalEnergy")))
        assertEquals(emptyList<String>(), Aggregation.metrics(Registry.byId.getValue("menstrualFlow")))
        val types = HealthTypes { true }
        assertTrue(types.support("steps").getBoolean("aggregatable"))
        assertEquals("sum", types.support("steps").getJSONArray("metrics").getString(0))
        assertTrue(types.support("basalEnergy").getBoolean("aggregatable"))
        assertFalse(types.support("menstrualFlow").getBoolean("aggregatable"))
    }

    @Test
    fun wholeRangeIsOneBucket() = runTest {
        val requests = mutableListOf<AggregateRequest>()
        client.overrides.aggregate = MutableStub { request: AggregateRequest ->
            requests += request
            result(StepsRecord.COUNT_TOTAL to 1350L)
        }
        val json = call("""{"type":"steps","startDate":"2026-10-17T20:00:00.000+02:00","endDate":"2026-10-17T21:00:00.000+02:00","metrics":["sum"],"sourceIds":["com.example.watch"]}""")
        val buckets = json.getJSONArray("buckets")
        assertEquals(1, buckets.length())
        assertEquals(1350.0, buckets.getJSONObject(0).getJSONObject("values").getDouble("sum"), 0.0)
        assertEquals("count", buckets.getJSONObject(0).getString("unit"))
        assertEquals("2026-10-17T20:00:00.000+02:00", buckets.getJSONObject(0).getString("startDate"))
        val expected = AggregateRequest(
            setOf(StepsRecord.COUNT_TOTAL),
            TimeRangeFilter.between(Instant.parse("2026-10-17T18:00:00Z"), Instant.parse("2026-10-17T19:00:00Z")),
            setOf(DataOrigin("com.example.watch")),
        )
        assertEquals(expected, requests.single())
    }

    @Test
    fun dayBucketsFollowTheCalendarAndKeepEmptyDays() = runTest {
        val requests = mutableListOf<AggregateGroupByPeriodRequest>()
        val day = { d: Int -> LocalDateTime.of(2026, 10, d, 0, 0) }
        client.overrides.aggregateGroupByPeriod = MutableStub { request: AggregateGroupByPeriodRequest ->
            requests += request
            listOf(
                AggregationResultGroupedByPeriod(result(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL to Energy.kilocalories(100.0)), day(24), day(25)),
                AggregationResultGroupedByPeriod(result(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL to Energy.kilocalories(250.0)), day(26), day(27)),
            )
        }
        // Berlin leaves summer time on 2026-10-25.
        val json = call(
            """{"type":"activeEnergy","startDate":"2026-10-24T00:00:00.000+02:00","endDate":"2026-10-27T00:00:00.000+01:00","metrics":["sum"],"unit":"kJ","bucket":{"unit":"day","size":1}}""",
        )
        val buckets = json.getJSONArray("buckets")
        assertEquals(3, buckets.length())
        assertEquals(listOf("2026-10-24T00:00:00.000+02:00", "2026-10-25T00:00:00.000+02:00", "2026-10-26T00:00:00.000+01:00"), (0 until 3).map { buckets.getJSONObject(it).getString("startDate") })
        assertEquals(418.4, buckets.getJSONObject(0).getJSONObject("values").getDouble("sum"), 1e-6)
        assertFalse(buckets.getJSONObject(1).getJSONObject("values").has("sum"))
        assertEquals(1046.0, buckets.getJSONObject(2).getJSONObject("values").getDouble("sum"), 1e-6)
        val expected = AggregateGroupByPeriodRequest(
            setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
            TimeRangeFilter.between(day(24), day(27)),
            Period.ofDays(1),
        )
        assertEquals("local times in the device's zone", expected, requests.single())
    }

    @Test
    fun hourBucketsAreDurations() = runTest {
        val start = Instant.parse("2026-10-17T18:00:00Z")
        val requests = mutableListOf<AggregateGroupByDurationRequest>()
        client.overrides.aggregateGroupByDuration = MutableStub { request: AggregateGroupByDurationRequest ->
            requests += request
            listOf(
                AggregationResultGroupedByDuration(
                    result(HeartRateRecord.BPM_AVG to 72L, HeartRateRecord.BPM_MAX to 90L, HeartRateRecord.MEASUREMENTS_COUNT to 40L),
                    start.plus(Duration.ofMinutes(30)),
                    start.plus(Duration.ofMinutes(60)),
                    ZoneOffset.UTC,
                ),
            )
        }
        val json = call("""{"type":"heartRate","startDate":"2026-10-17T18:00:00.000Z","endDate":"2026-10-17T19:15:00.000Z","metrics":["avg","max","count"],"bucket":{"unit":"minute","size":30}}""")
        val buckets = json.getJSONArray("buckets")
        assertEquals(3, buckets.length())
        assertEquals("2026-10-17T21:15:00.000+02:00", buckets.getJSONObject(2).getString("endDate"))
        val values = buckets.getJSONObject(1).getJSONObject("values")
        assertEquals(72.0, values.getDouble("avg"), 0.0)
        assertEquals(90.0, values.getDouble("max"), 0.0)
        assertEquals(40.0, values.getDouble("count"), 0.0)
        assertEquals(0, buckets.getJSONObject(0).getJSONObject("values").length())
        val expected = AggregateGroupByDurationRequest(
            setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX, HeartRateRecord.MEASUREMENTS_COUNT),
            TimeRangeFilter.between(start, start.plus(Duration.ofMinutes(75))),
            Duration.ofMinutes(30),
        )
        assertEquals(expected, requests.single())
    }

    @Test
    fun monthBucketsKeepTheirDay() {
        val buckets = Aggregation.periodBuckets(LocalDateTime.of(2026, 1, 31, 0, 0), LocalDateTime.of(2026, 4, 15, 0, 0), Period.ofMonths(1))
        assertEquals(listOf(LocalDateTime.of(2026, 1, 31, 0, 0), LocalDateTime.of(2026, 2, 28, 0, 0), LocalDateTime.of(2026, 3, 31, 0, 0)), buckets.map { it.first })
        assertEquals(LocalDateTime.of(2026, 4, 15, 0, 0), buckets.last().second)
    }

    @Test
    fun rejectsWhatThePlatformCantAggregate() = runTest {
        val notAggregatable = assertThrows(HealthException::class.java) {
            kotlinx.coroutines.runBlocking { call("""{"type":"menstrualFlow","startDate":"2026-10-01T00:00:00.000Z","endDate":"2026-10-02T00:00:00.000Z","metrics":["sum"]}""") }
        }
        assertEquals("notAggregatable", notAggregatable.data.getString("reason"))
        val metric = assertThrows(HealthException::class.java) {
            kotlinx.coroutines.runBlocking { call("""{"type":"steps","startDate":"2026-10-01T00:00:00.000Z","endDate":"2026-10-02T00:00:00.000Z","metrics":["avg"]}""") }
        }
        assertEquals("metricUnsupported", metric.data.getString("reason"))
    }

    @Test
    fun durationValuesAreSeconds() {
        assertEquals(90.5, Aggregation.bridgeValue("duration", Duration.ofMillis(90_500), "min"), 0.0)
        assertEquals(1200.0, Aggregation.bridgeValue("sum", 1200L, "count"), 0.0)
    }
}
