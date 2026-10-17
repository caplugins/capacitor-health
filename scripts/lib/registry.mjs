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
  return JSON.parse(readFileSync(path, 'utf8'));
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
  const ids = new Set();

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
    for (const value of Object.keys(set.ios?.cases ?? {})) {
      if (!set.values.includes(value)) errors.push(`valueSets.${name}.ios.cases has unknown value ${value}`);
    }
  }

  for (const type of registry.types) {
    const at = `types.${type.id}`;
    if (ids.has(type.id)) errors.push(`${at} is defined twice`);
    ids.add(type.id);

    if (type.values) {
      const set = sets[type.values];
      if (!set) errors.push(`${at}.values references unknown value set ${type.values}`);
      else {
        if (type.ios && !type.ios.derivedFrom && !set.ios) errors.push(`${at}: value set ${type.values} has no ios block`);
        if (type.android && !set.android) errors.push(`${at}: value set ${type.values} has no android block`);
      }
    }
    if (type.unit && type.units && !type.units.includes(type.unit)) errors.push(`${at}.unit is not in units`);

    if (type.ios) {
      const { identifier, aggregation, derivedFrom } = type.ios;
      const isQuantity = identifier.startsWith('HKQuantityTypeIdentifier');
      if (type.kind === 'quantity' && !isQuantity) errors.push(`${at}: quantity kind needs an HKQuantityTypeIdentifier`);
      if ((type.kind === 'category' || type.kind === 'event') && isQuantity) {
        errors.push(`${at}: ${type.kind} kind needs an HKCategoryTypeIdentifier`);
      }
      if (isQuantity && !aggregation && !derivedFrom) errors.push(`${at}.ios.aggregation is required for quantity types`);
      if (!isQuantity && aggregation) errors.push(`${at}.ios.aggregation only applies to quantity types`);
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
      if ((type.kind === 'category' || type.kind === 'quantity') && !valueProperty) {
        errors.push(`${at}.android.valueProperty is required for ${type.kind} types`);
      }
      if (type.kind === 'event' && valueProperty) errors.push(`${at}.android.valueProperty makes no sense for event types`);
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
  const [, swiftType, suffix] = identifier.match(/^(HK(?:Category|Quantity)TypeIdentifier)(.+)$/);
  return { swiftType, member: swiftMemberName(suffix) };
}

export function compareOSVersions(a, b) {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

/** The plugin's iOS deployment target; anything newer is gated with #available. */
export const IOS_FLOOR = '15.0';
