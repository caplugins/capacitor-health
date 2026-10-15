// M0 spike (decision #25): calls the temporary spike* bridge methods. Removed in T10.
import { CapacitorHealth } from '@caplugins/capacitor-health';
import { Capacitor } from '@capacitor/core';

type Result = Record<string, unknown>;
type SpikeMethods = Record<string, (options?: Result) => Promise<Result>>;

// The Capacitor proxy forwards any method name to native, so the spike stays out of the public API.
const spike = CapacitorHealth as unknown as SpikeMethods;
const CURSOR_KEY = 'spikeCursor';
let lastIds: string[] = [];
const android = Capacitor.getPlatform() === 'android';
// Flow values: iOS HKCategoryValueVaginalBleeding medium = 3 / heavy = 4; Health Connect FLOW_MEDIUM = 2 / FLOW_HEAVY = 3.
const MEDIUM = android ? 2 : 3;
const HEAVY = android ? 3 : 4;
const LIGHT = android ? 1 : 2;

function show(label: string, result: unknown): void {
  const text = JSON.stringify(result, null, 2);
  (document.getElementById('spike-output') as HTMLPreElement).textContent = `${label}\n${text}`;
  // The iOS console PTY truncates lines at ~4 KB, so log in numbered chunks.
  const json = JSON.stringify(result);
  const chunks = Math.max(1, Math.ceil(json.length / 3000));
  for (let i = 0; i < chunks; i++) {
    console.log(`SPIKE ${label} ${i + 1}/${chunks} ${json.slice(i * 3000, (i + 1) * 3000)}`);
  }
}

async function write(options: Result): Promise<Result> {
  const result = await spike.spikeWrite(options);
  lastIds = (result.ids as string[]) ?? [];
  return result;
}

const actions: Record<string, () => Promise<unknown>> = {
  auth: () => spike.spikeRequestAuth(),
  write5: () => write({ startDay: '2026-10-01', days: 5, value: MEDIUM, syncPrefix: 'spike-p1', version: 1 }),
  rewrite5: () => write({ startDay: '2026-10-01', days: 5, value: MEDIUM, syncPrefix: 'spike-p1', version: 1 }),
  bump: () =>
    write({
      startDay: '2026-10-03',
      days: 1,
      value: HEAVY,
      syncPrefix: 'spike-p1',
      version: 2,
      firstDayIsCycleStart: false,
      withPeriod: false,
    }),
  read: () => spike.spikeRead(),
  changes: async () => {
    const cursor = localStorage.getItem(CURSOR_KEY) ?? undefined;
    const result = await spike.spikeChanges(cursor ? { cursor } : {});
    if (typeof result.nextCursor === 'string') localStorage.setItem(CURSOR_KEY, result.nextCursor);
    return { usedCursor: Boolean(cursor), ...result };
  },
  write6: () =>
    write({
      startDay: '2026-10-06',
      days: 1,
      value: LIGHT,
      syncPrefix: 'spike-p1',
      version: 1,
      firstDayIsCycleStart: false,
      withPeriod: false,
    }),
  deleteLast: () => spike.spikeDelete({ ids: lastIds }),
  // Android only.
  granted: () => spike.spikeGranted(),
  lowerVersion: () =>
    write({ startDay: '2026-10-03', days: 1, value: LIGHT, syncPrefix: 'spike-p1', version: 1, withPeriod: false }),
  sameVersion: () =>
    write({ startDay: '2026-10-03', days: 1, value: HEAVY, syncPrefix: 'spike-p1', version: 2, withPeriod: false }),
  deleteByClientId: () => spike.spikeDelete({ type: 'flow', clientIds: ['spike-p1:flow:2026-10-02'] }),
  undeclared: () =>
    spike.spikeRequestAuth({ permissions: ['android.permission.health.READ_OVULATION_TEST'] }),
  undeclaredSkip: () =>
    spike.spikeRequestAuth({ permissions: ['android.permission.health.READ_OVULATION_TEST'], skipCheck: true }),
  periodLimit: () => spike.spikePeriodLimit(),
  revokeAll: () => spike.spikeRevokeAll(),
  periodEndOfDay: () =>
    write({ startDay: '2026-09-01', days: 5, syncPrefix: 'spike-eod', withFlows: false, periodEnd: 'endOfDay' }),
  periodLastNoon: () =>
    write({ startDay: '2026-09-10', days: 5, syncPrefix: 'spike-noon', withFlows: false, periodEnd: 'lastNoon' }),
  raw: () => spike.spikeRawValues(),
  resetCursor: async () => {
    localStorage.removeItem(CURSOR_KEY);
    return { cursor: null };
  },
};

document.querySelectorAll<HTMLButtonElement>('[data-spike]').forEach((button) => {
  button.addEventListener('click', async () => {
    const name = button.dataset.spike as string;
    try {
      show(name, await actions[name]());
    } catch (error) {
      show(`${name} ERROR`, error);
    }
  });
});
