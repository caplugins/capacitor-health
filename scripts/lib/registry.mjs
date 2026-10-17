// Loads registry/types.json and checks it: JSON Schema first (registry/schema.json), then the
// cross-references the schema can't express. Used by gen-registry.mjs, coverage.mjs,
// crosscheck-kingstinct.mjs and the Vitest suite.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA_PATH = join(ROOT, 'registry', 'schema.json');
export const TYPES_PATH = join(ROOT, 'registry', 'types.json');

export function loadRegistry(path = TYPES_PATH) {
  return expandNutrients(JSON.parse(readFileSync(path, 'utf8')));
}

/** Units a single-nutrient type accepts, by its canonical unit's dimension. */
const NUTRIENT_UNITS = { mass: ['g', 'mg', 'mcg', 'oz'], energy: ['kcal', 'kJ'] };

/** "protein" → "dietaryProtein": the single-nutrient type id (decision #61). */
export const nutrientTypeId = (nutrient) => `dietary${nutrient[0].toUpperCase()}${nutrient.slice(1)}`;

/**
 * Appends one quantity type per nutrient (decision #61), so the nutrient table stays the single source
 * for them: a HealthKit dietary quantity on iOS, aggregate-only through `NutritionRecord` on Android.
 * Everything downstream (schema, checks, generators, coverage) sees them as ordinary types.
 */
export function expandNutrients(registry) {
  if (!registry.nutrients) return registry;
  const types = Object.entries(registry.nutrients).map(([id, n]) => {
    const dimension = registry.units[n.unit]?.dimension;
    const type = {
      id: nutrientTypeId(id),
      kind: 'quantity',
      group: 'nutrition',
      unit: n.unit,
      units: NUTRIENT_UNITS[dimension] ?? [n.unit],
    };
    if (n.ios) type.ios = { identifier: n.ios.identifier, minOS: n.ios.minOS, writable: true, aggregation: 'cumulative' };
    if (n.android) {
      type.android = {
        record: 'NutritionRecord',
        time: 'interval',
        readPermission: 'android.permission.health.READ_NUTRITION',
        writePermission: 'android.permission.health.WRITE_NUTRITION',
        writable: false,
        aggregates: { sum: n.android.aggregate },
        aggregateOnly: true,
      };
    }
    type.notes = `Single nutrient ${id} (decision #61)`;
    return type;
  });
  return { ...registry, types: [...registry.types, ...types] };
}

let compiled;
function schemaValidator() {
  if (!compiled) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
    compiled = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  }
  return compiled;
}

