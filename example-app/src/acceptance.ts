import { Capacitor } from '@capacitor/core';
import { CapacitorHealth, HEALTH_TYPES, REGISTRY } from '@caplugins/capacitor-health';
import type { HealthType, NewSample, Sample, TypeSupport } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

/** One row of the per-type acceptance checklist (Development and Testing page of the project wiki). */
export interface AcceptanceRow {
  type: HealthType;
  platform: string;
  status: 'pass' | 'fail' | 'readOnly' | 'aggregateOnly' | 'unsupported';
  steps: Record<string, string>;
  notes: string[];
}

const platform = Capacitor.getPlatform();
const errorCode = (e: unknown) => (e as { code?: string }).code ?? String(e);

/** Plausible values for quantity types in their canonical unit; others get 1. */
const QUANTITY_VALUES: Partial<Record<HealthType, number>> = {
  steps: 1200,
  distance: 850,
  activeEnergy: 120,
  basalEnergy: 60,
  basalMetabolicRate: 1600,
  totalEnergy: 200,
  floorsClimbed: 3,
  elevationGained: 12,
  wheelchairPushes: 40,
  stepsCadence: 100,
  speed: 1.4,
  power: 180,
  cyclingCadence: 85,
  vo2Max: 42,
  physicalEffort: 3.5,
  workoutEffortScore: 5,
  estimatedWorkoutEffortScore: 5,
  walkingStepLength: 0.7,
  walkingDoubleSupport: 28,
  sixMinuteWalkTestDistance: 450,
  runningStrideLength: 1.1,
  runningVerticalOscillation: 8,
  runningGroundContactTime: 250,
  swimmingStrokeCount: 20,
  heartRate: 72,
  restingHeartRate: 58,
  heartRateVariabilitySdnn: 45,
  heartRateVariabilityRmssd: 40,
  heartRateRecovery: 25,
  oxygenSaturation: 97,
  respiratoryRate: 14,
  bodyTemperature: 36.8,
  bloodGlucose: 95,
  peripheralPerfusionIndex: 2,
  weight: 70,
  height: 1.75,
  bodyFat: 22,
  leanBodyMass: 55,
  boneMass: 3,
  bodyWaterMass: 40,
  bmi: 22.9,
  waistCircumference: 0.8,
  forcedVitalCapacity: 4.5,
  forcedExpiratoryVolume1: 3.5,
  peakExpiratoryFlowRate: 450,
  timeInDaylight: 30,
  environmentalAudioExposure: 60,
  headphoneAudioExposure: 70,
  environmentalSoundReduction: 20,
  underwaterDepth: 3,
  waterTemperature: 24,
  insulinDelivery: 2,
};

/** A new sample of `support.type` at `at`, with the type's first (or second) value. */
function sampleFor(support: TypeSupport, at: Date, clientId: string, variant: 0 | 1): NewSample {
  const startDate = localIso(at);
  const base = { startDate, clientId, recordingMethod: 'manual' as const };
  const values = support.values ?? [];
  const value = values[Math.min(variant, values.length - 1)];
  switch (support.type) {
    case 'menstruationPeriod': {
      const end = new Date(at);
      end.setDate(end.getDate() + 2 + variant);
      return { ...base, type: 'menstruationPeriod', endDate: localIso(end) };
    }
    case 'skinTemperature': {
      const end = new Date(at.getTime() + 8 * 3600_000);
      return {
        ...base,
        type: 'skinTemperature',
        endDate: localIso(end),
        baseline: 33.5 + variant,
        deltas: [{ time: localIso(new Date(at.getTime() + 3600_000)), delta: -0.2 }],
        measurementLocation: 'wrist',
      };
    }
    case 'basalBodyTemperature':
      return {
        ...base,
        type: 'basalBodyTemperature',
        value: 36.4 + variant / 10,
        unit: 'degC',
        measurementLocation: 'mouth',
      };
    case 'sexualActivity':
      return { ...base, type: 'sexualActivity', protectionUsed: variant === 0 };
    case 'cervicalMucus':
      return { ...base, type: 'cervicalMucus', value, ...(platform === 'android' ? { sensation: 'light' } : {}) };
    case 'menstrualFlow':
      return { ...base, type: 'menstrualFlow', value, ...(platform === 'ios' ? { isCycleStart: variant === 0 } : {}) };
    case 'bloodPressure':
      return { ...base, type: 'bloodPressure', systolic: 120 + variant, diastolic: 80, unit: 'mmHg' };
    case 'insulinDelivery':
      return {
        ...base,
        type: 'insulinDelivery',
        value: 2 + variant,
        reason: variant === 0 ? 'basal' : 'bolus',
        endDate: later(at),
      };
    default:
      if (support.units) {
        // Quantities cover five minutes on iOS (audio exposure needs a duration) and for Health Connect's
        // interval records; its instant records are a single moment.
        const interval = platform === 'ios' || REGISTRY[support.type].android?.time === 'interval';
        const quantity = {
          ...base,
          type: support.type,
          value: (QUANTITY_VALUES[support.type] ?? 1) + variant,
          unit: support.units[0],
        };
        return (interval ? { ...quantity, endDate: later(at) } : quantity) as NewSample;
      }
      return (
        value !== undefined ? { ...base, type: support.type, value } : { ...base, type: support.type }
      ) as NewSample;
  }
}

