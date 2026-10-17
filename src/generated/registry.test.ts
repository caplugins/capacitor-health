import { describe, expect, it } from 'vitest';

import types from '../../registry/types.json';

import { HEALTH_TYPES, REGISTRY, VALUE_SETS } from './registry';

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
});
