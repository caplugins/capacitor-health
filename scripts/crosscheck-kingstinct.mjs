#!/usr/bin/env node
// Dev-time cross-check against @kingstinct/react-native-healthkit's healthkit-schema.json
// (decision #27: used for comparison only, never vendored). Prints every disagreement; it does not
// decide who is right. Our catalog comes from the SDK headers, and runtime findings (T06) beat both.
//
//   npm pack @kingstinct/react-native-healthkit && tar xzf kingstinct-*.tgz
//   node scripts/crosscheck-kingstinct.mjs <unpacked package dir>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { healthKitEnums, healthKitIdentifiers } from './lib/catalogs.mjs';
import { loadCheckedRegistry } from './lib/registry.mjs';

function findSchema(dir) {
  for (const candidate of [dir, join(dir, 'package')]) {
    const path = join(candidate, 'src/generated/healthkit-schema.json');
    if (existsSync(path)) return path;
  }
  throw new Error(`No src/generated/healthkit-schema.json under ${dir}`);
}

export function crosscheck(schema, registry = loadCheckedRegistry()) {
  const issues = { catalog: [], registry: [] };
  const theirs = new Map([...schema.quantityIdentifiers, ...schema.categoryIdentifiers].map((x) => [x.name, x]));

  // 1. Our SDK-header catalog: first iOS version, unit and aggregation (quantity) or value enum (category).
  const ours = healthKitIdentifiers().filter((x) => x.section === 'Quantity types' || x.section === 'Category types');
  for (const x of ours) {
    const k = theirs.get(x.identifier);
    if (!k) {
      issues.catalog.push(`${x.identifier}: missing from kingstinct`);
      continue;
    }
    if (k.ios !== x.ios) issues.catalog.push(`${x.identifier}: iOS ${x.ios} here, ${k.ios} in kingstinct`);
    if (x.deprecated) continue;
    if (x.section === 'Quantity types') {
      const [unit, aggregation] = x.notes.split(/,\s*/);
      if ((unit || null) !== (k.canonicalUnit || null)) issues.catalog.push(`${x.identifier}: unit ${unit} here, ${k.canonicalUnit} in kingstinct`);
      if (aggregation !== k.aggregationStyle) {
        issues.catalog.push(`${x.identifier}: aggregation "${aggregation}" here, "${k.aggregationStyle}" in kingstinct`);
      }
    } else if (x.notes !== k.valueEnum) {
      issues.catalog.push(`${x.identifier}: value enum ${x.notes} here, ${k.valueEnum} in kingstinct`);
    }
  }
  for (const name of theirs.keys()) {
    if (!ours.some((x) => x.identifier === name)) issues.catalog.push(`${name}: in kingstinct, missing from our catalog`);
  }

  // Our catalog's enum table, for the raw-value check below.
  const catalogEnums = healthKitEnums();

  // 2. The registry: writable flags, value raw values, metadata keys.
  for (const t of registry.types) {
    if (!t.ios || t.ios.derivedFrom) continue;
    const k = theirs.get(t.ios.identifier);
    if (k && k.writeable !== t.ios.writable) {
      issues.registry.push(`${t.id}: writable ${t.ios.writable} here, writeable ${k.writeable} in kingstinct`);
    }
  }
  const theirEnums = new Map(schema.enums.map((e) => [`HK${e.name}`, e]));
  for (const [name, set] of Object.entries(registry.valueSets)) {
    if (!set.ios) continue;
    const k = theirEnums.get(set.ios.enum);
    const catalog = catalogEnums[set.ios.enum];
    if (!k) issues.registry.push(`valueSets.${name}: enum ${set.ios.enum} missing from kingstinct`);
    for (const value of set.values) {
      const raw = set.ios.map[value];
      if (raw === null) continue;
      const swiftCase = set.ios.cases?.[value] ?? value;
      const member = k?.members.find((m) => m.name === swiftCase);
      if (k && !member) issues.registry.push(`valueSets.${name}.${value}: no case ${swiftCase} in kingstinct's ${k.name}`);
      else if (member && member.rawValue !== raw) {
        issues.registry.push(`valueSets.${name}.${value}: raw ${raw} here, ${member.rawValue} in kingstinct`);
      }
      const catalogCase = swiftCase[0].toUpperCase() + swiftCase.slice(1);
      if (catalog && catalog[catalogCase] !== undefined && catalog[catalogCase] !== raw) {
        issues.registry.push(`valueSets.${name}.${value}: raw ${raw} here, ${catalog[catalogCase]} in our catalog`);
      }
    }
  }
  const theirKeys = new Map(schema.metadataKeys.map((m) => [m.keyConstant, m]));
  for (const t of registry.types) {
    for (const [field, f] of Object.entries(t.fields ?? {})) {
      if (!f.ios) continue;
      const k = theirKeys.get(f.ios.metadata);
      if (!k) issues.registry.push(`${t.id}.${field}: ${f.ios.metadata} missing from kingstinct`);
      else if (k.rawKey !== f.ios.key) issues.registry.push(`${t.id}.${field}: key "${f.ios.key}" here, "${k.rawKey}" in kingstinct`);
    }
  }
  // Runtime-pinned keys (T06) that kingstinct also lists, as a sanity check of its rawKey column.
  const pinned = { HKMetadataKeySyncIdentifier: 'HKMetadataKeySyncIdentifier', HKMetadataKeySyncVersion: 'HKMetadataKeySyncVersion' };
  for (const [symbol, raw] of Object.entries(pinned)) {
    const k = theirKeys.get(symbol);
    if (k && k.rawKey !== raw) issues.registry.push(`${symbol}: runtime value "${raw}" (T06), "${k.rawKey}" in kingstinct`);
  }
  return issues;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/crosscheck-kingstinct.mjs <unpacked @kingstinct/react-native-healthkit dir>');
    process.exit(2);
  }
  try {
    const schemaPath = findSchema(dir);
    const issues = crosscheck(JSON.parse(readFileSync(schemaPath, 'utf8')));
    console.log(`Compared with ${schemaPath}\n`);
    console.log(`Catalog (registry/catalogs/healthkit-types.md): ${issues.catalog.length} difference(s)`);
    for (const line of issues.catalog) console.log(`  ${line}`);
    console.log(`\nRegistry (registry/types.json): ${issues.registry.length} difference(s)`);
    for (const line of issues.registry) console.log(`  ${line}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