function later(at: Date): string {
  return localIso(new Date(at.getTime() + 5 * 60_000));
}

function sameValue(sample: Sample | undefined, expected: NewSample): boolean {
  if (!sample) return false;
  const wanted = (expected as { value?: unknown }).value;
  const actual = (sample as { value?: unknown }).value;
  if (typeof wanted === 'number') return typeof actual === 'number' && Math.abs(actual - wanted) < 0.001;
  if (expected.type === 'menstruationPeriod') {
    return (sample as { lastDay?: string }).lastDay === expected.endDate?.slice(0, 10);
  }
  if (expected.type === 'skinTemperature') return (sample as { baseline?: number }).baseline === expected.baseline;
  if (expected.type === 'bloodPressure') {
    const reading = sample as { systolic?: number; diastolic?: number };
    return reading.systolic === expected.systolic && reading.diastolic === expected.diastolic;
  }
  if (expected.type === 'sexualActivity')
    return (sample as { protectionUsed?: boolean }).protectionUsed === expected.protectionUsed;
  return wanted === undefined || actual === wanted;
}

async function readOwn(type: HealthType, at: Date, clientId: string): Promise<Sample[]> {
  const { samples } = await CapacitorHealth.readSamples({
    type,
    startDate: localIso(new Date(at.getTime() - 3600_000)),
    endDate: localIso(new Date(at.getTime() + 4 * 86_400_000)),
  });
  return samples.filter((s) => s.clientId === clientId);
}

