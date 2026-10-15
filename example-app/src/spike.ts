// M0 spike (decision #25): calls the temporary spike* bridge methods. Removed in T10.
import { CapacitorHealth } from '@caplugins/capacitor-health';

type Result = Record<string, unknown>;
type SpikeMethods = Record<string, (options?: Result) => Promise<Result>>;

// The Capacitor proxy forwards any method name to native, so the spike stays out of the public API.
const spike = CapacitorHealth as unknown as SpikeMethods;
const CURSOR_KEY = 'spikeCursor';
let lastIds: string[] = [];

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
  write5: () => write({ startDay: '2026-10-01', days: 5, value: 3, syncPrefix: 'spike-p1', version: 1 }),
  rewrite5: () => write({ startDay: '2026-10-01', days: 5, value: 3, syncPrefix: 'spike-p1', version: 1 }),
  bump: () =>
    write({ startDay: '2026-10-03', days: 1, value: 4, syncPrefix: 'spike-p1', version: 2, firstDayIsCycleStart: false }),
  read: () => spike.spikeRead(),
  changes: async () => {
    const cursor = localStorage.getItem(CURSOR_KEY) ?? undefined;
    const result = await spike.spikeChanges(cursor ? { cursor } : {});
    if (typeof result.nextCursor === 'string') localStorage.setItem(CURSOR_KEY, result.nextCursor);
    return { usedCursor: Boolean(cursor), ...result };
  },
  write6: () =>
    write({ startDay: '2026-10-06', days: 1, value: 2, syncPrefix: 'spike-p1', version: 1, firstDayIsCycleStart: false }),
  deleteLast: () => spike.spikeDelete({ ids: lastIds }),
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
