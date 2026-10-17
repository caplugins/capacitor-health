// Argument validation for every bridge call (decision #23). Runs in JS before native code sees the
// arguments, driven by the generated registry, and returns normalized options: defaults filled in
// and dates rewritten to one canonical format, so native code parses a single shape.
//
// Error messages name fields and allowed values but never echo what the caller passed: that could
// be a health value.
import { CapacitorException } from '@capacitor/core';
import type { ExceptionCode } from '@capacitor/core';

import type {
  AggregateBucketUnit,
  AggregateMetric,
  AggregateOptions,
  AuthorizationOptions,
  CheckAuthorizationOptions,
  DeleteSamplesOptions,
  GetChangesOptions,
  HealthErrorCode,
  HealthErrorData,
  NewSample,
  ReadSamplesOptions,
  RecordingMethod,
  SampleDevice,
  SaveSamplesOptions,
} from './definitions';
import { REGISTRY, VALUE_SETS } from './generated/registry';
import type { HealthType, RegistryEntry } from './generated/registry';

export type NativePlatform = 'ios' | 'android';

export const DEFAULT_LIMIT = 1000;
/** The most buckets one `aggregate()` call may ask for. */
export const MAX_BUCKETS = 5000;
export const MAX_LIMIT = 10000;
/** Health Connect's `MenstruationPeriodRecord.MAX_DURATION` in whole days (decision #30). */
export const MAX_PERIOD_DAYS_ANDROID = 31;

const PLATFORM_NAMES: Record<NativePlatform, string> = { ios: 'iOS', android: 'Android' };
const RECORDING_METHODS: readonly RecordingMethod[] = ['manual', 'automatic', 'active', 'unknown'];
const DEVICE_TYPES: readonly string[] = [
  'unknown',
  'watch',
  'phone',
  'scale',
  'ring',
  'headMounted',
  'fitnessBand',
  'chestStrap',
  'smartDisplay',
];
const DEVICE_STRINGS = ['name', 'manufacturer', 'model', 'hardwareVersion', 'softwareVersion'] as const;
/** Typed sample fields (decision #20): every field the registry declares on some type. */
const TYPED_FIELDS: readonly string[] = [
  ...new Set(Object.values(REGISTRY).flatMap((entry: RegistryEntry) => Object.keys(entry.fields ?? {}))),
];

export function healthError(code: HealthErrorCode, message: string, data?: HealthErrorData): CapacitorException {
  // Capacitor types `code` as its own two-value enum; the bridge and apps treat it as a string.
  return new CapacitorException(message, code as unknown as ExceptionCode, data);
}

function invalid(field: string, message: string, reason?: string, extra?: HealthErrorData): CapacitorException {
  return healthError('INVALID_ARGUMENT', `${field} ${message}.`, { field, ...(reason ? { reason } : {}), ...extra });
}

// ------------------------------------------------------------------ primitives

type Fields = Record<string, unknown>;

function isPlainObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown, field: string): Fields {
  if (!isPlainObject(value)) throw invalid(field, 'must be an object');
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(field, 'must be a non-empty string');
  return value;
}

function optionalBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw invalid(field, 'must be a boolean');
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(field, 'must be a finite number');
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw invalid(field, 'must be a non-empty array');
  return value.map((item, i) => nonEmptyString(item, `${field}[${i}]`));
}

function limit(value: unknown, field: string): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw invalid(field, `must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return value;
}

// ------------------------------------------------------------------ dates

export interface ParsedDate {
  /** Canonical form: `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM` (UTC as `+00:00`), millisecond precision. */
  iso: string;
  ms: number;
  /** The calendar date as written, in the string's own offset. */
  day: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses an ISO 8601 date-time that carries an offset (`Z` or `±HH:MM`). */
export function parseDate(value: unknown, field: string): ParsedDate {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  const fail = () => invalid(field, 'must be an ISO 8601 date-time with an offset, e.g. 2026-10-15T08:00:00+05:30');
  if (!match) throw fail();
  const [, y, mo, d, h, mi, s = '00', fraction = '', zone, sign, oh, om] = match;
  const valid =
    +mo >= 1 &&
    +mo <= 12 &&
    +d >= 1 &&
    +d <= daysInMonth(+y, +mo) &&
    +h <= 23 &&
    +mi <= 59 &&
    +s <= 59 &&
    (zone === 'Z' || (+oh <= 18 && +om <= 59));
  if (!valid) throw fail();
  const offset = zone === 'Z' ? '+00:00' : `${sign}${oh}:${om}`;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${(fraction + '000').slice(0, 3)}${offset}`;
  return { iso, ms: Date.parse(iso), day: `${y}-${mo}-${d}` };
}

