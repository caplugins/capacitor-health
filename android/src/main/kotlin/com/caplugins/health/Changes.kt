package com.caplugins.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import com.caplugins.health.generated.RegistryEntry
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject

/**
 * `getChanges` (R8, decision #17). One Changes API token per type in a composite cursor,
 * `{ v: 1, tokens: { typeId: token } }` as base64 JSON: a `DeletionChange` doesn't name its type, and a
 * revoked permission for one type must not break the others (03-architecture).
 */
class Changes(
    private val client: HealthConnectClient,
    private val types: HealthTypes,
    private val samples: Samples,
    private val ownPackage: String,
    private val encodeBase64: (ByteArray) -> String,
    private val decodeBase64: (String) -> ByteArray,
) {
    suspend fun changes(options: Fields): JSObject {
        val ids = options.optStrings("types")?.takeIf { it.isNotEmpty() }
            ?: throw HealthException.invalidArgument("types", "must be a non-empty array of types")
        val entries = ids.map(types::resolve)
        val cursor = options.optString("cursor")
        if (cursor == null) {
            val tokens = entries.associate { it.id to client.getChangesToken(ChangesTokenRequest(setOf(it.record))) }
            return result(emptyList(), JSArray(), tokens, hasMore = false)
        }

        val tokens = decodeCursor(cursor, ids)
        val excludeOwn = options.optBoolean("excludeOwnWrites") ?: false
        val upserted = mutableListOf<Pair<Record, RegistryEntry>>()
        val deleted = JSArray()
        val next = mutableMapOf<String, String>()
        var hasMore = false
        for (entry in entries) {
            val response = client.getChanges(tokens.getValue(entry.id))
            if (response.changesTokenExpired) {
                throw HealthException(
                    HealthException.CURSOR_EXPIRED,
                    "The getChanges cursor expired; read everything again and start over without a cursor.",
                    JSObject().put("type", entry.id),
                )
            }
            for (change in response.changes) {
                when (change) {
                    is UpsertionChange ->
                        if (!excludeOwn || change.record.metadata.dataOrigin.packageName != ownPackage) upserted += change.record to entry
                    // Deletions carry only the record id (T08 A6).
                    is DeletionChange -> deleted.put(JSObject().put("type", entry.id).put("id", change.recordId))
                }
            }
            next[entry.id] = response.nextChangesToken
            hasMore = hasMore || response.hasMore
        }
        HealthLog.debug("getChanges: ${upserted.size} upserted, ${deleted.length()} deleted")
        return result(upserted, deleted, next, hasMore)
    }

    private suspend fun result(upserted: List<Pair<Record, RegistryEntry>>, deleted: JSArray, tokens: Map<String, String>, hasMore: Boolean): JSObject {
        val cycleStarts = samples.cycleStarts(upserted.map { it.first }.filterIsInstance<MenstruationFlowRecord>())
        return JSObject()
            .put("upserted", JSArray(upserted.map { (record, entry) -> RecordCodec.encode(record, entry, isCycleStart = cycleStarts[record.metadata.id]) }))
            .put("deleted", deleted)
            .put("nextCursor", encodeBase64(JSONObject().put("v", 1).put("tokens", JSONObject(tokens as Map<*, *>)).toString().toByteArray()))
            .put("hasMore", hasMore)
    }

    private fun decodeCursor(cursor: String, ids: List<String>): Map<String, String> {
        val json = runCatching { JSONObject(String(decodeBase64(cursor))) }.getOrNull()
        val tokens = json?.optJSONObject("tokens")
        if (json == null || json.optInt("v") != 1 || tokens == null) throw HealthException.invalidArgument("cursor", "isn't a getChanges cursor")
        val map = tokens.keys().asSequence().associateWith { tokens.getString(it) }
        if (map.keys != ids.toSet()) throw HealthException.invalidArgument("cursor", "was created for other types", "cursorMismatch")
        return map
    }
}
