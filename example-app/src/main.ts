import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { HealthType } from '@caplugins/capacitor-health';

/** The reproductive types the example asks access for. */
const TYPES: HealthType[] = [
  'menstrualFlow',
  'menstruationPeriod',
  'intermenstrualBleeding',
  'cervicalMucus',
  'ovulationTest',
  'sexualActivity',
  'basalBodyTemperature',
  'wristTemperature',
  'skinTemperature',
  'pregnancyTest',
  'menopausalState',
];

/** Runs `action` and prints its result (or error) into `<pre id={outputId}>`. */
function bind(buttonId: string, outputId: string, action: () => Promise<unknown>): void {
  const output = document.getElementById(outputId) as HTMLPreElement;
  document.getElementById(buttonId)?.addEventListener('click', async () => {
    output.textContent = '…';
    try {
      const result = await action();
      output.textContent = JSON.stringify(result, null, 2);
      output.dataset.status = 'ok';
      console.log(`[example] ${buttonId} ${JSON.stringify(result)}`);
    } catch (error) {
      const { code, message, data } = error as { code?: string; message?: string; data?: unknown };
      output.textContent = `Error ${code}: ${message}\n${JSON.stringify(data ?? {}, null, 2)}`;
      output.dataset.status = 'error';
      console.log(`[example] ${buttonId} error ${code} ${message}`);
    }
  });
}

/** Read-only types can't be asked for write access. */
async function writableTypes(): Promise<HealthType[]> {
  const { types } = await CapacitorHealth.getSupportedTypes();
  return TYPES.filter((type) => types.find((t) => t.type === type)?.writable);
}

bind('check-availability', 'availability', () => CapacitorHealth.isAvailable());
bind('supported-types', 'supported', async () => {
  const { types, android } = await CapacitorHealth.getSupportedTypes();
  return {
    android,
    types: types.map((t) => `${t.type}: ${t.supported ? (t.writable ? 'read/write' : 'read') : `no (${t.reason})`}`),
  };
});
bind('request-authorization', 'authorization', async () =>
  CapacitorHealth.requestAuthorization({ read: TYPES, write: await writableTypes(), android: { history: true } }),
);
bind('check-authorization', 'authorization', async () =>
  CapacitorHealth.checkAuthorization({ read: TYPES, write: await writableTypes() }),
);
bind('open-settings', 'settings', () => CapacitorHealth.openHealthSettings().then(() => 'opened'));
bind('open-install', 'settings', () => CapacitorHealth.openHealthConnectInstall().then(() => 'opened'));

document.getElementById('check-availability')?.click();
