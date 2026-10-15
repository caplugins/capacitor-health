package com.caplugins.health

import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Guards the connect-testing / connect-client pairing in build.gradle: connect-testing pins its own
 * connect-client version, so this fails to compile or run if the two drift apart.
 */
class HealthConnectTestingSmokeTest {

    @Test
    fun fakeClientRoundTripsAFlowRecord() = runTest {
        val client = FakeHealthConnectClient()
        val time = Instant.parse("2026-10-01T08:00:00Z")
        client.insertRecords(
            listOf(
                MenstruationFlowRecord(
                    time = time,
                    zoneOffset = ZoneOffset.UTC,
                    metadata = Metadata.manualEntry(),
                    flow = MenstruationFlowRecord.FLOW_MEDIUM,
                ),
            ),
        )

        val response = client.readRecords(
            ReadRecordsRequest(MenstruationFlowRecord::class, TimeRangeFilter.after(time.minusSeconds(1))),
        )

        assertEquals(1, response.records.size)
        assertEquals(MenstruationFlowRecord.FLOW_MEDIUM, response.records.single().flow)
    }
}
