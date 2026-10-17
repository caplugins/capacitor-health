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
 * sexual activity, and (iOS) a couple of symptoms; plus two blood pressure readings and a week of activity,
 * vitals and body data (`activitySamples`). Every sample has a
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
  samples.push(...activitySamples(id));
  if (ios) {
    samples.push({ type: 'abdominalCramps', startDate: localIso(daysAgo(28, 10)), value: 'moderate', clientId: id('cramps'), recordingMethod: 'manual' });
    samples.push({ type: 'headache', startDate: localIso(daysAgo(27, 15)), value: 'mild', clientId: id('headache'), recordingMethod: 'manual' });
  }
  return samples;
}

/**
 * A week of activity, vitals and body data for `aggregate()`: hourly steps, distance and active energy from a
 * "phone" and, for the same hours, slightly different steps from a "watch" (the overlap the platforms resolve
 * differently: see the README's aggregate notes), heart rate through the day, and daily weight, body fat,
 * height and blood glucose.
 */
function activitySamples(id: (name: string) => string): NewSample[] {
  const samples: NewSample[] = [];
  const phone = { name: 'Example phone', manufacturer: 'Example', model: 'P1', type: 'phone' as const };
  const watch = { name: 'Example watch', manufacturer: 'Example', model: 'W1', type: 'watch' as const };
  for (let d = 7; d >= 1; d--) {
    for (const hour of [8, 12, 18]) {
      const start = daysAgo(d, hour);
      const end = new Date(start.getTime() + 3600_000);
      const span = { startDate: localIso(start), endDate: localIso(end), recordingMethod: 'automatic' as const };
      const steps = 800 + d * 50 + hour * 10;
      samples.push({ type: 'steps', ...span, value: steps, device: phone, clientId: id(`steps-phone-${d}-${hour}`) });
      samples.push({ type: 'steps', ...span, value: steps + 120, device: watch, clientId: id(`steps-watch-${d}-${hour}`) });
      samples.push({ type: 'distance', ...span, value: steps * 0.75, unit: 'm', device: phone, clientId: id(`distance-${d}-${hour}`) });
      samples.push({ type: 'activeEnergy', ...span, value: steps * 0.04, unit: 'kcal', device: watch, clientId: id(`energy-${d}-${hour}`) });
      samples.push({ type: 'heartRate', startDate: localIso(start), value: 62 + (hour % 7) + d, device: watch, clientId: id(`hr-${d}-${hour}`), recordingMethod: 'automatic' });
    }
    const morning = localIso(daysAgo(d, 7));
    samples.push({ type: 'weight', startDate: morning, value: 70 + (d % 3) * 0.2, unit: 'kg', clientId: id(`weight-${d}`), recordingMethod: 'manual' });
    samples.push({ type: 'bodyFat', startDate: morning, value: 22 + (d % 2) * 0.5, clientId: id(`fat-${d}`), recordingMethod: 'manual' });
    samples.push({ type: 'bloodGlucose', startDate: morning, value: 90 + d, unit: 'mg/dL', relationToMeal: 'beforeMeal', clientId: id(`glucose-${d}`), recordingMethod: 'manual' });
  }
  samples.push({ type: 'height', startDate: localIso(daysAgo(7, 7)), value: 1.7, unit: 'm', clientId: id('height'), recordingMethod: 'manual' });
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
