import { existsSync, readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { coverage } from './coverage.mjs';
import { OUTPUTS, renderAll } from './gen-registry.mjs';
import { healthConnectRecords, healthKitEnums, healthKitIdentifiers, workoutCatalog } from './lib/catalogs.mjs';
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
    for (const t of registry.types.filter((x) => x.ios?.identifier)) {
      expect(t.ios.minOS, t.id).toBe(catalog.get(t.ios.identifier));
    }
  });

  it('maps every HealthKit dietary type but water to a nutrient, at its catalog version', () => {
    const catalog = healthKitIdentifiers().filter((x) => x.identifier.startsWith('HKQuantityTypeIdentifierDietary'));
    const nutrients = Object.values(registry.nutrients).filter((n) => n.ios);
    expect(nutrients.map((n) => n.ios.identifier).sort()).toEqual(
      catalog.map((x) => x.identifier).filter((id) => id !== 'HKQuantityTypeIdentifierDietaryWater').sort(),
    );
    for (const n of nutrients) expect(n.ios.minOS).toBe(catalog.find((x) => x.identifier === n.ios.identifier).ios);
    // NutritionRecord's 42 properties (connect-client 1.1.0); the Kotlin compiler checks each name.
    expect(Object.values(registry.nutrients).filter((n) => n.android)).toHaveLength(42);
  });

  it('maps every workout activity type on both platforms, at its catalog raw value and version', () => {
    const catalog = workoutCatalog();
    const activities = Object.values(registry.workoutActivities);
    const iosCases = new Set(activities.filter((a) => a.ios).map((a) => a.ios.case));
    for (const c of catalog.healthKit) {
      const swiftCase = swiftMemberName(c.name);
      // Deprecated cases (old data) and API_UNAVAILABLE ones read as `other` with the raw value.
      if (c.note) expect(iosCases.has(swiftCase), c.name).toBe(false);
      else expect(iosCases.has(swiftCase), c.name).toBe(true);
    }
    for (const a of activities.filter((x) => x.ios)) {
      const c = catalog.healthKit.find((x) => swiftMemberName(x.name) === a.ios.case);
      expect([a.ios.raw, a.ios.minOS], a.ios.case).toEqual([c.raw, c.ios]);
    }
    expect(activities.filter((a) => a.android).map((a) => a.android.constant).sort()).toEqual(
      catalog.exerciseTypes.map((c) => c.name).sort(),
    );
  });

  it('maps every exercise segment type, UNKNOWN as absent', () => {
    const set = registry.valueSets.workoutSegmentType;
    expect([...Object.values(set.android.map), set.android.absent].sort()).toEqual(
      workoutCatalog().segmentTypes.map((c) => c.name).sort(),
    );
    // Only a pause has a HealthKit equivalent (a pause event); other segments are untyped segment events.
    expect(Object.entries(set.ios.map).filter(([, raw]) => raw !== null)).toEqual([['pause', 1]]);
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
    ['an unknown group', (t) => (t.group = 'misc')],
    ['an ios mapping with neither identifier nor members', (t) => delete t.ios.identifier],
    ['an unknown aggregate metric', (t) => (t.android.aggregates = { median: 'X_MEDIAN' })],
    ['a part with an unknown property', (t) => (t.parts = { stages: { order: 1 } })],
  ])('schema rejects %s', (_label, mutate) => {
    const entry = clone(flow);
    mutate(entry);
    expect(validateEntry(entry)).toBe(false);
  });

  it.each([
    ['a nutrient on neither platform', (r) => (r.nutrients.protein = { unit: 'g' })],
    ['a nutrient with a non-dietary identifier', (r) => (r.nutrients.protein.ios.identifier = 'HKQuantityTypeIdentifierStepCount')],
    ['a nutrient without a unit', (r) => delete r.nutrients.protein.unit],
    ['an activity both indoor and in a pool', (r) => (r.workoutActivities.swimmingPool.ios.indoor = true)],
    ['an activity on neither platform', (r) => (r.workoutActivities.yoga = { notes: 'x' })],
  ])('schema rejects %s', (_label, mutate) => {
    const broken = clone(registry);
    mutate(broken);
    expect(schemaErrors(broken)).not.toEqual([]);
  });

  it.each([
    ['parts on a category', (r) => (r.types[0].parts = { stages: { values: 'sleepStage' } }), /parts only apply to special/],
    ['a part with an unknown value set', (r) => (r.types.find((t) => t.id === 'bloodPressure').parts = { stages: { values: 'nope' } }), /unknown value set nope/],
    ['a part whose value set maps to neither platform', (r) => (r.types.find((t) => t.id === 'skinTemperature').parts = { x: { values: 'severity' } }), /maps to none of the type's platforms/],
    ['a nutrient in an unknown unit', (r) => (r.nutrients.protein.unit = 'furlong'), /unknown unit furlong/],
    ['a nutrient in a volume unit', (r) => (r.nutrients.protein.unit = 'mL'), /mass or energy unit/],
    ['two nutrients on one property', (r) => (r.nutrients.sugar.android.property = 'protein'), /property is used twice/],
    ['two activities matching the same workouts', (r) => (r.workoutActivities.runningTreadmill.ios.indoor = false), /matches the same workouts/],
    ['two activities on one exercise type', (r) => (r.workoutActivities.walking.android.constant = 'EXERCISE_TYPE_RUNNING'), /constant is used twice/],
    ['no other activity', (r) => delete r.workoutActivities.other.android, /other must exist on both platforms/],
    ['a distance total in a type that is no distance', (r) => (r.workoutActivities.cycling.ios.distance = 'steps'), /steps is not a member of distance/],
    ['a segment rule for an iOS-only activity', (r) => (r.workoutSegments.activities.archery = ['pause']), /archery is not a Health Connect workout activity/],
    ['a segment rule with an unknown segment type', (r) => r.workoutSegments.anyActivity.push('sprint'), /sprint is not a workoutSegmentType value/],
    ['a value set map missing a value', (r) => delete r.valueSets.bleeding.ios.map.heavy, /missing heavy/],
    ['an unknown value set', (r) => (r.types[0].values = 'nope'), /unknown value set nope/],
    ['mismatched permissions', (r) => (r.types[0].android.writePermission = 'android.permission.health.WRITE_STEPS'), /different data types/],
    ['a duplicate id', (r) => r.types.push(clone(r.types[0])), /defined twice/],
    ['a quantity type on a category identifier', (r) => (r.types.find((t) => t.id === 'basalBodyTemperature').ios.identifier = 'HKCategoryTypeIdentifierLactation'), /needs an HKQuantityTypeIdentifier/],
    ['an unknown unit', (r) => (r.types.find((t) => t.id === 'basalBodyTemperature').units.push('furlong')), /unknown unit furlong/],
    ['units of two dimensions', (r) => (r.types.find((t) => t.id === 'basalBodyTemperature').units.push('kg')), /mix dimensions/],
    ['a unit missing on one platform', (r) => delete r.units.degF.android, /degF has no Health Connect unit/],
    ['a combined id with an unknown member', (r) => r.types.push({ id: 'distance', kind: 'quantity', group: 'activity', unit: 'degC', units: ['degC'], ios: { members: ['basalBodyTemperature', 'nope'], minOS: '9.0', writable: false } }), /nope has no ios mapping/],
    ['a writable combined id without writeTo', (r) => r.types.push({ id: 'combined', kind: 'quantity', group: 'activity', unit: 'degC', units: ['degC'], ios: { members: ['basalBodyTemperature', 'wristTemperature'], minOS: '9.0', writable: true } }), /needs ios.writeTo/],
    ['aggregates on a category', (r) => (r.types[0].android.aggregates = { sum: 'X_TOTAL' }), /only apply to quantity/],
    ['a writable aggregate-only type', (r) => Object.assign(r.types.find((t) => t.id === 'basalBodyTemperature').android, { aggregateOnly: true, aggregates: { avg: 'TEMPERATURE_AVG' } }), /aggregate-only type can't be writable/],
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
    expect(Object.keys(OUTPUTS).sort()).toEqual(['kotlin', 'readme', 'swift', 'swiftTest', 'ts', 'typeMapping']);
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
