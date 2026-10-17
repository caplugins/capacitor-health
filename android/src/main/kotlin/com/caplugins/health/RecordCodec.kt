package com.caplugins.health

import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SexualActivityRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Temperature
import androidx.health.connect.client.units.TemperatureDelta
import com.caplugins.health.generated.Registry
import com.caplugins.health.generated.RegistryEntry
import com.caplugins.health.generated.RegistryField
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/** Health Connect record ⇄ bridge JSON for every M1 record. Value and field maps come from the registry. */
object RecordCodec {
    /** The records one new sample turns into; [primary]'s id is what `saveSamples` returns for it. */
    class Decoded(val primary: Record, val extras: List<Record> = emptyList())

    private val DEVICE_TYPES = listOf(
        "unknown" to Device.TYPE_UNKNOWN,
        "watch" to Device.TYPE_WATCH,
        "phone" to Device.TYPE_PHONE,
        "scale" to Device.TYPE_SCALE,
        "ring" to Device.TYPE_RING,
        "headMounted" to Device.TYPE_HEAD_MOUNTED,
        "fitnessBand" to Device.TYPE_FITNESS_BAND,
        "chestStrap" to Device.TYPE_CHEST_STRAP,
        "smartDisplay" to Device.TYPE_SMART_DISPLAY,
    )

    private val RECORDING_METHODS = mapOf(
        Metadata.RECORDING_METHOD_MANUAL_ENTRY to "manual",
        Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED to "automatic",
        Metadata.RECORDING_METHOD_ACTIVELY_RECORDED to "active",
    )

    // region Values

    fun unifiedValue(raw: Int, valueSet: String?): String? {
        val set = valueSet?.let { Registry.valueSets[it] } ?: return raw.toString()
        if (raw == set.absent) return null
        // A constant newer than the registry reads as its number; `native.value` carries it too.
        return set.constants.entries.firstOrNull { it.value == raw }?.key ?: raw.toString()
    }

    fun constant(value: String, valueSet: String, field: String): Int =
        Registry.valueSets[valueSet]?.constants?.get(value)
            ?: throw HealthException.invalidArgument(field, "can't be stored on Android", "valueUnsupportedOnPlatform")

    private fun temperature(value: Double, unit: String): Temperature =
        if (unit == "degF") Temperature.fahrenheit(value) else Temperature.celsius(value)

    private fun inUnit(temperature: Temperature, unit: String): Double =
        if (unit == "degF") temperature.inFahrenheit else temperature.inCelsius

    private fun delta(value: Double, unit: String): TemperatureDelta =
        if (unit == "degF") TemperatureDelta.fahrenheit(value) else TemperatureDelta.celsius(value)

    private fun inUnit(delta: TemperatureDelta, unit: String): Double = if (unit == "degF") delta.inFahrenheit else delta.inCelsius

    // endregion

    // region Read