/** JSON Schema errors as readable strings (empty when valid). */
export function schemaErrors(registry) {
  const validate = schemaValidator();
  if (validate(registry)) return [];
  return validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`);
}

/** Cross-reference errors (empty when consistent). Assumes the schema already passed. */
export function semanticErrors(registry) {
  const errors = [];
  const sets = registry.valueSets;
  const units = registry.units ?? {};
  const ids = new Set();
  const byId = new Map(registry.types.map((t) => [t.id, t]));

  for (const [name, set] of Object.entries(sets)) {
    for (const platform of ['ios', 'android']) {
      if (!set[platform]) continue;
      const keys = Object.keys(set[platform].map);
      const missing = set.values.filter((v) => !keys.includes(v));
      const extra = keys.filter((k) => !set.values.includes(k));
      if (missing.length) errors.push(`valueSets.${name}.${platform}.map is missing ${missing.join(', ')}`);
      if (extra.length) errors.push(`valueSets.${name}.${platform}.map has unknown values ${extra.join(', ')}`);
      if (Object.values(set[platform].map).every((v) => v === null)) {
        errors.push(`valueSets.${name}.${platform}.map maps nothing; drop the block instead`);
      }
    }
    for (const value of Object.keys(set.ios?.valueMinOS ?? {})) {
      if (!set.values.includes(value)) errors.push(`valueSets.${name}.ios.valueMinOS has unknown value ${value}`);
    }
    for (const value of Object.keys(set.ios?.cases ?? {})) {
      if (!set.values.includes(value)) errors.push(`valueSets.${name}.ios.cases has unknown value ${value}`);
    }
  }

  const properties = new Set();
  for (const [id, nutrient] of Object.entries(registry.nutrients ?? {})) {
    const at = `nutrients.${id}`;
    const unit = units[nutrient.unit];
    if (!unit) errors.push(`${at} uses unknown unit ${nutrient.unit}`);
    else {
      if (!['mass', 'energy'].includes(unit.dimension)) errors.push(`${at}.unit must be a mass or energy unit`);
      if (nutrient.ios && !unit.ios) errors.push(`${at}: unit ${nutrient.unit} has no HealthKit unit`);
      if (nutrient.android && !unit.android) errors.push(`${at}: unit ${nutrient.unit} has no Health Connect unit`);
    }
    if (nutrient.android) {
      if (properties.has(nutrient.android.property)) errors.push(`${at}.android.property is used twice`);
      properties.add(nutrient.android.property);
    }
  }

  const iosActivities = new Set();
  const hcActivities = new Set();
  for (const [id, activity] of Object.entries(registry.workoutActivities ?? {})) {
    const at = `workoutActivities.${id}`;
    if (activity.ios) {
      const key = `${activity.ios.raw}/${activity.ios.indoor ?? ''}/${activity.ios.swimmingLocation ?? ''}`;
      if (iosActivities.has(key)) errors.push(`${at}.ios matches the same workouts as another activity`);
      iosActivities.add(key);
    }
    if (activity.android) {
      if (hcActivities.has(activity.android.constant)) errors.push(`${at}.android.constant is used twice`);
      hcActivities.add(activity.android.constant);
    }
  }
  if (registry.workoutActivities && !(registry.workoutActivities.other?.ios && registry.workoutActivities.other?.android)) {
    errors.push('workoutActivities.other must exist on both platforms (unmapped native values read as it)');
  }

  for (const type of registry.types) {
    const at = `types.${type.id}`;
    if (ids.has(type.id)) errors.push(`${at} is defined twice`);
    ids.add(type.id);

    if (type.parts && type.kind !== 'special') errors.push(`${at}.parts only apply to special types`);
    for (const [name, part] of Object.entries(type.parts ?? {})) {
      if (!part.values) continue;
      const set = sets[part.values];
      if (!set) errors.push(`${at}.parts.${name}.values references unknown value set ${part.values}`);
      else if (!(type.ios && set.ios) && !(type.android && set.android)) {
        errors.push(`${at}.parts.${name}: value set ${part.values} maps to none of the type's platforms`);
      }
    }

    if (type.values) {
      const set = sets[type.values];
      if (!set) errors.push(`${at}.values references unknown value set ${type.values}`);
      else {
        if (type.ios && !type.ios.derivedFrom && !set.ios) errors.push(`${at}: value set ${type.values} has no ios block`);
        if (type.android && !set.android) errors.push(`${at}: value set ${type.values} has no android block`);
      }
    }
    if (type.unit && type.units && !type.units.includes(type.unit)) errors.push(`${at}.unit is not in units`);
    const typeUnits = [...new Set([type.unit, ...(type.units ?? [])].filter(Boolean))];
    for (const unit of typeUnits) {
      if (!units[unit]) errors.push(`${at} uses unknown unit ${unit}`);
    }
    const dimensions = new Set(typeUnits.map((u) => units[u]?.dimension).filter(Boolean));
    if (dimensions.size > 1) errors.push(`${at}.units mix dimensions ${[...dimensions].join(', ')}`);
    for (const unit of typeUnits.filter((u) => units[u])) {
      if (type.ios && !units[unit].ios) errors.push(`${at}: unit ${unit} has no HealthKit unit`);
      if (type.android && !type.android.aggregateOnly && !units[unit].android) {
        errors.push(`${at}: unit ${unit} has no Health Connect unit`);
      }
    }

    if (type.ios) {
      const { identifier, aggregation, derivedFrom, members, writeTo, aggregateOnly } = type.ios;
      const isQuantity = Boolean(identifier?.startsWith('HKQuantityTypeIdentifier'));
      if (members) {
        for (const member of members) {
          const target = byId.get(member);
          if (!target?.ios) errors.push(`${at}.ios.members: ${member} has no ios mapping`);
          else if (target.ios.members) errors.push(`${at}.ios.members: ${member} is itself combined`);
          else if (target.kind !== type.kind) errors.push(`${at}.ios.members: ${member} is a ${target.kind}, not a ${type.kind}`);
        }
        if (writeTo && !members.includes(writeTo)) errors.push(`${at}.ios.writeTo is not a member`);
        if (type.ios.writable && !writeTo) errors.push(`${at}: a writable combined id needs ios.writeTo`);
      } else {
        if (type.kind === 'quantity' && !isQuantity) errors.push(`${at}: quantity kind needs an HKQuantityTypeIdentifier`);
        if (isQuantity && !aggregation && !derivedFrom) errors.push(`${at}.ios.aggregation is required for quantity types`);
      }
      if (writeTo && !members) errors.push(`${at}.ios.writeTo needs ios.members`);
      if (aggregateOnly && type.ios.writable) errors.push(`${at}: an aggregate-only type can't be writable`);
      if (type.ios.metrics && type.kind !== 'special') errors.push(`${at}.ios.metrics only apply to special types`);
      if (type.ios.range) {
        // Validation checks the range in JavaScript, which can't convert units.
        if (type.kind !== 'quantity' || type.units?.length !== 1) errors.push(`${at}.ios.range needs a quantity type with one unit`);
        if (type.ios.range.min > type.ios.range.max) errors.push(`${at}.ios.range: min is above max`);
      }
      if ((type.kind === 'category' || type.kind === 'event') && isQuantity) {
        errors.push(`${at}: ${type.kind} kind needs an HKCategoryTypeIdentifier`);
      }
      if (identifier && !isQuantity && aggregation) errors.push(`${at}.ios.aggregation only applies to quantity types`);
      if (derivedFrom && !registry.types.some((t) => t.id === derivedFrom)) {
        errors.push(`${at}.ios.derivedFrom references unknown type ${derivedFrom}`);
      }
    }

    if (type.android) {
      const { readPermission, writePermission, valueProperty } = type.android;
      if (readPermission.replace('.READ_', '.') !== writePermission.replace('.WRITE_', '.')) {
        errors.push(`${at}.android read and write permissions name different data types`);
      }
      if (!readPermission.includes('.READ_')) errors.push(`${at}.android.readPermission is not a READ_ permission`);
      if (!writePermission.includes('.WRITE_')) errors.push(`${at}.android.writePermission is not a WRITE_ permission`);
      if ((type.kind === 'category' || type.kind === 'quantity') && !valueProperty && !type.android.aggregateOnly) {
        errors.push(`${at}.android.valueProperty is required for ${type.kind} types`);
      }
      if (type.kind === 'event' && valueProperty) errors.push(`${at}.android.valueProperty makes no sense for event types`);
      const { aggregates, aggregateOnly } = type.android;
      if (aggregates && type.kind === 'event') {
        if (Object.keys(aggregates).some((m) => m !== 'duration')) errors.push(`${at}.android.aggregates: an event only has a duration`);
      } else if (aggregates && type.kind !== 'quantity' && type.kind !== 'special') {
        errors.push(`${at}.android.aggregates only apply to quantity, event (duration) and special types`);
      }
      if (aggregateOnly && !aggregates) errors.push(`${at}: an aggregate-only type needs android.aggregates`);
      if (aggregateOnly && type.android.writable) errors.push(`${at}: an aggregate-only type can't be writable`);
    }

    for (const [name, field] of Object.entries(type.fields ?? {})) {
      const fat = `${at}.fields.${name}`;
      if (field.ios && !type.ios) errors.push(`${fat}.ios is set but the type has no ios mapping`);
      if (field.android && !type.android) errors.push(`${fat}.android is set but the type has no android mapping`);
      if (!field.ios && !field.android) errors.push(`${fat} maps to neither platform`);
      if (field.type === 'enum') {
        const set = sets[field.values];
        if (!set) errors.push(`${fat}.values references unknown value set ${field.values}`);
        else {
          if (field.ios && !set.ios) errors.push(`${fat}: value set ${field.values} has no ios block`);
          if (field.android?.property && !set.android) errors.push(`${fat}: value set ${field.values} has no android block`);
        }
        for (const key of ['constants', 'true', 'false', 'absent']) {
          if (field.android?.[key]) errors.push(`${fat}.android.${key} belongs on the value set for enum fields`);
        }
      }
      if (field.type === 'boolean' && field.android?.property) {
        for (const key of ['constants', 'true', 'false']) {
          if (!field.android[key]) errors.push(`${fat}.android.${key} is required for a stored boolean`);
        }
      }
    }
  }
  return errors;
}

