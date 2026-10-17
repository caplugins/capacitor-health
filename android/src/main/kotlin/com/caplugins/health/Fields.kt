package com.caplugins.health

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/**
 * Typed access to bridge arguments. The TypeScript layer validates first (decision #23); these only guard
 * against malformed input and name the field when it is.
 */
class Fields(val json: JSONObject, private val path: String = "") {
    fun field(key: String) = if (path.isEmpty()) key else "$path.$key"

    fun has(key: String) = json.has(key) && !json.isNull(key)

    fun optString(key: String): String? = if (has(key)) json.optString(key).takeIf { it.isNotEmpty() } else null

    fun string(key: String): String = optString(key) ?: throw HealthException.invalidArgument(field(key), "must be a non-empty string")

    fun optDouble(key: String): Double? = if (has(key)) json.optDouble(key).takeIf { it.isFinite() } else null

    fun double(key: String): Double = optDouble(key) ?: throw HealthException.invalidArgument(field(key), "must be a finite number")

    fun optLong(key: String): Long? = if (has(key)) json.optLong(key) else null

    fun optInt(key: String): Int? = if (has(key)) json.optInt(key) else null

    fun optBoolean(key: String): Boolean? = if (has(key)) json.optBoolean(key) else null

    fun optObject(key: String): JSONObject? = if (has(key)) json.optJSONObject(key) else null

    fun optArray(key: String): JSONArray? = if (has(key)) json.optJSONArray(key) else null

    fun optStrings(key: String): List<String>? = optArray(key)?.let { array -> (0 until array.length()).map { array.getString(it) } }

    fun date(key: String): OffsetDateTime = DateCoding.parse(optString(key), field(key))
}

/** Dates cross the bridge as `yyyy-MM-dd'T'HH:mm:ss.SSS±HH:MM` both ways (decision #38). */
object DateCoding {
    private val FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSxxx", Locale.US)

    fun parse(value: String?, field: String): OffsetDateTime {
        if (value == null) throw HealthException.invalidArgument(field, "must be an ISO 8601 date-time with an offset")
        return try {
            OffsetDateTime.parse(value)
        } catch (_: DateTimeParseException) {
            throw HealthException.invalidArgument(field, "must be an ISO 8601 date-time with an offset")
        }
    }

    fun format(instant: Instant, offset: ZoneOffset?): String = instant.atOffset(offset ?: ZoneOffset.UTC).format(FORMAT)

    /** `+05:30`, and `+00:00` rather than `Z`. */
    fun offsetString(offset: ZoneOffset): String = DateTimeFormatter.ofPattern("xxx", Locale.US).format(Instant.EPOCH.atOffset(offset))
}
