import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { AggregateBucketUnit, AggregateMetric, HealthType, TypeSupport } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

/**
 * Writes 1,000 steps over the current hour, then compares the raw samples of that hour with
 * `aggregate()`: with another source's steps in the same hour (Apple Health's "Add Data", a second
 * app), the aggregate shows how the platform removes the overlap. Also aggregates the last week by day.
 */
export async function runAggregateCheck(): Promise<string[]> {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const hour = { startDate: localIso(start), endDate: localIso(end) };
  await CapacitorHealth.saveSamples({
    samples: [{ type: 'steps', ...hour, value: 1000, clientId: 'example-aggregate-steps', recordingMethod: 'manual' }],
  });
  const { samples } = await CapacitorHealth.readSamples({ type: 'steps', ...hour });
  const raw = samples.map((s) => `${s.source.id} ${(s as { value: number }).value}`);
  const total = samples.reduce((sum, s) => sum + (s as { value: number }).value, 0);
  const { buckets } = await CapacitorHealth.aggregate({ type: 'steps', ...hour, metrics: ['sum'] });

  const weekStart = new Date(start);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const week = await CapacitorHealth.aggregate({
    type: 'steps',
    startDate: localIso(weekStart),
    endDate: localIso(end),
    metrics: ['sum'],
    bucket: { unit: 'day' },
  });
  return [
    `raw samples this hour: ${raw.join(', ') || 'none'} (total ${total})`,
    `aggregate sum this hour: ${buckets[0]?.values.sum ?? 'no data'}`,
    ...week.buckets.map((b) => `${b.startDate.slice(0, 10)}: ${b.values.sum ?? '-'}`),
  ];
}

/**
 * iOS: writes, reads and deletes passthrough types (`hk:` + an identifier the registry doesn't cover yet): a
 * handwashing and a toothbrushing event with HealthKit's raw value. Every quantity identifier is registered.
 */
export async function runPassthroughCheck(): Promise<string[]> {
  const handwashing = 'hk:HKCategoryTypeIdentifierHandwashingEvent' as const;
  const toothbrushing = 'hk:HKCategoryTypeIdentifierToothbrushingEvent' as const;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const hour = { startDate: localIso(start), endDate: localIso(new Date(start.getTime() + 3600_000)) };
  const brushing = { startDate: hour.startDate, endDate: localIso(new Date(start.getTime() + 120_000)) };
  // Passthrough ids aren't in the app's main request: ask for them here (the sheet shows only if they're new).
  await CapacitorHealth.requestAuthorization({ read: [handwashing, toothbrushing], write: [handwashing, toothbrushing] });
  await CapacitorHealth.saveSamples({
    samples: [
      { type: handwashing, startDate: hour.startDate, value: 0, clientId: 'example-passthrough-handwashing' },
      { type: toothbrushing, ...brushing, value: 0, clientId: 'example-passthrough-toothbrushing' },
    ],
  });
  const read = async (type: typeof handwashing | typeof toothbrushing) =>
    (await CapacitorHealth.readSamples({ type, ...hour })).samples
      .filter((s) => s.clientId?.startsWith('example-passthrough'))
      .map((s) => `${s.type} ${s.kind} ${(s as { value: number }).value}`);
  const lines = [...(await read(handwashing)), ...(await read(toothbrushing))];
  let deleted = 0;
  for (const [type, clientId] of [
    [handwashing, 'example-passthrough-handwashing'],
    [toothbrushing, 'example-passthrough-toothbrushing'],
  ] as const) {
    deleted += (await CapacitorHealth.deleteSamples({ type, clientIds: [clientId] })).deleted;
  }
  return [...lines, `deleted ${deleted}`];
}

let aggregatable: TypeSupport[] = [];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Fills the aggregate screen's type picker with the types `aggregate()` serves on this device. */
export async function loadAggregateTypes(): Promise<string> {
  const { types } = await CapacitorHealth.getSupportedTypes();
  aggregatable = types.filter((t) => t.aggregatable);
  $<HTMLSelectElement>('aggregate-type').innerHTML = aggregatable.map((t) => `<option>${t.type}</option>`).join('');
  updateAggregateOptions();
  return `${aggregatable.length} aggregatable types`;
}

/** Metric checkboxes and units for the picked type. */
export function updateAggregateOptions(): void {
  const type = aggregatable.find((t) => t.type === $<HTMLSelectElement>('aggregate-type').value);
  $('aggregate-metrics').innerHTML = (type?.metrics ?? [])
    .map((m, i) => `<label><input type="checkbox" value="${m}"${i === 0 ? ' checked' : ''} /> ${m}</label>`)
    .join(' ');
  $<HTMLSelectElement>('aggregate-unit').innerHTML = (type?.units ?? []).map((u) => `<option>${u}</option>`).join('');
}

/** Runs `aggregate()` with the screen's options and prints one line per bucket. */
export async function runAggregate(): Promise<string[]> {
  const type = $<HTMLSelectElement>('aggregate-type').value as HealthType;
  if (!type) return ['Load the types first.'];
  const metrics = Array.from(document.querySelectorAll<HTMLInputElement>('#aggregate-metrics input:checked')).map(
    (input) => input.value as AggregateMetric,
  );
  const days = Math.max(1, Number($<HTMLInputElement>('aggregate-days').value) || 7);
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const bucketUnit = $<HTMLSelectElement>('aggregate-bucket').value as AggregateBucketUnit | '';
  const size = Math.max(1, Number($<HTMLInputElement>('aggregate-size').value) || 1);
  const sourceIds = $<HTMLInputElement>('aggregate-sources')
    .value.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const unit = $<HTMLSelectElement>('aggregate-unit').value;
  const { buckets } = await CapacitorHealth.aggregate({
    type,
    startDate: localIso(start),
    endDate: localIso(end),
    metrics,
    ...(bucketUnit ? { bucket: { unit: bucketUnit, size } } : {}),
    ...(unit ? { unit } : {}),
    ...(sourceIds.length ? { sourceIds } : {}),
  });
  const format = (value: number | undefined) => (value === undefined ? '-' : String(Math.round(value * 100) / 100));
  return [
    `${buckets.length} buckets, ${metrics.join('/')} in ${buckets[0]?.unit ?? unit}`,
    ...buckets.map((b) => `${b.startDate.slice(0, 16)}  ${metrics.map((m) => `${m} ${format(b.values[m])}`).join('  ')}`),
  ];
}