/** Loads and fully checks the registry; throws with every problem listed. */
export function loadCheckedRegistry(path = TYPES_PATH) {
  const registry = loadRegistry(path);
  const errors = schemaErrors(registry);
  if (!errors.length) errors.push(...semanticErrors(registry));
  if (errors.length) throw new Error(`registry/types.json is invalid:\n  ${errors.join('\n  ')}`);
  return registry;
}

/** Swift member name for an ObjC-imported identifier suffix: "MenstrualFlow" → "menstrualFlow", "VO2Max" → "vo2Max". */
export function swiftMemberName(suffix) {
  const run = suffix.match(/^[A-Z]+/)[0];
  if (run.length === 1 || run.length === suffix.length) return suffix.slice(0, run.length).toLowerCase() + suffix.slice(run.length);
  const next = suffix[run.length];
  const keep = /[a-z]/.test(next) ? run.length - 1 : run.length;
  return suffix.slice(0, keep).toLowerCase() + suffix.slice(keep);
}

/** "HKCategoryTypeIdentifierMenstrualFlow" → { swiftType: "HKCategoryTypeIdentifier", member: "menstrualFlow" }. */
export function swiftIdentifier(identifier) {
  const [, swiftType, suffix] = identifier.match(/^(HK(?:Category|Quantity|Correlation)TypeIdentifier)(.+)$/);
  return { swiftType, member: swiftMemberName(suffix) };
}

export function compareOSVersions(a, b) {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

/** The plugin's iOS deployment target; anything newer is gated with #available. */
export const IOS_FLOOR = '15.0';
