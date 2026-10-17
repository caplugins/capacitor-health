import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { NewSample } from './definitions';
import { REGISTRY, VALUE_SETS } from './generated/registry';
import type { HealthType } from './generated/registry';
import { parseDate, validateSaveSamples } from './validate';

/** The shared menstruation fixtures (decision #24): XCTest runs the derivation, this checks their shape. */
interface Fixture {
  description: string;
  defaultTimeZone: string;
  query: { startDate: string; endDate: string };
  samples: {
    id: string;
    type: HealthType;
    startDate: string;
    endDate: string;
    value?: string;
    isCycleStart?: boolean;
    source: string;
    timeZone?: string;
  }[];
  expected: { firstDay: string; lastDay: string; flowSampleIds: string[]; source: string }[];
}

const dir = join(__dirname, '..', 'fixtures', 'menstruation');
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture] as const);

describe('fixtures/menstruation', () => {
  it('has the cases 06-testing lists', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)('%s is well formed', (_name, fixture) => {
    expect(fixture.description.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: fixture.defaultTimeZone })).not.toThrow();
    parseDate(fixture.query.startDate, 'query.startDate');
    parseDate(fixture.query.endDate, 'query.endDate');
    const ids = new Set<string>();
    for (const sample of fixture.samples) {
      expect(ids.has(sample.id), `duplicate id ${sample.id}`).toBe(false);
      ids.add(sample.id);
      expect(REGISTRY[sample.type], sample.type).toBeDefined();
      expect(parseDate(sample.endDate, 'endDate').ms).toBeGreaterThanOrEqual(
        parseDate(sample.startDate, 'startDate').ms,
      );
      if (sample.type === 'menstrualFlow') expect(VALUE_SETS.bleeding.ios).toContain(sample.value);
    }
    for (const period of fixture.expected) {
      expect(period.firstDay <= period.lastDay).toBe(true);
      for (const id of period.flowSampleIds) {
        expect(fixture.samples.find((s) => s.id === id)?.type, id).toBe('menstrualFlow');
      }
    }
  });
});

/** The sleep fixtures (decision #64): XCTest runs the derivation, this checks their shape. */
interface SleepFixture {
  description: string;
  query: { startDate: string; endDate: string };
  samples: {
    id: string;
    value: string;
    startDate: string;
    endDate: string;
    source: string;
    clientId?: string;
    clientVersion?: number;
  }[];
  expected: {
    id: string;
    startDate: string;
    endDate: string;
    source: string;
    clientId?: string;
    clientVersion?: number;
    stageSampleIds: string[];
    stages: { stage: string; startDate: string; endDate: string }[];
  }[];
}

const sleepDir = join(__dirname, '..', 'fixtures', 'sleep');
const sleepFixtures = readdirSync(sleepDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(sleepDir, f), 'utf8')) as SleepFixture] as const);

describe('fixtures/sleep', () => {
  it('has the cases 06-testing lists', () => {
    expect(sleepFixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sleepFixtures)('%s is well formed', (_name, fixture) => {
    expect(fixture.description.length).toBeGreaterThan(0);
    parseDate(fixture.query.startDate, 'query.startDate');
    parseDate(fixture.query.endDate, 'query.endDate');
    const samples = new Map(fixture.samples.map((s) => [s.id, s]));
    expect(samples.size, 'duplicate sample ids').toBe(fixture.samples.length);
    for (const sample of fixture.samples) {
      // Values HealthKit can hold: what the plugin reads sleepAnalysis raw values as.
      expect(VALUE_SETS.sleepStage.ios).toContain(sample.value);
      expect(parseDate(sample.endDate, 'endDate').ms).toBeGreaterThanOrEqual(
        parseDate(sample.startDate, 'startDate').ms,
      );
    }
    for (const session of fixture.expected) {
      expect(samples.get(session.id), session.id).toBeDefined();
      for (const id of session.stageSampleIds) {
        expect(samples.get(id)?.source, id).toBe(session.source);
      }
      // A derived session must be one Health Connect would accept: the same rules writes are checked with.
      const written = validateSaveSamples(
        { samples: [{ type: 'sleepSession', ...session, clientId: undefined, clientVersion: undefined } as NewSample] },
        'android',
      ).samples[0] as unknown as { stages: unknown[] };
      expect(written.stages).toHaveLength(session.stages.length);
    }
  });
});
