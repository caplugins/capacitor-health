import { Capacitor } from '@capacitor/core';
import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { NewNutrition, NutrientAmounts, NutritionSample } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

export const NUTRITION_CLIENT_ID = 'example-meal';

/** `hh:mm` yesterday. */
function at(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return localIso(d);
}

const same = (a: NutrientAmounts, b: NutrientAmounts) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof NutrientAmounts>;
  return [...keys].every((k) => a[k] !== undefined && b[k] !== undefined && Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-9);
};

/**
 * A breakfast written with six nutrients reads back as one entry with them; re-writing it with fewer nutrients
 * replaces it (and on iOS its dropped nutrient's sample); deleting it deletes its nutrients; it's written again
 * for Apple Health / Health Connect.
 */
export async function runNutritionCheck(): Promise<string[]> {
  const lines: string[] = [];
  const log = (ok: boolean, step: string) => lines.push(`${ok ? 'PASS' : 'FAIL'} nutrition: ${step}`);
  const ios = Capacitor.getPlatform() === 'ios';
  const range = { startDate: at('00:00'), endDate: at('23:59') };
  const own = async () =>
    (await CapacitorHealth.readSamples({ type: 'nutrition', ...range })).samples.filter(
      (s) => s.clientId === NUTRITION_CLIENT_ID,
    ) as NutritionSample[];
  /** iOS: this entry's members read as single-nutrient samples, by their sync ids. */
  const members = async (type: 'dietarySugar' | 'dietaryEnergy') =>
    ios
      ? (await CapacitorHealth.readSamples({ type, ...range })).samples.filter((s) =>
          s.clientId?.startsWith(`${NUTRITION_CLIENT_ID}#`),
        )
      : [];
  const breakfast: NewNutrition = {
    type: 'nutrition',
    startDate: at('08:00'),
    endDate: at('08:20'),
    name: 'Porridge with berries',
    nutrients: { energy: 350, protein: 12.5, carbohydrates: 54, totalFat: 7, sugar: 14, vitaminC: 0.012 },
    clientId: NUTRITION_CLIENT_ID,
    recordingMethod: 'manual',
    ...(ios ? {} : { mealType: 'breakfast' }),
  };
  try {
    await CapacitorHealth.deleteSamples({ type: 'nutrition', clientIds: [NUTRITION_CLIENT_ID] });
    const { ids } = await CapacitorHealth.saveSamples({ samples: [breakfast] });
    let entries = await own();
    let entry = entries[0];
    log(
      entries.length === 1 && entry.id === ids[0],
      `write → ${entries.length} entry, id ${entry?.id === ids[0] ? 'matches' : 'differs'}`,
    );
    log(
      entry?.name === breakfast.name &&
        same(entry.nutrients, breakfast.nutrients) &&
        (ios ? entry.memberSampleIds?.length === 6 : entry.mealType === 'breakfast'),
      `read → ${entry?.name}, ${JSON.stringify(entry?.nutrients)}${ios ? `, ${entry?.memberSampleIds?.length} members` : `, ${entry?.mealType}`}`,
    );

    const smaller: NewNutrition = { ...breakfast, nutrients: { energy: 300, protein: 12.5 }, clientVersion: 2 };
    await CapacitorHealth.saveSamples({ samples: [smaller] });
    entries = await own();
    entry = entries[0];
    const sugar = await members('dietarySugar');
    const energy = await members('dietaryEnergy');
    log(
      entries.length === 1 &&
        entry.clientVersion === 2 &&
        same(entry.nutrients, smaller.nutrients) &&
        sugar.length === 0 &&
        (!ios || (energy.length === 1 && Math.abs(((energy[0] as { value?: number }).value ?? 0) - 300) < 1e-9)),
      `re-written → ${JSON.stringify(entry?.nutrients)}${ios ? `; own sugar samples ${sugar.length}, energy ${energy.length}` : ''}`,
    );

    const { deleted } = await CapacitorHealth.deleteSamples({ type: 'nutrition', clientIds: [NUTRITION_CLIENT_ID] });
    const left = [...(await own()), ...(await members('dietaryEnergy'))];
    log(
      deleted === 1 && left.length === 0,
      `delete by clientId (deleted ${deleted}, ${left.length} left with its nutrients)`,
    );

    // Written again (version 3) for Apple Health / Health Connect.
    await CapacitorHealth.saveSamples({ samples: [{ ...breakfast, clientVersion: 3 }] });
    entry = (await own())[0];
    log(same(entry?.nutrients ?? {}, breakfast.nutrients), `re-written for the health app → ${entry?.name}`);

    const recent = await CapacitorHealth.readSamples({
      type: 'nutrition',
      startDate: localIso(new Date(Date.now() - 3 * 86_400_000)),
      endDate: localIso(new Date()),
    });
    for (const n of recent.samples as NutritionSample[])
      lines.push(`INFO nutrition: ${n.source.id} ${n.startDate} ${n.name ?? '-'} ${JSON.stringify(n.nutrients)}`);
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    log(false, `threw ${code}: ${message}`);
  }
  return lines;
}