async function checkWritable(support: TypeSupport, at: Date, row: AcceptanceRow): Promise<void> {
  const { type } = support;
  const clientId = `example-acceptance-${type}-${at.getTime()}`;
  const step = (name: string, ok: boolean, detail = '') => {
    row.steps[name] = ok ? `✓${detail ? ` ${detail}` : ''}` : `✗ ${detail}`;
    if (!ok) row.status = 'fail';
  };
  const followsChanges = !(platform === 'ios' && type === 'menstruationPeriod');
  const cursor = followsChanges ? (await CapacitorHealth.getChanges({ types: [type] })).nextCursor : undefined;

  const first = sampleFor(support, at, clientId, 0);
  const { ids } = await CapacitorHealth.saveSamples({ samples: [first] });
  let found = await readOwn(type, at, clientId);
  const read = found[0];
  step('write', found.length === 1 && read?.id === ids[0], `${found.length} read back`);
  const shapeOk =
    !!read &&
    read.type === type &&
    read.source?.id?.length > 0 &&
    read.recordingMethod === 'manual' &&
    read.platform === platform &&
    !!read.native?.type &&
    Date.parse(read.startDate) <= Date.parse(read.endDate);
  step('shape', shapeOk && sameValue(read, first), read ? `${read.kind}, ${read.source.id}` : 'missing');

  const second = { ...sampleFor(support, at, clientId, 1), clientVersion: 2 } as NewSample;
  await CapacitorHealth.saveSamples({ samples: [second] });
  found = await readOwn(type, at, clientId);
  step('upsert', found.length === 1 && sameValue(found[0], second), `${found.length} after upsert`);

  await CapacitorHealth.saveSamples({ samples: [{ ...first, clientVersion: 1 } as NewSample] });
  found = await readOwn(type, at, clientId);
  step('stale', found.length === 1 && sameValue(found[0], second), 'lower version ignored');

  let upsertSeen = false;
  let nextCursor = cursor;
  if (cursor) {
    const changes = await CapacitorHealth.getChanges({ types: [type], cursor });
    upsertSeen = changes.upserted.some((s) => s.clientId === clientId);
    nextCursor = changes.nextCursor;
  }

  // Every unit reads the stored value back (T35).
  if ((support.units?.length ?? 0) > 1 && REGISTRY[support.type].kind === 'quantity') {
    const readings: string[] = [];
    for (const unit of support.units ?? []) {
      const { samples } = await CapacitorHealth.readSamples({
        type,
        startDate: localIso(new Date(at.getTime() - 3600_000)),
        endDate: localIso(new Date(at.getTime() + 4 * 86_400_000)),
        unit,
      });
      const value = (samples.find((s) => s.clientId === clientId) as { value?: number } | undefined)?.value;
      readings.push(`${unit} ${value === undefined ? '?' : Number(value.toPrecision(6))}`);
    }
    step('units', !readings.some((r) => r.endsWith('?') || r.endsWith('NaN')), readings.join(', '));
  }

  if (support.aggregatable) await checkAggregate(support, at, step);

  const { deleted } = await CapacitorHealth.deleteSamples({ type, clientIds: [clientId] });
  found = await readOwn(type, at, clientId);
  step('delete', deleted >= 1 && found.length === 0, `deleted ${deleted}`);

  if (nextCursor) {
    const changes = await CapacitorHealth.getChanges({ types: [type], cursor: nextCursor });
    step(
      'changes',
      upsertSeen && changes.deleted.length >= 1,
      `upsert ${upsertSeen ? 'seen' : 'missing'}, ${changes.deleted.length} deleted`,
    );
  } else {
    row.steps.changes = 'n/a (follow menstrualFlow, decision #41)';
  }
}

/** Aggregates the sample's day (day buckets) with every metric the type has; the sample's bucket must have values. */
async function checkAggregate(
  support: TypeSupport,
  at: Date,
  step: (name: string, ok: boolean, detail?: string) => void,
  requireData = true,
): Promise<void> {
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const metrics = support.metrics ?? [];
  try {
    const { buckets } = await CapacitorHealth.aggregate({
      type: support.type,
      startDate: localIso(dayStart),
      endDate: localIso(dayEnd),
      metrics,
      bucket: { unit: 'hour', size: 6 },
    });
    const filled = buckets.filter((b) => Object.keys(b.values).length > 0);
    const values = filled.map((b) =>
      metrics.map((m) => `${m} ${Number((b.values[m] ?? NaN).toPrecision(6))}`).join(' '),
    );
    step(
      'aggregate',
      buckets.length === 4 && (!requireData || filled.length >= 1),
      `${buckets.length} buckets; ${values.join(' / ') || 'no data'}`,
    );
  } catch (error) {
    step('aggregate', false, errorCode(error));
  }
}

/**
 * Runs the acceptance checklist for every type. `granted`: full write/read cycle where writable.
 * `denied`: the app has no access; reads must be empty on iOS and PERMISSION_DENIED on Android,
 * writes PERMISSION_DENIED.
 */
