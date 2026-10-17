import { describe, expect, it } from 'vitest';

import types from '../../registry/types.json';

import { HEALTH_TYPES, NUTRIENTS, NUTRIENT_IDS, REGISTRY, UNITS, VALUE_SETS } from './registry';

describe('generated TypeScript registry', () => {
  it('lists every type in registry order', () => {
    expect([...HEALTH_TYPES]).toEqual(types.types.map((t) => t.id));
    expect(Object.keys(REGISTRY)).toEqual([...HEALTH_TYPES]);
  });

  it('only references value sets that exist', () => {
    for (const entry of Object.values(REGISTRY)) {
      if (entry.values) expect(VALUE_SETS[entry.values], entry.id).toBeDefined();
      for (const field of Object.values(entry.fields ?? {})) {
        if (field.values) expect(VALUE_SETS[field.values], `${entry.id} field`).toBeDefined();
      }
    }
  });

  it('lists nutrients with their platform names', () => {
    expect([...NUTRIENT_IDS]).toEqual(Object.keys(types.nutrients));
    expect(NUTRIENTS.carbohydrates).toEqual({
      unit: 'g',
      ios: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
      android: 'totalCarbohydrate',
    });
    expect(NUTRIENTS.transFat.ios).toBeNull();
    expect(VALUE_SETS.sleepStage.ios).not.toContain('outOfBed');
  });

  it('marks platform-only values', () => {
    expect(VALUE_SETS.bleeding.android).not.toContain('none');
    expect(VALUE_SETS.bleeding.ios).toContain('none');
    expect(VALUE_SETS.cervicalMucusAppearance.ios).not.toContain('unusual');
  });

  it('keeps native permission strings', () => {
    expect(REGISTRY.menstrualFlow.android?.readPermission).toBe('android.permission.health.READ_MENSTRUATION');
    expect(REGISTRY.menstruationPeriod.ios?.derivedFrom).toBe('menstrualFlow');
    expect(REGISTRY.menopausalState.ios?.time).toBe('instant');
  });

  it('only uses units from the unit table, of one dimension per type', () => {
    for (const entry of Object.values(REGISTRY)) {
      const dimensions = new Set((entry.units ?? []).map((u) => UNITS[u]?.dimension));
      expect(dimensions.has(undefined), entry.id).toBe(false);
      expect(dimensions.size, entry.id).toBeLessThanOrEqual(1);
    }
    expect(UNITS['mmol/L']).toEqual({ dimension: 'bloodGlucose', ios: true, android: true });
    expect(UNITS['kcal/d'].ios).toBe(false);
  });

  it('derives aggregate metrics from the HealthKit aggregation style', () => {
    expect(REGISTRY.basalBodyTemperature.ios?.metrics).toEqual(['avg', 'min', 'max']);
    expect(REGISTRY.menstrualFlow.ios?.metrics).toBeUndefined();
  });
});