    /** `Sample` JSON for [record]. [isCycleStart] is decision #16's computed flag for flow records. */
    fun encode(record: Record, entry: RegistryEntry, unit: String? = null, isCycleStart: Boolean? = null): JSObject {
        val json = encodeBase(record, entry)
        val native = JSObject().put("type", record::class.simpleName)
        val outUnit = unit ?: entry.unit
        when (record) {
            is MenstruationFlowRecord -> {
                json.put("value", unifiedValue(record.flow, entry.valueSet))
                native.put("value", record.flow)
                isCycleStart?.let { json.put("isCycleStart", it) }
            }
            is CervicalMucusRecord -> {
                json.put("value", unifiedValue(record.appearance, entry.valueSet))
                native.put("value", record.appearance)
                putEnumField(json, entry.field("sensation"), record.sensation)
            }
            is OvulationTestRecord -> {
                json.put("value", unifiedValue(record.result, entry.valueSet))
                native.put("value", record.result)
            }
            is SexualActivityRecord -> {
                val field = entry.field("protectionUsed")
                when (record.protectionUsed) {
                    field?.whenTrue -> json.put("protectionUsed", true)
                    field?.whenFalse -> json.put("protectionUsed", false)
                }
            }
            is BasalBodyTemperatureRecord -> {
                json.put("value", inUnit(record.temperature, outUnit ?: "degC")).put("unit", outUnit)
                putEnumField(json, entry.field("measurementLocation"), record.measurementLocation)
            }
            is SkinTemperatureRecord -> {
                val u = outUnit ?: "degC"
                json.put("unit", u)
                record.baseline?.let { json.put("baseline", inUnit(it, u)) }
                json.put(
                    "deltas",
                    JSArray(record.deltas.map { JSObject().put("time", DateCoding.format(it.time, record.startZoneOffset)).put("delta", inUnit(it.delta, u)) }),
                )
                putEnumField(json, entry.field("measurementLocation"), record.measurementLocation)
            }
            is MenstruationPeriodRecord -> {
                json.put("firstDay", PeriodDays.firstDay(record).toString())
                json.put("lastDay", PeriodDays.lastDay(record).toString())
                json.put("derived", false)
            }
        }
        return json.put("native", native)
    }

    class Times(val start: java.time.Instant, val startOffset: ZoneOffset?, val end: java.time.Instant, val endOffset: ZoneOffset?)

    /** Start and end of any M1 record (connect-client keeps its instant / interval interfaces internal). */
    fun times(record: Record): Times =
        when (record) {
            is MenstruationFlowRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is IntermenstrualBleedingRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is CervicalMucusRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is OvulationTestRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is SexualActivityRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is BasalBodyTemperatureRecord -> Times(record.time, record.zoneOffset, record.time, record.zoneOffset)
            is SkinTemperatureRecord -> Times(record.startTime, record.startZoneOffset, record.endTime, record.endZoneOffset)
            is MenstruationPeriodRecord -> Times(record.startTime, record.startZoneOffset, record.endTime, record.endZoneOffset)
            else -> throw HealthException(HealthException.NATIVE_ERROR, "${record::class.simpleName} has no codec.")
        }

    private fun RegistryEntry.field(name: String): RegistryField? = fields.firstOrNull { it.name == name }

    private fun putEnumField(json: JSObject, field: RegistryField?, raw: Int) {
        if (field == null) return
        unifiedValue(raw, field.valueSet)?.let { json.put(field.name, it) }
    }

    private fun encodeBase(record: Record, entry: RegistryEntry): JSObject {
        val metadata = record.metadata
        val json = JSObject()
            .put("id", metadata.id)
            .put("type", entry.id)
            .put("kind", entry.kind.name.lowercase())
            .put("platform", "android")
            .put("source", JSObject().put("id", metadata.dataOrigin.packageName))
            .put("recordingMethod", RECORDING_METHODS[metadata.recordingMethod] ?: "unknown")
        val time = times(record)
        json.put("startDate", DateCoding.format(time.start, time.startOffset))
        json.put("endDate", DateCoding.format(time.end, time.endOffset))
        time.startOffset?.let { json.put("zoneOffset", DateCoding.offsetString(it)) }
        metadata.clientRecordId?.let { json.put("clientId", it).put("clientVersion", metadata.clientRecordVersion) }
        metadata.device?.let { device ->
            val out = JSObject()
            device.manufacturer?.let { out.put("manufacturer", it) }
            device.model?.let { out.put("model", it) }
            out.put("type", DEVICE_TYPES.firstOrNull { it.second == device.type }?.first ?: "unknown")
            json.put("device", out)
        }
        json.put("metadata", JSObject().put("hc.lastModifiedTime", DateCoding.format(metadata.lastModifiedTime, ZoneOffset.UTC)))
        return json
    }

    // endregion

    // region Write

