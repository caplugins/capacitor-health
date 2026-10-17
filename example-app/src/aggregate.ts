import { CapacitorHealth } from '@caplugins/capacitor-health';

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
 * iOS: writes, reads and deletes a passthrough type (`hk:` + an identifier the registry doesn't cover yet):
 * 250 mL of water and a sleep sample with HealthKit's raw value.
 */
export async function runPassthroughCheck(): Promise<string[]> {
  const water = 'hk:HKQuantityTypeIdentifierDietaryWater' as const;
  const sleep = 'hk:HKCategoryTypeIdentifierSleepAnalysis' as const;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const hour = { startDate: localIso(start), endDate: localIso(new Date(start.getTime() + 3600_000)) };
  await CapacitorHealth.saveSamples({
    samples: [
      { type: water, startDate: hour.startDate, value: 250, unit: 'mL', clientId: 'example-passthrough-water' },
      { type: sleep, ...hour, value: 2, clientId: 'example-passthrough-sleep' },
    ],
  });
  const read = async (type: typeof water | typeof sleep, unit?: string) =>
    (await CapacitorHealth.readSamples({ type, ...hour, ...(unit ? { unit } : {}) })).samples
      .filter((s) => s.clientId?.startsWith('example-passthrough'))
      .map((s) => `${s.type} ${s.kind} ${(s as { value: number }).value} ${(s as { unit?: string }).unit ?? ''}`.trim());
  const lines = [...(await read(water, 'mL')), ...(await read(water)), ...(await read(sleep))];
  const deleted = (await CapacitorHealth.deleteSamples({ type: water, clientIds: ['example-passthrough-water'] })).deleted;
  const deletedSleep = (await CapacitorHealth.deleteSamples({ type: sleep, clientIds: ['example-passthrough-sleep'] })).deleted;
  return [...lines, `deleted ${deleted + deletedSleep}`];
}
