import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REGISTRY, VALUE_SETS } from './generated/registry';
import type { HealthType } from './generated/registry';
import { parseDate } from './validate';

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