    fun metadata(fields: Fields, clientId: String? = fields.optString("clientId")): Metadata {
        val version = fields.optLong("clientVersion") ?: 1L
        val device = fields.optObject("device")?.let { json ->
            val type = DEVICE_TYPES.firstOrNull { it.first == json.optString("type") }?.second ?: Device.TYPE_UNKNOWN
            Device(type = type, manufacturer = json.optString("manufacturer").ifEmpty { null }, model = json.optString("model").ifEmpty { null })
        }
        // Health Connect needs a device for automatic and active recordings.
        val required = device ?: Device(type = Device.TYPE_UNKNOWN)
        return when (fields.optString("recordingMethod")) {
            "manual" -> if (clientId != null) Metadata.manualEntry(clientId, version, device) else Metadata.manualEntry(device)
            "automatic" -> if (clientId != null) Metadata.autoRecorded(required, clientId, version) else Metadata.autoRecorded(required)
            "active" -> if (clientId != null) Metadata.activelyRecorded(required, clientId, version) else Metadata.activelyRecorded(required)
            else -> if (clientId != null) Metadata.unknownRecordingMethod(clientId, version, device) else Metadata.unknownRecordingMethod(device)
        }
    }

    private fun instant(fields: Fields): OffsetDateTime {
        val start = fields.date("startDate")
        if (fields.has("endDate") && fields.date("endDate").toInstant() != start.toInstant()) {
            throw HealthException.invalidArgument(fields.field("endDate"), "must equal startDate on Android", "instantOnly")
        }
        return start
    }

    private fun enumField(fields: Fields, entry: RegistryEntry, name: String): Int {
        val field = entry.field(name) ?: return 0
        val set = field.valueSet ?: return 0
        val value = fields.optString(name) ?: return Registry.valueSets[set]?.absent ?: 0
        return constant(value, set, fields.field(name))
    }

    fun decode(fields: Fields, entry: RegistryEntry): Decoded {
        val metadata = metadata(fields)
        val record: Record = when (entry.record) {
            MenstruationFlowRecord::class -> {
                val time = instant(fields)
                MenstruationFlowRecord(time.toInstant(), time.offset, metadata, constant(fields.string("value"), entry.valueSet!!, fields.field("value")))
            }
            IntermenstrualBleedingRecord::class -> {
                val time = instant(fields)
                IntermenstrualBleedingRecord(time.toInstant(), time.offset, metadata)
            }
            CervicalMucusRecord::class -> {
                val time = instant(fields)
                CervicalMucusRecord(
                    time = time.toInstant(),
                    zoneOffset = time.offset,
                    metadata = metadata,
                    appearance = constant(fields.string("value"), entry.valueSet!!, fields.field("value")),
                    sensation = enumField(fields, entry, "sensation"),
                )
            }
            OvulationTestRecord::class -> {
                val time = instant(fields)
                OvulationTestRecord(
                    time = time.toInstant(),
                    zoneOffset = time.offset,
                    result = constant(fields.string("value"), entry.valueSet!!, fields.field("value")),
                    metadata = metadata,
                )
            }
            SexualActivityRecord::class -> {
                val time = instant(fields)
                val field = entry.field("protectionUsed")
                val protection = when (fields.optBoolean("protectionUsed")) {
                    true -> field?.whenTrue
                    false -> field?.whenFalse
                    null -> field?.absent
                } ?: SexualActivityRecord.PROTECTION_USED_UNKNOWN
                SexualActivityRecord(time.toInstant(), time.offset, metadata, protection)
            }
            BasalBodyTemperatureRecord::class -> {
                val time = instant(fields)
                BasalBodyTemperatureRecord(
                    time = time.toInstant(),
                    zoneOffset = time.offset,
                    metadata = metadata,
                    temperature = temperature(fields.double("value"), unit(fields, entry)),
                    measurementLocation = enumField(fields, entry, "measurementLocation"),
                )
            }
            SkinTemperatureRecord::class -> decodeSkinTemperature(fields, entry, metadata)
            MenstruationPeriodRecord::class -> return decodePeriod(fields, metadata)
            else -> throw HealthException(HealthException.NATIVE_ERROR, "${entry.id} has no codec.")
        }
        return Decoded(record)
    }

