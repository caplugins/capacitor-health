import { Capacitor } from '@capacitor/core';
import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { NewSample, Sample } from '@caplugins/capacitor-health';

/** `date` as ISO 8601 in the device's zone, e.g. `2026-09-10T12:00:00.000+05:30`. */
export function localIso(date: Date): string {
  const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

interface RoundTripCase {
  name: string;
  sample: NewSample;
  /** Unit to read back in (quantity types). */
  unit?: string;
  /** The changed sample for the upsert step. */
  update: Partial<NewSample>;
  check: (sample: Sample, expected: NewSample) => string | null;
}

const isAndroid = () => Capacitor.getPlatform() === 'android';

function sameValue(sample: Sample, expected: NewSample): string | null {
  const actual = (sample as { value?: unknown }).value;
  const wanted = (expected as { value?: unknown }).value;
  if (typeof wanted === 'number' && typeof actual === 'number') {
    return Math.abs(actual - wanted) < 0.01 ? null : `value ${actual} ≠ ${wanted}`;
  }
  return actual === wanted ? null : `value ${String(actual)} ≠ ${String(wanted)}`;
}

function cases(at: Date): RoundTripCase[] {
  const startDate = localIso(at);
  return [
    {
      name: 'menstrualFlow',
      sample: { type: 'menstrualFlow', startDate, value: 'medium', ...(isAndroid() ? {} : { isCycleStart: true }) },
      update: { value: 'heavy' } as Partial<NewSample>,
      check: (s, e) =>
        sameValue(s, e) ?? (!isAndroid() && (s as { isCycleStart?: boolean }).isCycleStart !== true ? 'isCycleStart lost' : null),
    },
    {
      name: 'cervicalMucus',
      sample: { type: 'cervicalMucus', startDate, value: 'eggWhite', ...(isAndroid() ? { sensation: 'medium' } : {}) },
      update: { value: 'creamy' } as Partial<NewSample>,
      check: (s, e) =>
        sameValue(s, e) ?? (isAndroid() && (s as { sensation?: string }).sensation !== 'medium' ? 'sensation lost' : null),
    },
    {
      name: 'basalBodyTemperature °C',
      sample: { type: 'basalBodyTemperature', startDate, value: 36.55, unit: 'degC', measurementLocation: 'mouth' },
      unit: 'degC',
      update: { value: 36.7 } as Partial<NewSample>,
      check: (s, e) =>
        sameValue(s, e) ?? ((s as { measurementLocation?: string }).measurementLocation !== 'mouth' ? 'location lost' : null),
    },
    {
      name: 'basalBodyTemperature °F',
      sample: { type: 'basalBodyTemperature', startDate, value: 97.9, unit: 'degF' },
      unit: 'degF',
      update: { value: 98.1 } as Partial<NewSample>,
      check: (s, e) => sameValue(s, e) ?? ((s as { unit?: string }).unit !== 'degF' ? 'unit not degF' : null),
    },
  ];
}

async function readOwn(sample: NewSample, unit: string | undefined, clientId: string): Promise<Sample[]> {
  const start = new Date(Date.parse(sample.startDate) - 60_000);
  const end = new Date(Date.parse(sample.startDate) + 60_000);
  const { samples } = await CapacitorHealth.readSamples({
    type: sample.type,
    startDate: localIso(start),
    endDate: localIso(end),
    ...(unit ? { unit } : {}),
  });
  return samples.filter((s) => s.clientId === clientId);
}

/** Writes, reads back, upserts and deletes one sample per case; returns one line per step. */
export async function runRoundTrips(): Promise<string[]> {
  const lines: string[] = [];
  const at = new Date();
  at.setDate(at.getDate() - 20);
  at.setHours(12, 0, 0, 0);
  for (const [index, c] of cases(at).entries()) {
    const clientId = `example-roundtrip-${index}-${at.getTime()}`;
    const log = (ok: boolean, step: string) => lines.push(`${ok ? 'PASS' : 'FAIL'} ${c.name}: ${step}`);
    try {
      const sample = { ...c.sample, clientId, recordingMethod: 'manual' } as NewSample;
      const { ids } = await CapacitorHealth.saveSamples({ samples: [sample] });
      let found = await readOwn(sample, c.unit, clientId);
      const problem = found.length === 1 ? c.check(found[0], sample) : `found ${found.length} samples`;
      log(!problem && found[0]?.id === ids[0], `write → read ${problem ?? 'ok'} (id ${found[0]?.id === ids[0] ? 'matches' : 'differs'})`);
      log(found[0]?.startDate === sample.startDate || Date.parse(found[0]?.startDate) === Date.parse(sample.startDate), `time ${found[0]?.startDate}`);
      log(found[0]?.recordingMethod === 'manual' && !!found[0]?.source.id, `source ${found[0]?.source.id}, ${found[0]?.recordingMethod}`);

      const updated = { ...sample, ...c.update, clientVersion: 2 } as NewSample;
      const upsert = await CapacitorHealth.saveSamples({ samples: [updated] });
      found = await readOwn(sample, c.unit, clientId);
      const upsertProblem = found.length === 1 ? sameValue(found[0], updated) : `found ${found.length} samples`;
      log(!upsertProblem && found[0]?.id === upsert.ids[0], `upsert ${upsertProblem ?? 'ok, no duplicate'}`);

      const stale = { ...sample, clientVersion: 1 } as NewSample;
      const ignored = await CapacitorHealth.saveSamples({ samples: [stale] });
      found = await readOwn(sample, c.unit, clientId);
      log(found.length === 1 && !sameValue(found[0], updated) && ignored.ids[0] === found[0].id, 'lower version ignored, id is the stored one');

      const { deleted } = await CapacitorHealth.deleteSamples({ type: sample.type, clientIds: [clientId] });
      found = await readOwn(sample, c.unit, clientId);
      log(deleted >= 1 && found.length === 0, `delete by clientId (deleted ${deleted})`);
    } catch (error) {
      const { code, message } = error as { code?: string; message?: string };
      log(false, `threw ${code}: ${message}`);
    }
  }
  return lines;
}
