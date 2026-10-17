import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { HealthType, NewSample, Sample, TypeSupport } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let supported: TypeSupport[] = [];
let readCursor: string | undefined;
let changesCursor: string | undefined;

function selectedType(): TypeSupport | undefined {
  return supported.find((t) => t.type === $<HTMLSelectElement>('explore-type').value);
}

function range(): { startDate: string; endDate: string } {
  const days = Number($<HTMLInputElement>('explore-days').value) || 60;
  const start = new Date(Date.now() - days * 86_400_000);
  const end = new Date(Date.now() + 86_400_000);
  return { startDate: localIso(start), endDate: localIso(end) };
}

/** A short line per sample, so a page of results stays readable on a phone. */
export function describe(sample: Sample): string {
  const s = sample as Sample & Record<string, unknown>;
  const value =
    s.kind === 'quantity'
      ? `${s.value} ${s.unit}`
      : s.type === 'menstruationPeriod'
        ? `${s.firstDay}..${s.lastDay}${s.derived ? ' (derived)' : ''}`
        : (s.value ?? (s.protectionUsed !== undefined ? `protection ${s.protectionUsed}` : 'event'));
  const extras = ['isCycleStart', 'sensation', 'measurementLocation']
    .filter((k) => s[k] !== undefined)
    .map((k) => `${k}=${String(s[k])}`);
  return `${sample.startDate.slice(0, 16)} ${value}${extras.length ? ` [${extras.join(', ')}]` : ''} · ${sample.source.id}${sample.clientId ? ` · ${sample.clientId}` : ''}`;
}

/** Fills the type and value pickers from `getSupportedTypes()`. */
export async function loadTypes(): Promise<string> {
  supported = (await CapacitorHealth.getSupportedTypes()).types.filter((t) => t.supported);
  const select = $<HTMLSelectElement>('explore-type');
  select.innerHTML = supported
    .map((t) => `<option value="${t.type}">${t.type}${t.writable ? '' : ' (read-only)'}</option>`)
    .join('');
  select.value = supported.some((t) => t.type === 'menstrualFlow') ? 'menstrualFlow' : (supported[0]?.type ?? '');
  updateValues();
  return `${supported.length} types available here`;
}

export function updateValues(): void {
  const type = selectedType();
  const values = $<HTMLSelectElement>('explore-value');
  const number = $<HTMLInputElement>('explore-number');
  values.hidden = !type?.values;
  number.hidden = !type?.units;
  values.innerHTML = (type?.values ?? []).map((v) => `<option>${v}</option>`).join('');
  if (type?.units) number.placeholder = `value in ${type.units[0]}`;
  readCursor = undefined;
}

export async function read(next = false): Promise<string[]> {
  const type = selectedType();
  if (!type) return ['Load the types first.'];
  if (!next) readCursor = undefined;
  const { samples, nextCursor } = await CapacitorHealth.readSamples({
    type: type.type,
    ...range(),
    limit: 20,
    ascending: false,
    ...(next && readCursor ? { cursor: readCursor } : {}),
  });
  readCursor = nextCursor;
  return [`${samples.length} samples${nextCursor ? ' (more: "Next page")' : ''}`, ...samples.map(describe)];
}

/** Writes one sample of the selected type now (a 3-day period for `menstruationPeriod`). */
export async function write(): Promise<string> {
  const type = selectedType();
  if (!type) return 'Load the types first.';
  const now = new Date();
  now.setSeconds(0, 0);
  const startDate = localIso(now);
  const clientId = `example-manual-${type.type}-${now.getTime()}`;
  const base = { startDate, clientId, recordingMethod: 'manual' as const };
  let sample: NewSample;
  if (type.type === 'menstruationPeriod') {
    const end = new Date(now.getTime() + 2 * 86_400_000);
    sample = { ...base, type: 'menstruationPeriod', endDate: localIso(end) };
  } else if (type.type === 'skinTemperature') {
    const end = new Date(now.getTime() + 3600_000);
    sample = { ...base, type: 'skinTemperature', endDate: localIso(end), baseline: 33.5, deltas: [{ time: startDate, delta: 0.1 }] };
  } else if (type.units) {
    sample = { ...base, type: type.type as NewSample['type'], value: Number($<HTMLInputElement>('explore-number').value) || 36.5 } as NewSample;
  } else if (type.values) {
    sample = { ...base, type: type.type as NewSample['type'], value: $<HTMLSelectElement>('explore-value').value } as NewSample;
  } else {
    sample = { ...base, type: type.type } as NewSample;
  }
  const { ids } = await CapacitorHealth.saveSamples({ samples: [sample] });
  return `Saved ${type.type} (id ${ids[0]}, clientId ${clientId})`;
}

/** Deletes this app's samples of the selected type in the range. */
export async function deleteRange(): Promise<string> {
  const type = selectedType();
  if (!type) return 'Load the types first.';
  const { deleted } = await CapacitorHealth.deleteSamples({ type: type.type, ...range() });
  return `Deleted ${deleted} of this app's ${type.type} samples in the range`;
}

export async function deleteByClientId(): Promise<string> {
  const type = selectedType();
  const clientId = $<HTMLInputElement>('explore-client-id').value.trim();
  if (!type || !clientId) return 'Pick a type and enter a clientId.';
  const { deleted } = await CapacitorHealth.deleteSamples({ type: type.type, clientIds: [clientId] });
  return `Deleted ${deleted}`;
}

/** Starts following the selected type, or reports what changed since the last call. */
export async function changes(start: boolean): Promise<string[]> {
  const type = selectedType();
  if (!type) return ['Load the types first.'];
  const types: HealthType[] = [type.type];
  if (start || !changesCursor) {
    changesCursor = (await CapacitorHealth.getChanges({ types })).nextCursor;
    return [`Following ${type.type}. Write or delete something, then "Get changes".`];
  }
  const result = await CapacitorHealth.getChanges({ types, cursor: changesCursor });
  changesCursor = result.nextCursor;
  return [
    `${result.upserted.length} upserted, ${result.deleted.length} deleted${result.hasMore ? ', more waiting' : ''}`,
    ...result.upserted.map((s) => `+ ${describe(s)}`),
    ...result.deleted.map((d) => `- ${d.type} ${d.id}${d.clientId ? ` (${d.clientId})` : ''}`),
  ];
}
