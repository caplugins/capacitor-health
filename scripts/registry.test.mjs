import { existsSync, readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { coverage } from './coverage.mjs';
import { OUTPUTS, renderAll } from './gen-registry.mjs';
import { healthConnectRecords, healthKitEnums, healthKitIdentifiers } from './lib/catalogs.mjs';
import { SCHEMA_PATH, loadRegistry, schemaErrors, semanticErrors, swiftMemberName } from './lib/registry.mjs';

const registry = loadRegistry();
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

function entryValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  ajv.addSchema(schema);
  return ajv.getSchema(`${schema.$id}#/$defs/type`);
}

describe('registry/types.json', () => {
  const validateEntry = entryValidator();

  it.each(registry.types.map((t) => [t.id, t]))('%s validates against the schema', (_id, entry) => {
    expect(validateEntry(entry), JSON.stringify(validateEntry.errors)).toBe(true);
  });

  it('validates as a whole and is internally consistent', () => {
    expect(schemaErrors(registry)).toEqual([]);
    expect(semanticErrors(registry)).toEqual([]);
  });

  it('covers every M1 type from the roadmap', () => {
    const ids = registry.types.map((t) => t.id);
    for (const id of [
      'menstrualFlow',
      'menstruationPeriod',
      'intermenstrualBleeding',
      'ovulationTest',
      'cervicalMucus',
      'sexualActivity',
      'basalBodyTemperature',
      'pregnancyTest',
      'progesteroneTest',
      'contraceptive',
      'pregnancy',
      'lactation',
      'wristTemperature',
      'skinTemperature',
      'menopausalState',
      'bleedingDuringPregnancy',
      'bleedingAfterPregnancy',
      'bleedingAfterMenopause',
      'infrequentMenstrualCycles',
      'irregularMenstrualCycles',
      'persistentIntermenstrualBleeding',
      'prolongedMenstrualPeriods',
    ]) {
      expect(ids).toContain(id);
    }
    expect(registry.types.filter((t) => t.group === 'symptoms')).toHaveLength(22);
  });

  it('gates newer identifiers by the catalog version', () => {
    const catalog = new Map(healthKitIdentifiers().map((x) => [x.identifier, x.ios]));
    for (const t of registry.types.filter((x) => x.ios)) {
      expect(t.ios.minOS, t.id).toBe(catalog.get(t.ios.identifier));
    }
  });

  it('uses the raw values in the SDK-header enum table', () => {
    const enums = healthKitEnums();
    for (const [name, set] of Object.entries(registry.valueSets)) {
      const catalog = enums[set.ios?.enum];
      if (!catalog) continue; // e.g. HKBodyTemperatureSensorLocation lives outside HKCategoryValues.h
      for (const [value, raw] of Object.entries(set.ios.map)) {
        if (raw === null) continue;
        const swiftCase = set.ios.cases?.[value] ?? value;
        expect(catalog[swiftCase[0].toUpperCase() + swiftCase.slice(1)], `${name}.${value}`).toBe(raw);
      }
    }
  });
});

describe('schema and semantic checks reject mistakes', () => {
  const validateEntry = entryValidator();
  const flow = registry.types.find((t) => t.id === 'menstrualFlow');

  it.each([
    ['an unknown kind', (t) => (t.kind = 'number')],
    ['a category without a value set', (t) => delete t.values],
    ['no platform at all', (t) => (delete t.ios, delete t.android)],
    ['a malformed permission', (t) => (t.android.readPermission = 'READ_MENSTRUATION')],
    ['an unknown property', (t) => (t.colour = 'red')],
    ['a lowercase identifier prefix', (t) => (t.ios.identifier = 'hkCategoryTypeIdentifierMenstrualFlow')],
  ])('schema rejects %s', (_label, mutate) => {
    const entry = clone(flow);
    mutate(entry);
    expect(validateEntry(entry)).toBe(false);
  });

  it.each([
    ['a value set map missing a value', (r) => delete r.valueSets.bleeding.ios.map.heavy, /missing heavy/],
    ['an unknown value set', (r) => (r.types[0].values = 'nope'), /unknown value set nope/],
    ['mismatched permissions', (r) => (r.types[0].android.writePermission = 'android.permission.health.WRITE_STEPS'), /different data types/],
    ['a duplicate id', (r) => r.types.push(clone(r.types[0])), /defined twice/],
    ['a quantity type on a category identifier', (r) => (r.types.find((t) => t.id === 'basalBodyTemperature').ios.identifier = 'HKCategoryTypeIdentifierLactation'), /needs an HKQuantityTypeIdentifier/],
  ])('semantic check catches %s', (_label, mutate, message) => {
    const broken = clone(registry);
    mutate(broken);
    expect(semanticErrors(broken).join('\n')).toMatch(message);
  });
});

describe('generated files', () => {
  it('are up to date (npm run registry:gen)', async () => {
    const files = await renderAll();
    for (const [path, content] of Object.entries(files)) {
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, 'utf8'), path).toBe(content);
    }
  });

  it('cover every output', () => {
    expect(Object.keys(OUTPUTS).sort()).toEqual(['kotlin', 'readme', 'swift', 'swiftTest', 'ts']);
  });
});

describe('swiftMemberName', () => {
  it.each([
    ['MenstrualFlow', 'menstrualFlow'],
    ['VO2Max', 'vo2Max'],
    ['UVExposure', 'uvExposure'],
    ['HeartRateVariabilitySDNN', 'heartRateVariabilitySDNN'],
  ])('%s → %s', (suffix, member) => expect(swiftMemberName(suffix)).toBe(member));
});

describe('reference catalogs', () => {
  it('parse the expected sizes', () => {
    // 121 quantity + 72 category + 6 characteristic + 2 correlation + 1 document + 2 scored + 7 special.
    expect(healthKitIdentifiers()).toHaveLength(211);
    // §E table (42) + 3 framework-only records from §C2.
    expect(healthConnectRecords()).toHaveLength(45);
  });

  it('know every registry identifier and record', () => {
    const report = coverage();
    expect(report.healthKit.unknown).toEqual([]);
    expect(report.healthConnect.unknown).toEqual([]);
    expect(report.healthKit.covered).toBeGreaterThan(0);
    expect(report.healthConnect.covered).toBeGreaterThan(0);
  });
});
