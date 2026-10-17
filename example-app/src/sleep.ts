import { Capacitor } from '@capacitor/core';
import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { SleepSessionSample, SleepStage } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

export const SLEEP_CLIENT_ID = 'example-sleep';

/** `hh:mm` on the night two days ago: hours from 18 on are the evening, earlier ones the next morning. */
function at(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - (h >= 18 ? 2 : 1));
  d.setHours(h, m, 0, 0);
  return localIso(d);
}

const stage = (value: string, start: string, end: string): SleepStage => ({
  stage: value,
  startDate: at(start),
  endDate: at(end),
});

/**
 * A night with stages written as one session reads back as one (iOS adds inBed at the uncovered edges),
 * aggregates to its time asleep, shows up in getChanges, and re-writing it shorter replaces its stages.
 */
export async function runSleepCheck(keep = true): Promise<string[]> {
  const lines: string[] = [];
  const log = (ok: boolean, step: string) => lines.push(`${ok ? 'PASS' : 'FAIL'} sleepSession: ${step}`);
  const ios = Capacitor.getPlatform() === 'ios';
  const clientId = SLEEP_CLIENT_ID;
  // Noon before the night to noon after it.
  const noonBefore = new Date(Date.parse(at('23:00')));
  noonBefore.setHours(12, 0, 0, 0);
  const range = { startDate: localIso(noonBefore), endDate: at('12:00') };
  const own = async () =>
    (await CapacitorHealth.readSamples({ type: 'sleepSession', ...range })).samples.filter(
      (s) => s.clientId === clientId,
    ) as SleepSessionSample[];
  const describe = (s?: SleepSessionSample) => s?.stages.map((x) => x.stage).join(',') ?? '-';
  try {
    await CapacitorHealth.deleteSamples({ type: 'sleepSession', clientIds: [clientId] });
    const { nextCursor } = await CapacitorHealth.getChanges({ types: ['sleepSession'] });
    const stages = [
      stage('light', '23:15', '01:00'),
      stage('deep', '01:00', '02:00'),
      stage('rem', '02:00', '02:30'),
      stage('awake', '02:30', '02:40'),
      stage('light', '02:40', '05:00'),
      stage('rem', '05:00', '06:00'),
      stage('light', '06:00', '06:45'),
    ];
    const { ids } = await CapacitorHealth.saveSamples({
      samples: [
        {
          type: 'sleepSession',
          startDate: at('23:00'),
          endDate: at('07:00'),
          stages,
          clientId,
          recordingMethod: 'manual',
          ...(ios ? {} : { title: 'Example night' }),
        },
      ],
    });
    let sessions = await own();
    const session = sessions[0];
    log(sessions.length === 1 && session.id === ids[0], `write → one session (${sessions.length}), id ${session?.id === ids[0] ? 'matches' : 'differs'}`);
    const expected = ios ? ['inBed', ...stages.map((s) => s.stage), 'inBed'] : stages.map((s) => s.stage);
    log(describe(session) === expected.join(','), `stages ${describe(session)}`);
    log(
      Date.parse(session?.startDate ?? '') === Date.parse(at('23:00')) && Date.parse(session?.endDate ?? '') === Date.parse(at('07:00')),
      `bounds ${session?.startDate} → ${session?.endDate}`,
    );

    const { buckets } = await CapacitorHealth.aggregate({ type: 'sleepSession', ...range, metrics: ['duration'] });
    const asleep = buckets[0]?.values.duration ?? 0;
    // 23:15–06:45 minus 10 minutes awake; other apps' sleep that night can only add to it.
    log(asleep >= 7 * 3600 + 20 * 60, `aggregate duration ${asleep} s (${(asleep / 3600).toFixed(2)} h) in ${buckets[0]?.unit}`);

    await CapacitorHealth.saveSamples({
      samples: [
        {
          type: 'sleepSession',
          startDate: at('23:00'),
          endDate: at('07:00'),
          stages: [stage('asleep', '23:30', '06:30')],
          clientId,
          clientVersion: 2,
        },
      ],
    });
    sessions = await own();
    const shorter = sessions[0];
    log(
      sessions.length === 1 && describe(shorter) === (ios ? 'inBed,asleep,inBed' : 'asleep') && shorter.clientVersion === 2,
      `re-written → ${describe(shorter)}, version ${shorter?.clientVersion}, ${shorter?.stageSampleIds?.length ?? '-'} samples`,
    );

    const changes = await CapacitorHealth.getChanges({ types: ['sleepSession'], cursor: nextCursor });
    const changed = changes.upserted.filter((s) => s.clientId === clientId);
    const removed = changes.deleted.filter((d) => d.clientId === clientId);
    log(
      changed.length >= 1 && describe(changed[changed.length - 1] as SleepSessionSample) === describe(shorter) && (!ios || removed.length > 0),
      `getChanges → ${changed.length} upserted (last ${describe(changed[changed.length - 1] as SleepSessionSample)}), ${removed.length} deleted`,
    );

    // Back to the staged night (version 3): a re-write can add stages too, and it's what stays for Apple Health.
    await CapacitorHealth.saveSamples({
      samples: [{ type: 'sleepSession', startDate: at('23:00'), endDate: at('07:00'), stages, clientId, clientVersion: 3 }],
    });
    sessions = await own();
    log(sessions.length === 1 && describe(sessions[0]) === expected.join(','), `re-written with stages → ${describe(sessions[0])}`);

    // Everything from the last 36 hours, any app: compare with Apple Health / Health Connect by eye.
    const recent = await CapacitorHealth.readSamples({
      type: 'sleepSession',
      startDate: localIso(new Date(Date.now() - 36 * 3600 * 1000)),
      endDate: localIso(new Date()),
    });
    for (const s of recent.samples as SleepSessionSample[]) {
      const stages = s.stages.map((x) => `${x.stage} ${x.startDate.slice(11, 16)}–${x.endDate.slice(11, 16)}`).join(', ');
      lines.push(`INFO sleepSession: ${s.source.id} ${s.startDate} → ${s.endDate}: ${stages}`);
    }

    if (!keep) {
      const { deleted } = await CapacitorHealth.deleteSamples({ type: 'sleepSession', clientIds: [clientId] });
      sessions = await own();
      log(deleted === 1 && sessions.length === 0, `delete by clientId (deleted ${deleted})`);
    }
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    log(false, `threw ${code}: ${message}`);
  }
  return lines;
}
