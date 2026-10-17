import { CapacitorHealth, HEALTH_TYPES } from '@caplugins/capacitor-health';
import type { HealthType } from '@caplugins/capacitor-health';

import { runAcceptance } from './acceptance';
import { changes, deleteByClientId, deleteRange, loadTypes, read, updateValues, write } from './explore';
import { runChangesCheck, runPeriodCheck, runRoundTrips } from './roundtrip';
import { deleteTestData, seedTestData } from './seed';

/** The example asks for every type the plugin knows; unsupported ones come back `unsupported`. */
const TYPES: HealthType[] = [...HEALTH_TYPES];

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

bind('load-types', 'explore-types', loadTypes);
document.getElementById('explore-type')?.addEventListener('change', updateValues);
bind('explore-read', 'explore-output', () => read(false));
bind('explore-next', 'explore-output', () => read(true));
bind('explore-write', 'explore-output', write);
bind('explore-delete-range', 'explore-output', deleteRange);
bind('explore-delete-client', 'explore-output', deleteByClientId);
bind('explore-follow', 'explore-output', () => changes(true));
bind('explore-changes', 'explore-output', () => changes(false));
bind('seed', 'seed-output', seedTestData);
bind('seed-delete', 'seed-output', deleteTestData);

bind('round-trip', 'samples', async () => {
  const lines = await runRoundTrips();
  lines.forEach((line) => console.log(`[example] ${line}`));
  return lines;
});

bind('changes-check', 'changes', async () => {
  const lines = await runChangesCheck();
  lines.forEach((line) => console.log(`[example] ${line}`));
  return lines;
});

bind('period-check', 'periods', async () => {
  const lines = await runPeriodCheck(true);
  lines.forEach((line) => console.log(`[example] ${line}`));
  return lines;
});

bind('period-delete', 'periods', () =>
  CapacitorHealth.deleteSamples({ type: 'menstruationPeriod', clientIds: ['example-period'] }),
);

bind('acceptance', 'acceptance-output', async () => {
  const rows = await runAcceptance('granted');
  rows.forEach((row) => console.log(`[acceptance] ${JSON.stringify(row)}`));
  return rows.map((row) => `${row.status.toUpperCase()} ${row.type} ${Object.values(row.steps).join(' | ')}`);
});
bind('acceptance-denied', 'acceptance-output', async () => {
  const rows = await runAcceptance('denied');
  rows.forEach((row) => console.log(`[acceptance-denied] ${JSON.stringify(row)}`));
  return rows.map((row) => `${row.status.toUpperCase()} ${row.type} ${Object.values(row.steps).join(' | ')}`);
});

// For scripted runs (DevTools / Web Inspector): `await window.example.runChangesCheck()`.
(window as unknown as { example: unknown }).example = {
  CapacitorHealth,
  runRoundTrips,
  runChangesCheck,
  runPeriodCheck,
  runAcceptance,
  seedTestData,
  deleteTestData,
  loadTypes,
};

document.getElementById('check-availability')?.click();