function dateRange(startValue: unknown, endValue: unknown, at: string): [ParsedDate, ParsedDate] {
  const start = parseDate(startValue, `${at}startDate`);
  const end = parseDate(endValue, `${at}endDate`);
  if (end.ms < start.ms) throw invalid(`${at}endDate`, 'must not be before startDate', 'endBeforeStart');
  return [start, end];
}

/** Whole days from `from` to `to` (`YYYY-MM-DD`), e.g. 0 for the same day. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ types and values

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** The registry entry for a type the caller names; rejects unknown ids. */
function knownType(value: unknown, field: string): RegistryEntry {
  if (typeof value !== 'string' || !hasOwn(REGISTRY, value)) {
    throw healthError('UNSUPPORTED_TYPE', `${field} is not a type this plugin knows.`, {
      field,
      reason: 'unknownType',
    });
  }
  return REGISTRY[value as HealthType];
}

/** Like `knownType`, and the type must exist on `platform`. OS and feature checks happen natively. */
function platformType(value: unknown, field: string, platform: NativePlatform): RegistryEntry {
  const entry = knownType(value, field);
  if (!entry[platform]) {
    throw healthError('UNSUPPORTED_TYPE', `${entry.id} isn't available on ${PLATFORM_NAMES[platform]}.`, {
      field,
      type: entry.id,
      reason: 'notOnPlatform',
    });
  }
  return entry;
}

/** Like `platformType`, and the type must have samples there: aggregate-only types have only aggregates. */
function sampleType(value: unknown, field: string, platform: NativePlatform): RegistryEntry {
  const entry = platformType(value, field, platform);
  if (entry[platform]?.aggregateOnly) {
    throw healthError(
      'UNSUPPORTED_TYPE',
      `${entry.id} has no samples on ${PLATFORM_NAMES[platform]}, only aggregates.`,
      {
        field,
        type: entry.id,
        reason: 'aggregateOnly',
      },
    );
  }
  return entry;
}

function writableType(value: unknown, field: string, platform: NativePlatform): RegistryEntry {
  const entry = platformType(value, field, platform);
  if (!entry[platform]?.writable) {
    throw healthError('READ_ONLY_TYPE', `${entry.id} can't be written on ${PLATFORM_NAMES[platform]}.`, {
      field,
      type: entry.id,
    });
  }
  return entry;
}

/** A value from `setName` that `platform` can store. */
function enumValue(value: unknown, field: string, setName: string, platform: NativePlatform): string {
  const set = VALUE_SETS[setName];
  if (typeof value !== 'string' || !set.values.includes(value)) {
    throw invalid(field, `must be one of ${set.values.join(', ')}`, 'unknownValue');
  }
  if (!set[platform]?.includes(value)) {
    throw invalid(
      field,
      `can't be stored on ${PLATFORM_NAMES[platform]}; supported: ${(set[platform] ?? []).join(', ')}`,
      'valueUnsupportedOnPlatform',
    );
  }
  return value;
}

function unit(value: unknown, field: string, entry: RegistryEntry): string | undefined {
  if (!entry.units) {
    if (value !== undefined) throw invalid(field, `doesn't apply to ${entry.id}`, 'notApplicable');
    return undefined;
  }
  if (value === undefined) return entry.unit;
  if (typeof value !== 'string' || !entry.units.includes(value)) {
    throw invalid(field, `must be one of ${entry.units.join(', ')}`, 'unknownUnit');
  }
  return value;
}

// ------------------------------------------------------------------ authorization

function typeList(value: unknown, field: string, platform: NativePlatform, write: boolean): HealthType[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid(field, 'must be an array of types');
  const ids: HealthType[] = [];
  value.forEach((item, i) => {
    const entry = knownType(item, `${field}[${i}]`);
    // Types missing on this platform are reported `unsupported` by native code, not rejected, so
    // cross-platform apps can pass one list (decision #37). Read-only ones are a programming error.
    if (write && entry[platform] && !entry[platform]?.writable) writableType(item, `${field}[${i}]`, platform);
    if (!ids.includes(entry.id)) ids.push(entry.id);
  });
  return ids;
}