    private fun unit(fields: Fields, entry: RegistryEntry): String {
        val unit = fields.optString("unit") ?: entry.unit ?: "degC"
        if (unit !in entry.units) throw HealthException.invalidArgument(fields.field("unit"), "isn't a unit of ${entry.id}")
        return unit
    }

    private fun decodeSkinTemperature(fields: Fields, entry: RegistryEntry, metadata: Metadata): SkinTemperatureRecord {
        val start = fields.date("startDate")
        val end = fields.date("endDate")
        val unit = unit(fields, entry)
        val array = fields.optArray("deltas") ?: throw HealthException.invalidArgument(fields.field("deltas"), "must be an array")
        val deltas = (0 until array.length()).map { i ->
            val delta = Fields(array.getJSONObject(i), fields.field("deltas[$i]"))
            SkinTemperatureRecord.Delta(delta.date("time").toInstant(), delta(delta.double("delta"), unit))
        }.sortedBy { it.time }
        return SkinTemperatureRecord(
            startTime = start.toInstant(),
            startZoneOffset = start.offset,
            endTime = end.toInstant(),
            endZoneOffset = end.offset,
            metadata = metadata,
            deltas = deltas,
            baseline = fields.optDouble("baseline")?.let { temperature(it, unit) },
            measurementLocation = enumField(fields, entry, "measurementLocation"),
        )
    }

    /**
     * Decision #30: the period covers the local dates of `startDate` and `endDate` (as written), from local
     * midnight of the first day to 23:59:59.999 of the last, in `timeZone` if given, else the start's offset.
     * Days listed in `flow` also become flow records at local noon (`<clientId>:<yyyy-mm-dd>`).
     */
    private fun decodePeriod(fields: Fields, metadata: Metadata): Decoded {
        val start = fields.date("startDate")
        val end = fields.date("endDate")
        val zone: ZoneId = fields.optString("timeZone")?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: start.offset
        val firstDay = start.toLocalDate()
        val lastDay = end.toLocalDate()
        if (lastDay.isBefore(firstDay)) throw HealthException.invalidArgument(fields.field("endDate"), "must not be on a day before startDate")
        val startTime = firstDay.atStartOfDay(zone)
        val endTime = lastDay.atTime(LocalTime.MAX.truncatedTo(ChronoUnit.MILLIS)).atZone(zone)
        if (ChronoUnit.DAYS.between(firstDay, lastDay) + 1 > MAX_PERIOD_DAYS) {
            throw HealthException.invalidArgument(fields.field("endDate"), "must be at most $MAX_PERIOD_DAYS days after startDate", "periodTooLong")
        }
        val period = MenstruationPeriodRecord(startTime.toInstant(), startTime.offset, endTime.toInstant(), endTime.offset, metadata)

        val clientId = fields.optString("clientId")
        val flowJson = fields.optObject("flow")
        val flows = flowJson?.keys()?.asSequence()?.sorted()?.map { key ->
            val day = LocalDate.parse(key)
            if (day.isBefore(firstDay) || day.isAfter(lastDay)) {
                throw HealthException.invalidArgument(fields.field("flow.$key"), "must be a day inside the period", "dayOutsidePeriod")
            }
            val noon = day.atTime(LocalTime.NOON).atZone(zone)
            MenstruationFlowRecord(
                noon.toInstant(),
                noon.offset,
                metadata(fields, clientId?.let { "$it:$key" }),
                constant(flowJson.getString(key), "bleeding", fields.field("flow.$key")),
            )
        }?.toList() ?: emptyList()
        return Decoded(period, flows)
    }

    /** Health Connect's `MenstruationPeriodRecord.MAX_DURATION`, in local days (decision #30). */
    const val MAX_PERIOD_DAYS = 31
}
