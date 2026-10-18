import { Capacitor } from '@capacitor/core';
import { CapacitorHealth } from '@caplugins/capacitor-health';
import type { NewWorkout, WorkoutSample } from '@caplugins/capacitor-health';

import { localIso } from './roundtrip';

export const WORKOUT_CLIENT_ID = 'example-workout';
const SWIM_CLIENT_ID = 'example-workout-swim';

/** `hh:mm` yesterday. */
function at(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return localIso(d);
}

const span = (start: string, end: string) => ({ startDate: at(start), endDate: at(end) });

/**
 * A run written with totals, a pause and laps reads back with them; re-writing it as another activity with
 * fewer totals replaces it and drops the stale total; getChanges reports it; a pool swim keeps its lap length;
 * deleting a workout deletes the totals written with it.
 */
export async function runWorkoutCheck(keep = true): Promise<string[]> {
  const lines: string[] = [];
  const log = (ok: boolean, step: string) => lines.push(`${ok ? 'PASS' : 'FAIL'} workout: ${step}`);
  const android = Capacitor.getPlatform() === 'android';
  const range = { startDate: at('00:00'), endDate: at('23:59') };
  const own = async (clientId: string) =>
    (await CapacitorHealth.readSamples({ type: 'workout', ...range })).samples.filter(
      (s) => s.clientId === clientId,
    ) as WorkoutSample[];
  const ownTotals = async (type: 'activeEnergy' | 'distance', clientId: string) =>
    (await CapacitorHealth.readSamples({ type, ...range })).samples.filter(
      (s) => s.clientId === `${clientId}:${type === 'activeEnergy' ? 'energy' : 'distance'}`,
    );
  const describe = (w?: WorkoutSample) =>
    w
      ? `${w.activityType} ${w.startDate.slice(11, 16)}–${w.endDate.slice(11, 16)}, totals ${JSON.stringify(w.totals)}, ` +
        `segments ${w.segments.map((s) => s.segmentType ?? '-').join(',') || 'none'}, laps ${w.laps.map((l) => l.length ?? '-').join(',') || 'none'}`
      : '-';
  const run: NewWorkout = {
    type: 'workout',
    activityType: 'running',
    ...span('07:00', '08:00'),
    totals: { energy: 420, distance: 8000 },
    segments: [{ ...span('07:20', '07:25'), segmentType: 'pause' }],
    laps: [
      { ...span('07:00', '07:30'), length: 4000 },
      { ...span('07:30', '08:00'), length: 4000 },
    ],
    clientId: WORKOUT_CLIENT_ID,
    recordingMethod: 'manual',
    ...(android ? { title: 'Example run' } : {}),
  };
  try {
    await CapacitorHealth.deleteSamples({ type: 'workout', clientIds: [WORKOUT_CLIENT_ID, SWIM_CLIENT_ID] });
    const { nextCursor } = await CapacitorHealth.getChanges({ types: ['workout'] });

    const { ids } = await CapacitorHealth.saveSamples({ samples: [run] });
    let workouts = await own(WORKOUT_CLIENT_ID);
    let workout = workouts[0];
    log(
      workouts.length === 1 && workout.id === ids[0],
      `write → ${workouts.length} workout, id ${workout?.id === ids[0] ? 'matches' : 'differs'}`,
    );
    log(
      workout?.activityType === 'running' &&
        Math.abs((workout.totals.energy ?? 0) - 420) < 0.01 &&
        Math.abs((workout.totals.distance ?? 0) - 8000) < 0.01 &&
        workout.segments.length === 1 &&
        workout.segments[0].segmentType === 'pause' &&
        workout.laps.map((l) => l.length).join(',') === '4000,4000' &&
        workout.hasRoute === false,
      describe(workout),
    );
    log(
      Date.parse(workout?.startDate ?? '') === Date.parse(at('07:00')) &&
        Date.parse(workout?.endDate ?? '') === Date.parse(at('08:00')),
      `bounds ${workout?.startDate} → ${workout?.endDate}`,
    );

    // Same clientId, a new version: another activity and no distance, so the old distance total goes.
    await CapacitorHealth.saveSamples({
      samples: [
        {
          type: 'workout',
          activityType: 'cyclingStationary',
          ...span('07:00', '07:45'),
          totals: { energy: 300 },
          clientId: WORKOUT_CLIENT_ID,
          clientVersion: 2,
        },
      ],
    });
    workouts = await own(WORKOUT_CLIENT_ID);
    workout = workouts[0];
    const distances = await ownTotals('distance', WORKOUT_CLIENT_ID);
    const energies = await ownTotals('activeEnergy', WORKOUT_CLIENT_ID);
    log(
      workouts.length === 1 &&
        workout.activityType === 'cyclingStationary' &&
        workout.clientVersion === 2 &&
        Math.abs((workout.totals.energy ?? 0) - 300) < 0.01 &&
        workout.totals.distance === undefined &&
        distances.length === 0 &&
        energies.length === 1,
      `re-written → ${describe(workout)}; own totals: ${energies.length} energy, ${distances.length} distance`,
    );

    const changes = await CapacitorHealth.getChanges({ types: ['workout'], cursor: nextCursor });
    const changed = changes.upserted.filter((s) => s.clientId === WORKOUT_CLIENT_ID) as WorkoutSample[];
    const removed = changes.deleted.filter((d) => d.clientId === WORKOUT_CLIENT_ID);
    log(
      changed.length >= 1 && changed[changed.length - 1].activityType === 'cyclingStationary',
      `getChanges → ${changed.length} upserted (last ${changed[changed.length - 1]?.activityType}), ${removed.length} deleted`,
    );

    // A pool swim: its laps share the pool's length, which iOS keeps on the workout.
    await CapacitorHealth.saveSamples({
      samples: [
        {
          type: 'workout',
          activityType: 'swimmingPool',
          ...span('18:00', '18:30'),
          totals: { energy: 250, distance: 1000 },
          laps: [
            { ...span('18:00', '18:01'), length: 25 },
            { ...span('18:01', '18:02'), length: 25 },
          ],
          clientId: SWIM_CLIENT_ID,
        },
      ],
    });
    const swim = (await own(SWIM_CLIENT_ID))[0];
    log(
      swim?.activityType === 'swimmingPool' &&
        swim.laps.map((l) => l.length).join(',') === '25,25' &&
        Math.abs((swim.totals.distance ?? 0) - 1000) < 0.01,
      `pool swim → ${describe(swim)}`,
    );
    const { deleted } = await CapacitorHealth.deleteSamples({ type: 'workout', clientIds: [SWIM_CLIENT_ID] });
    const swimLeft = [
      ...(await own(SWIM_CLIENT_ID)),
      ...(await ownTotals('activeEnergy', SWIM_CLIENT_ID)),
      ...(await ownTotals('distance', SWIM_CLIENT_ID)),
    ];
    log(
      deleted === 1 && swimLeft.length === 0,
      `delete by clientId (deleted ${deleted}, ${swimLeft.length} left with its totals)`,
    );

    // Back to the run (version 3), which stays for Apple Health / Health Connect.
    await CapacitorHealth.saveSamples({ samples: [{ ...run, clientVersion: 3 }] });
    workout = (await own(WORKOUT_CLIENT_ID))[0];
    log(
      workout?.activityType === 'running' && workout.clientVersion === 3,
      `re-written as the run → ${describe(workout)}`,
    );

    // Every workout of the last 3 days, any app: compare with Apple Health / Health Connect by eye.
    const recent = await CapacitorHealth.readSamples({
      type: 'workout',
      startDate: localIso(new Date(Date.now() - 3 * 86_400_000)),
      endDate: localIso(new Date()),
    });
    for (const w of recent.samples as WorkoutSample[])
      lines.push(`INFO workout: ${w.source.id} ${w.startDate}: ${describe(w)}`);

    if (!keep) {
      const result = await CapacitorHealth.deleteSamples({ type: 'workout', clientIds: [WORKOUT_CLIENT_ID] });
      log(
        result.deleted === 1 && (await own(WORKOUT_CLIENT_ID)).length === 0,
        `delete the run (deleted ${result.deleted})`,
      );
    }
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    log(false, `threw ${code}: ${message}`);
  }
  return lines;
}