export function validateCheckAuthorization(
  options: CheckAuthorizationOptions,
  platform: NativePlatform,
): CheckAuthorizationOptions {
  const o = object(options, 'options');
  const read = typeList(o.read, 'read', platform, false);
  const write = typeList(o.write, 'write', platform, true);
  if (read.length + write.length === 0) throw invalid('read', 'or write must list at least one type', 'noTypes');
  return { read, write };
}

export function validateRequestAuthorization(
  options: AuthorizationOptions,
  platform: NativePlatform,
): AuthorizationOptions {
  const o = object(options, 'options');
  const result: AuthorizationOptions = validateCheckAuthorization(o, platform);
  if (o.android !== undefined) {
    const android = object(o.android, 'android');
    result.android = {
      history: optionalBoolean(android.history, 'android.history', false),
      background: optionalBoolean(android.background, 'android.background', false),
    };
  }
  return result;
}

// ------------------------------------------------------------------ reading

export function validateReadSamples(options: ReadSamplesOptions, platform: NativePlatform): ReadSamplesOptions {
  const o = object(options, 'options');
  const entry = sampleType(o.type, 'type', platform);
  const [start, end] = dateRange(o.startDate, o.endDate, '');
  const result: ReadSamplesOptions = {
    type: entry.id,
    startDate: start.iso,
    endDate: end.iso,
    limit: limit(o.limit, 'limit'),
    ascending: optionalBoolean(o.ascending, 'ascending', true),
  };
  if (o.cursor !== undefined) result.cursor = nonEmptyString(o.cursor, 'cursor');
  const u = unit(o.unit, 'unit', entry);
  if (u) result.unit = u;
  if (o.sourceIds !== undefined) result.sourceIds = stringList(o.sourceIds, 'sourceIds');
  return result;
}

export function validateGetChanges(options: GetChangesOptions, platform: NativePlatform): GetChangesOptions {
  const o = object(options, 'options');
  if (!Array.isArray(o.types) || o.types.length === 0) throw invalid('types', 'must be a non-empty array of types');
  const types: HealthType[] = [];
  o.types.forEach((item, i) => {
    const entry = sampleType(item, `types[${i}]`, platform);
    if (!types.includes(entry.id)) types.push(entry.id);
  });
  const result: GetChangesOptions = {
    types,
    limit: limit(o.limit, 'limit'),
    excludeOwnWrites: optionalBoolean(o.excludeOwnWrites, 'excludeOwnWrites', false),
  };
  if (o.cursor !== undefined) result.cursor = nonEmptyString(o.cursor, 'cursor');
  return result;
}

// ------------------------------------------------------------------ aggregating

const BUCKET_UNITS: readonly AggregateBucketUnit[] = ['minute', 'hour', 'day', 'week', 'month'];
const BUCKET_MS: Partial<Record<AggregateBucketUnit, number>> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
};

/** How many buckets of `size` × `unit` fit from `start` to `end`, rounded up (months by calendar month). */
function bucketCount(start: ParsedDate, end: ParsedDate, unit: AggregateBucketUnit, size: number): number {
  const ms = BUCKET_MS[unit];
  if (ms !== undefined) return Math.ceil((end.ms - start.ms) / (ms * size));
  const [y1, m1] = start.day.split('-').map(Number);
  const [y2, m2] = end.day.split('-').map(Number);
  return Math.ceil(((y2 - y1) * 12 + (m2 - m1) + 1) / size);
}