export async function runAcceptance(mode: 'granted' | 'denied' = 'granted'): Promise<AcceptanceRow[]> {
  const { types } = await CapacitorHealth.getSupportedTypes();
  const rows: AcceptanceRow[] = [];
  const base = new Date();
  base.setDate(base.getDate() - 12);
  base.setHours(10, 0, 0, 0);
  for (const [index, type] of HEALTH_TYPES.entries()) {
    const support = types.find((t) => t.type === type) as TypeSupport;
    const row: AcceptanceRow = { type, platform, status: 'pass', steps: {}, notes: [] };
    rows.push(row);
    const at = new Date(base.getTime() + index * 7 * 60_000);
    try {
      if (!support.supported) {
        row.status = 'unsupported';
        const error = await CapacitorHealth.readSamples({
          type,
          startDate: localIso(at),
          endDate: localIso(new Date()),
        }).catch(errorCode);
        row.steps.read =
          error === 'UNSUPPORTED_TYPE' ? `✓ UNSUPPORTED_TYPE (${support.reason})` : `✗ ${JSON.stringify(error)}`;
        continue;
      }
      if (mode === 'denied' && !support.readable) {
        // Aggregate-only: the aggregate is the read. iOS hides denied reads, so it comes back empty.
        const result = await CapacitorHealth.aggregate({
          type,
          startDate: localIso(at),
          endDate: localIso(new Date()),
          metrics: support.metrics ?? [],
        })
          .then((r) => (r.buckets.some((b) => Object.keys(b.values).length > 0) ? 'values' : 'empty'))
          .catch(errorCode);
        const ok = platform === 'ios' ? result === 'empty' : result === 'PERMISSION_DENIED';
        row.status = ok ? 'aggregateOnly' : 'fail';
        row.steps.aggregate = `${ok ? '✓' : '✗'} ${result}`;
        continue;
      }
      if (mode === 'denied') {
        const read = await CapacitorHealth.readSamples({ type, startDate: localIso(at), endDate: localIso(new Date()) })
          .then((r) => `${r.samples.length} samples`)
          .catch(errorCode);
        const readOk = platform === 'ios' ? read === '0 samples' : read === 'PERMISSION_DENIED';
        row.steps.read = `${readOk ? '✓' : '✗'} ${read}`;
        if (support.writable) {
          const write = await CapacitorHealth.saveSamples({ samples: [sampleFor(support, at, `denied-${type}`, 0)] })
            .then(() => 'written')
            .catch(errorCode);
          row.steps.write = `${write === 'PERMISSION_DENIED' ? '✓' : '✗'} ${write}`;
          if (write !== 'PERMISSION_DENIED') row.status = 'fail';
        }
        if (!readOk) row.status = 'fail';
        continue;
      }
      if (!support.readable) {
        row.status = 'aggregateOnly';
        if (support.aggregatable) {
          const step = (name: string, ok: boolean, detail = '') => {
            row.steps[name] = ok ? `✓ ${detail}` : `✗ ${detail}`;
            if (!ok) row.status = 'fail';
          };
          await checkAggregate(support, at, step, false);
        }
        const error = await CapacitorHealth.readSamples({
          type,
          startDate: localIso(at),
          endDate: localIso(new Date()),
        }).catch(errorCode);
        row.steps.read =
          error === 'UNSUPPORTED_TYPE' ? `✓ UNSUPPORTED_TYPE (${support.reason})` : `✗ ${JSON.stringify(error)}`;
        if (error !== 'UNSUPPORTED_TYPE') row.status = 'fail';
        continue;
      }
      if (!support.writable) {
        row.status = 'readOnly';
        const { samples } = await CapacitorHealth.readSamples({
          type,
          startDate: localIso(at),
          endDate: localIso(new Date()),
        });
        row.steps.read = `✓ ${samples.length} samples`;
        const write = await CapacitorHealth.saveSamples({ samples: [sampleFor(support, at, 'x', 0)] }).catch(errorCode);
        row.steps.write = write === 'READ_ONLY_TYPE' ? '✓ READ_ONLY_TYPE' : `✗ ${JSON.stringify(write)}`;
        continue;
      }
      await checkWritable(support, at, row);
    } catch (error) {
      row.status = 'fail';
      row.notes.push(`${errorCode(error)}: ${(error as { message?: string }).message ?? ''}`);
    }
  }
  return rows;
}
