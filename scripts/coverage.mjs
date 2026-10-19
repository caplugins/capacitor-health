#!/usr/bin/env node
// Lists the HealthKit identifiers and Health Connect records that the registry doesn't cover yet,
// from the reference catalogs in registry/catalogs/. Milestone planning reads this.
//
//   node scripts/coverage.mjs          human-readable report
//   node scripts/coverage.mjs --json   machine-readable
import { healthConnectRecords, healthKitIdentifiers } from './lib/catalogs.mjs';
import { loadCheckedRegistry } from './lib/registry.mjs';

// A correlation's member quantity types are covered by the type that registers the correlation.
const CORRELATION_MEMBERS = {
  HKCorrelationTypeIdentifierBloodPressure: [
    'HKQuantityTypeIdentifierBloodPressureSystolic',
    'HKQuantityTypeIdentifierBloodPressureDiastolic',
  ],
};

export function coverage(registry = loadCheckedRegistry()) {
  const iosCovered = new Set(
    registry.types
      .filter((t) => t.ios?.identifier)
      .flatMap((t) => [t.ios.identifier, ...(CORRELATION_MEMBERS[t.ios.identifier] ?? [])]),
  );
  const androidCovered = new Set(registry.types.filter((t) => t.android).map((t) => t.android.record));
  const hk = healthKitIdentifiers();
  const hc = healthConnectRecords();
  return {
    types: registry.types.length,
    healthKit: {
      total: hk.length,
      covered: hk.filter((x) => iosCovered.has(x.identifier)).length,
      uncovered: hk.filter((x) => !iosCovered.has(x.identifier) && !x.deprecated),
      deprecated: hk.filter((x) => !iosCovered.has(x.identifier) && x.deprecated),
      unknown: [...iosCovered].filter((id) => !hk.some((x) => x.identifier === id)),
    },
    healthConnect: {
      total: hc.length,
      covered: hc.filter((x) => androidCovered.has(x.record)).length,
      uncovered: hc.filter((x) => !androidCovered.has(x.record)),
      unknown: [...androidCovered].filter((r) => !hc.some((x) => x.record === r)),
    },
  };
}

function print(report) {
  const { healthKit: hk, healthConnect: hc } = report;
  console.log(`Registry: ${report.types} types.\n`);

  console.log(`HealthKit: ${hk.covered} of ${hk.total} catalog identifiers covered; ${hk.uncovered.length} to go.`);
  let section = '';
  for (const x of hk.uncovered) {
    if (x.section !== section) {
      section = x.section;
      console.log(`\n  ${section}`);
    }
    console.log(`    ${x.identifier.padEnd(62)} iOS ${x.ios.padEnd(5)} ${x.group}`);
  }
  if (hk.deprecated.length) console.log(`\n  Deprecated, not planned: ${hk.deprecated.map((x) => x.identifier).join(', ')}`);

  console.log(`\nHealth Connect: ${hc.covered} of ${hc.total} catalog records covered; ${hc.uncovered.length} to go.\n`);
  for (const x of hc.uncovered) {
    const note = x.frameworkOnly ? `framework only: ${x.gate}` : [x.kind, x.gate].filter(Boolean).join('; ');
    console.log(`    ${x.record.padEnd(36)} ${note}`);
  }

  const unknown = [...hk.unknown, ...hc.unknown];
  if (unknown.length) {
    console.log(`\nIn the registry but not in the catalogs (catalog out of date, or a typo): ${unknown.join(', ')}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = coverage();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else print(report);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