export function validateAggregate(options: AggregateOptions, platform: NativePlatform): AggregateOptions {
  const o = object(options, 'options');
  const entry = platformType(o.type, 'type', platform);
  const available = entry[platform]?.metrics ?? [];
  if (available.length === 0) {
    throw healthError('UNSUPPORTED_TYPE', `${entry.id} can't be aggregated on ${PLATFORM_NAMES[platform]}.`, {
      field: 'type',
      type: entry.id,
      reason: 'notAggregatable',
    });
  }
  const [start, end] = dateRange(o.startDate, o.endDate, '');
  if (end.ms === start.ms) throw invalid('endDate', 'must be after startDate', 'emptyRange');
  if (!Array.isArray(o.metrics) || o.metrics.length === 0) throw invalid('metrics', 'must be a non-empty array');
  const metrics: AggregateMetric[] = [];
  o.metrics.forEach((metric, i) => {
    if (typeof metric !== 'string' || !available.includes(metric as AggregateMetric)) {
      throw invalid(
        `metrics[${i}]`,
        `must be one of ${available.join(', ')} for ${entry.id} on ${PLATFORM_NAMES[platform]}`,
        'metricUnsupported',
      );
    }
    if (!metrics.includes(metric as AggregateMetric)) metrics.push(metric as AggregateMetric);
  });
  const result: AggregateOptions = { type: entry.id, startDate: start.iso, endDate: end.iso, metrics };
  if (o.bucket !== undefined) {
    const bucket = object(o.bucket, 'bucket');
    if (typeof bucket.unit !== 'string' || !BUCKET_UNITS.includes(bucket.unit as AggregateBucketUnit)) {
      throw invalid('bucket.unit', `must be one of ${BUCKET_UNITS.join(', ')}`, 'unknownValue');
    }
    const unit = bucket.unit as AggregateBucketUnit;
    const size = bucket.size ?? 1;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
      throw invalid('bucket.size', 'must be a positive integer');
    }
    if (bucketCount(start, end, unit, size) > MAX_BUCKETS) {
      throw invalid('bucket', `would make more than ${MAX_BUCKETS} buckets`, 'tooManyBuckets');
    }
    result.bucket = { unit, size };
  }
  if (o.timeZone !== undefined) {
    const zone = nonEmptyString(o.timeZone, 'timeZone');
    if (!isValidTimeZone(zone)) throw invalid('timeZone', 'must be an IANA time zone, e.g. Europe/Berlin');
    result.timeZone = zone;
  }
  const u = unit(o.unit, 'unit', entry);
  if (u) result.unit = u;
  if (o.sourceIds !== undefined) result.sourceIds = stringList(o.sourceIds, 'sourceIds');
  return result;
}

// ------------------------------------------------------------------ writing

function device(value: unknown, field: string): SampleDevice {
  const d = object(value, field);
  const result: SampleDevice = {};
  for (const key of DEVICE_STRINGS) {
    if (d[key] !== undefined) result[key] = nonEmptyString(d[key], `${field}.${key}`);
  }
  if (d.type !== undefined) {
    if (typeof d.type !== 'string' || !DEVICE_TYPES.includes(d.type)) {
      throw invalid(`${field}.type`, `must be one of ${DEVICE_TYPES.join(', ')}`, 'unknownValue');
    }
    result.type = d.type as SampleDevice['type'];
  }
  return result;
}

/** Fields every new sample shares, except the dates. */
function commonFields(s: Fields, at: string): Fields {
  const result: Fields = {};
  if (s.clientId !== undefined) result.clientId = nonEmptyString(s.clientId, `${at}.clientId`);
  if (s.clientVersion !== undefined) {
    if (result.clientId === undefined) throw invalid(`${at}.clientVersion`, 'needs clientId', 'needsClientId');
    const version = s.clientVersion;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
      throw invalid(`${at}.clientVersion`, 'must be a non-negative integer');
    }
    result.clientVersion = version;
  } else if (result.clientId !== undefined) {
    result.clientVersion = 1;
  }
  const method = s.recordingMethod ?? 'unknown';
  if (typeof method !== 'string' || !RECORDING_METHODS.includes(method as RecordingMethod)) {
    throw invalid(`${at}.recordingMethod`, `must be one of ${RECORDING_METHODS.join(', ')}`, 'unknownValue');
  }
  result.recordingMethod = method;
  if (s.device !== undefined) result.device = device(s.device, `${at}.device`);
  if (s.timeZone !== undefined) {
    const zone = nonEmptyString(s.timeZone, `${at}.timeZone`);
    if (!isValidTimeZone(zone)) throw invalid(`${at}.timeZone`, 'must be an IANA time zone, e.g. Europe/Berlin');
    result.timeZone = zone;
  }
  return result;
}

/** Validates the typed fields (decision #20) a sample sets, and fills required defaults. */
function typedFields(s: Fields, at: string, entry: RegistryEntry, platform: NativePlatform): Fields {
  const result: Fields = {};
  for (const name of TYPED_FIELDS) {
    const field = entry.fields?.[name];
    const value = s[name];
    if (value === undefined) {
      if (platform === 'ios' && field?.requiredOnWriteIos) {
        // HealthKit requires the cycle-start key on every flow sample, and a reason on insulin.
        if (field.type !== 'boolean') throw invalid(`${at}.${name}`, 'is required on iOS', 'required');
        result[name] = false;
      }
      continue;
    }
    if (!field) throw invalid(`${at}.${name}`, `doesn't apply to ${entry.id}`, 'notApplicable');
    const stored = platform === 'ios' ? field.ios : field.android === 'stored';
    if (!stored) {
      throw invalid(`${at}.${name}`, `can't be stored on ${PLATFORM_NAMES[platform]}`, 'valueUnsupportedOnPlatform');
    }
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw invalid(`${at}.${name}`, 'must be a boolean');
      result[name] = value;
    } else {
      result[name] = enumValue(value, `${at}.${name}`, field.values as string, platform);
    }
  }
  return result;
}

