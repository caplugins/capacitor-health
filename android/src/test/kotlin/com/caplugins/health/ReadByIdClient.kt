package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordResponse
import androidx.health.connect.client.testing.FakeHealthConnectClient
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import kotlin.reflect.KClass

/**
 * FakeHealthConnectClient's `readRecord` finds no record by id (connect-testing 1.0.0-alpha03); this reads it by
 * listing. [replace] stands in for what Health Connect returns instead of the stored record (a route that needs
 * consent).
 */
class ReadByIdClient(private val fake: FakeHealthConnectClient) : HealthConnectClient by fake {
    var replace: ((Record) -> Record)? = null

    override suspend fun <T : Record> readRecord(recordType: KClass<T>, recordId: String): ReadRecordResponse<T> {
        val record = fake.readRecords(ReadRecordsRequest(recordType, TimeRangeFilter.after(Instant.EPOCH))).records.firstOrNull { it.metadata.id == recordId }
            ?: throw IllegalArgumentException("No record $recordId")
        @Suppress("UNCHECKED_CAST")
        return ReadRecordResponse((replace?.invoke(record) ?: record) as T)
    }
}
