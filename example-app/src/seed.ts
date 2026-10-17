import { Capacitor } from '@capacitor/core';
import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { NewSample } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

const PREFIX = 'example-seed';

/** `days` days before today at `hour`:00 local time. */
function daysAgo(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * A known reproductive dataset over the last ~60 days: two periods with daily flow, daily basal body
 * temperature with a luteal rise, ovulation tests and cervical mucus around ovulation, one spotting day,
 * sexual activity, and (iOS) a couple of symptoms; plus two blood pressure readings. Every sample has a
 * fixed `clientId`, so seeding again upserts instead of duplicating.
 */
export function seedSamples(): NewSample[] {
  const ios = Capacitor.getPlatform() === 'ios';
  const samples: NewSample[] = [];
  const id = (name: string) => `${PREFIX}:${name}`;
  const day = (date: Date) => localIso(date).slice(0, 10);

  // Two periods, 28 days apart, with heavier flow at the start.
  for (const [n, start] of [56, 28].entries()) {
    const first = daysAgo(start, 9);
    const last = daysAgo(start - 4, 9);
    const flow: Record<string, string> = {};
    ['heavy', 'heavy', 'medium', 'light', 'light'].forEach((value, i) => (flow[day(daysAgo(start - i, 9))] = value));
    samples.push({ type: 'menstruationPeriod', startDate: localIso(first), endDate: localIso(last), clientId: id(`period-${n}`), flow, recordingMethod: 'manual' });
  }

  // Basal body temperature every morning: lower before ovulation (day 14 of each cycle), higher after.
  for (let d = 58; d >= 1; d--) {
    const cycleDay = (58 - d) % 28;
    const value = cycleDay < 14 ? 36.3 + (d % 3) * 0.05 : 36.7 + (d % 3) * 0.05;
    samples.push({ type: 'basalBodyTemperature', startDate: localIso(daysAgo(d, 6)), value: Math.round(value * 100) / 100, unit: 'degC', measurementLocation: 'mouth', clientId: id(`bbt-${d}`), recordingMethod: 'manual' });
  }

  // Ovulation tests and cervical mucus around the second cycle's ovulation (~14 days after its start).
  [17, 16, 15, 14, 13].forEach((d, i) => {
    samples.push({ type: 'ovulationTest', startDate: localIso(daysAgo(d, 8)), value: i === 2 ? 'lhSurge' : 'negative', clientId: id(`ovulation-${d}`), recordingMethod: 'manual' });
    samples.push({ type: 'cervicalMucus', startDate: localIso(daysAgo(d, 8)), value: ['sticky', 'creamy', 'eggWhite', 'eggWhite', 'watery'][i], clientId: id(`mucus-${d}`), recordingMethod: 'manual' });
  });

  samples.push({ type: 'intermenstrualBleeding', startDate: localIso(daysAgo(20, 18)), clientId: id('spotting'), recordingMethod: 'manual' });
  samples.push({ type: 'sexualActivity', startDate: localIso(daysAgo(15, 22)), protectionUsed: true, clientId: id('activity'), recordingMethod: 'manual' });
  for (const [d, systolic, diastolic] of [[2, 118, 76], [1, 122, 79]]) {
    samples.push({ type: 'bloodPressure', startDate: localIso(daysAgo(d, 8)), systolic, diastolic, clientId: id(`bp-${d}`), recordingMethod: 'manual' });
  }
  if (ios) {
    samples.push({ type: 'abdominalCramps', startDate: localIso(daysAgo(28, 10)), value: 'moderate', clientId: id('cramps'), recordingMethod: 'manual' });
    samples.push({ type: 'headache', startDate: localIso(daysAgo(27, 15)), value: 'mild', clientId: id('headache'), recordingMethod: 'manual' });
  }
  return samples;
}

export async function seedTestData(): Promise<string> {
  const samples = seedSamples();
  const { ids } = await CapacitorHealth.saveSamples({ samples });
  return `Seeded ${ids.length} samples (${[...new Set(samples.map((s) => s.type))].join(', ')}).`;
}

export async function deleteTestData(): Promise<string> {
  const byType = new Map<NewSample['type'], string[]>();
  for (const sample of seedSamples()) {
    byType.set(sample.type, [...(byType.get(sample.type) ?? []), sample.clientId as string]);
  }
  let deleted = 0;
  for (const [type, clientIds] of byType) {
    deleted += (await CapacitorHealth.deleteSamples({ type, clientIds })).deleted;
  }
  return `Deleted ${deleted} (periods count once).`;
}