function rejectIfSet(s: Fields, at: string, entry: RegistryEntry, names: string[]): void {
  for (const name of names) {
    if (s[name] !== undefined) throw invalid(`${at}.${name}`, `doesn't apply to ${entry.id}`, 'notApplicable');
  }
}

function newPeriod(s: Fields, at: string, entry: RegistryEntry, platform: NativePlatform): Fields {
  if (s.endDate === undefined) throw invalid(`${at}.endDate`, 'is required for a period', 'required');
  const [start, end] = dateRange(s.startDate, s.endDate, `${at}.`);
  const days = daysBetween(start.day, end.day) + 1;
  if (days < 1) throw invalid(`${at}.endDate`, 'must not be on a day before startDate', 'endBeforeStart');
  if (platform === 'android' && days > MAX_PERIOD_DAYS_ANDROID) {
    throw invalid(
      `${at}.endDate`,
      `must be at most ${MAX_PERIOD_DAYS_ANDROID} days after startDate on Android`,
      'periodTooLong',
    );
  }
  rejectIfSet(s, at, entry, ['value', 'unit', ...TYPED_FIELDS, 'deltas', 'baseline']);
  const result: Fields = { type: entry.id, startDate: start.iso, endDate: end.iso };
  if (s.flow !== undefined) {
    const flow = object(s.flow, `${at}.flow`);
    const days: Record<string, string> = {};
    for (const day of Object.keys(flow)) {
      const field = `${at}.flow.${day}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < start.day || day > end.day) {
        throw invalid(field, 'must be a YYYY-MM-DD day inside the period', 'dayOutsidePeriod');
      }
      days[day] = enumValue(flow[day], field, REGISTRY.menstrualFlow.values as string, platform);
    }
    result.flow = days;
  }
  return result;
}

function newSkinTemperature(s: Fields, at: string, entry: RegistryEntry, platform: NativePlatform): Fields {
  if (s.endDate === undefined) throw invalid(`${at}.endDate`, 'is required for skinTemperature', 'required');
  const [start, end] = dateRange(s.startDate, s.endDate, `${at}.`);
  if (end.ms === start.ms) throw invalid(`${at}.endDate`, 'must be after startDate', 'endNotAfterStart');
  rejectIfSet(s, at, entry, ['value', 'flow', 'isCycleStart', 'sensation', 'protectionUsed']);
  const result: Fields = {
    type: entry.id,
    startDate: start.iso,
    endDate: end.iso,
    unit: unit(s.unit, `${at}.unit`, entry),
  };
  if (s.baseline !== undefined) result.baseline = finiteNumber(s.baseline, `${at}.baseline`);
  if (!Array.isArray(s.deltas)) throw invalid(`${at}.deltas`, 'must be an array', 'required');
  result.deltas = s.deltas.map((raw, i) => {
    const field = `${at}.deltas[${i}]`;
    const d = object(raw, field);
    const time = parseDate(d.time, `${field}.time`);
    if (time.ms < start.ms || time.ms >= end.ms) {
      throw invalid(`${field}.time`, 'must be from startDate up to (not including) endDate', 'outsideSample');
    }
    return { time: time.iso, delta: finiteNumber(d.delta, `${field}.delta`) };
  });
  Object.assign(result, typedFields({ measurementLocation: s.measurementLocation }, at, entry, platform));
  return result;
}

function newBloodPressure(s: Fields, at: string, entry: RegistryEntry, platform: NativePlatform): Fields {
  const start = parseDate(s.startDate, `${at}.startDate`);
  let end = start;
  if (s.endDate !== undefined) [, end] = dateRange(s.startDate, s.endDate, `${at}.`);
  if (platform === 'android' && end.ms !== start.ms) {
    throw invalid(
      `${at}.endDate`,
      'must equal startDate: a blood pressure reading is a single moment on Android',
      'instantOnly',
    );
  }
  rejectIfSet(s, at, entry, ['value', 'flow', 'deltas', 'baseline']);
  const result: Fields = {
    type: entry.id,
    startDate: start.iso,
    endDate: end.iso,
    systolic: finiteNumber(s.systolic, `${at}.systolic`),
    diastolic: finiteNumber(s.diastolic, `${at}.diastolic`),
    unit: unit(s.unit, `${at}.unit`, entry),
  };
  return Object.assign(result, typedFields(s, at, entry, platform));
}

function newSample(raw: unknown, i: number, platform: NativePlatform): NewSample {
  const at = `samples[${i}]`;
  const s = object(raw, at);
  const entry = writableType(s.type, `${at}.type`, platform);
  let result: Fields;

  if (entry.id === 'menstruationPeriod') {
    result = newPeriod(s, at, entry, platform);
  } else if (entry.id === 'skinTemperature') {
    result = newSkinTemperature(s, at, entry, platform);
  } else if (entry.id === 'bloodPressure') {
    result = newBloodPressure(s, at, entry, platform);
  } else {
    const start = parseDate(s.startDate, `${at}.startDate`);
    let end = start;
    if (s.endDate !== undefined) [, end] = dateRange(s.startDate, s.endDate, `${at}.`);
    // A series type's sample is one point of a Health Connect series record (decision #53).
    const androidTime = entry.android?.time;
    const instant =
      platform === 'ios' ? entry.ios?.time === 'instant' : androidTime === 'instant' || androidTime === 'series';
    // Health Connect interval records need an end after their start.
    if (platform === 'android' && entry.android?.time === 'interval' && end.ms <= start.ms) {
      throw invalid(
        `${at}.endDate`,
        `must be after startDate: ${entry.id} covers a period of time on Android`,
        'intervalOnly',
      );
    }
    if (platform === 'ios' && entry.ios?.time === 'interval' && end.ms - start.ms < 1000) {
      throw invalid(
        `${at}.endDate`,
        `must be at least a second after startDate: ${entry.id} covers a period of time on iOS`,
        'intervalOnly',
      );
    }
    if (instant && end.ms !== start.ms) {
      throw invalid(
        `${at}.endDate`,
        `must equal startDate: ${entry.id} is a single moment on ${PLATFORM_NAMES[platform]}`,
        'instantOnly',
      );
    }
    result = { type: entry.id, startDate: start.iso, endDate: end.iso };
    rejectIfSet(s, at, entry, ['flow', 'deltas', 'baseline']);

    if (entry.kind === 'quantity') {
      result.value = finiteNumber(s.value, `${at}.value`);
      result.unit = unit(s.unit, `${at}.unit`, entry);
      if (platform === 'android' && entry.android?.wholeNumber && !Number.isInteger(result.value)) {
        throw invalid(`${at}.value`, 'must be a whole number on Android', 'wholeNumberOnly');
      }
      // The registry only gives ranges to single-unit types, so the value is in the range's unit.
      const range = platform === 'ios' ? entry.ios?.range : undefined;
      if (range && ((result.value as number) < range.min || (result.value as number) > range.max)) {
        throw invalid(`${at}.value`, `must be from ${range.min} to ${range.max} ${entry.unit}`, 'outOfRange');
      }
    } else if (entry.kind === 'category') {
      result.value = enumValue(s.value, `${at}.value`, entry.values as string, platform);
      rejectIfSet(s, at, entry, ['unit']);
    } else {
      rejectIfSet(s, at, entry, ['value', 'unit']);
    }
    Object.assign(result, typedFields(s, at, entry, platform));
  }
  return { ...result, ...commonFields(s, at) } as unknown as NewSample;
}

export function validateSaveSamples(options: SaveSamplesOptions, platform: NativePlatform): SaveSamplesOptions {
  const o = object(options, 'options');
  if (!Array.isArray(o.samples) || o.samples.length === 0) throw invalid('samples', 'must be a non-empty array');
  return { samples: o.samples.map((s, i) => newSample(s, i, platform)) };
}

export function validateDeleteSamples(options: DeleteSamplesOptions, platform: NativePlatform): DeleteSamplesOptions {
  const o = object(options, 'options');
  const entry = writableType(o.type, 'type', platform);
  const selectors = [o.ids, o.clientIds, o.startDate ?? o.endDate].filter((v) => v !== undefined).length;
  if (selectors !== 1) {
    throw invalid('ids', 'clientIds, or startDate + endDate: pass exactly one', 'oneSelector');
  }
  const result: DeleteSamplesOptions = { type: entry.id };
  if (o.ids !== undefined) result.ids = stringList(o.ids, 'ids');
  else if (o.clientIds !== undefined) result.clientIds = stringList(o.clientIds, 'clientIds');
  else {
    const [start, end] = dateRange(o.startDate, o.endDate, '');
    result.startDate = start.iso;
    result.endDate = end.iso;
  }
  return result;
}
