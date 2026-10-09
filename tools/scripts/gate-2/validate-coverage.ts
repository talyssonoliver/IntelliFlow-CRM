/**
 * Gate 2 Validation Script: Test Coverage
 *
 * Purpose: Validates that test coverage meets tranche thresholds.
 * - T2 threshold: 80% overall, 95% domain, 90% application
 * - T3 threshold: 90% overall, 95% domain, 90% application
 *
 * Expected behavior:
 * - EXIT 0: Coverage meets threshold
 * - EXIT 1: Coverage below threshold
 *
 * Usage:
 *   npx tsx tools/scripts/gate-2/validate-coverage.ts T2
 *   npx tsx tools/scripts/gate-2/validate-coverage.ts T3
 *
 * @see .specify/sprints/sprint-15/specifications/IFC-027-spec.md AC-003, AC-006
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CoverageSummary {
  total: {
    lines: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
  [key: string]: {
    lines: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
}

interface TrancheThresholds {
  overall: number;
  domain: number;
  application: number;
}

interface ValidationResult {
  gate: 'coverage';
  tranche: 'T2' | 'T3';
  passed: boolean;
  exitCode: number;
  timestamp: string;
  thresholds: TrancheThresholds;
  actual: {
    overall: number;
    domain: number | null;
    application: number | null;
  };
  gaps: {
    overall: number;
    domain: number | null;
    application: number | null;
  };
}

export const TRANCHES = ['T2', 'T3'] as const;

export const THRESHOLDS: Record<'T2' | 'T3', TrancheThresholds> = {
  T2: { overall: 80, domain: 95, application: 90 },
  T3: { overall: 90, domain: 95, application: 90 },
};

export function getCoverageForPath(summary: CoverageSummary, pathPattern: string): number | null {
  const matchingPaths = Object.keys(summary).filter(
    (key) => key !== 'total' && key.includes(pathPattern)
  );

  if (matchingPaths.length === 0) {
    return null;
  }

  let totalLines = 0;
  let coveredLines = 0;

  for (const path of matchingPaths) {
    totalLines += summary[path].lines.total;
    coveredLines += summary[path].lines.covered;
  }

  return totalLines > 0 ? (coveredLines / totalLines) * 100 : null;
}

/** One Domain/Application row: a layer with no report entries prints "No data". */
function printOptionalLayerRow(label: string, target: number, actual: number | null): void {
  const cell = label.padEnd(14);
  if (actual === null) {
    console.log(`│ ${cell}│ ${target}%`.padEnd(21) + '│ -        │ No data               │');
    return;
  }
  const status = actual >= target ? '✓ MET' : '✗ NOT MET';
  console.log(
    `│ ${cell}│ ${target}%`.padEnd(21) +
      `│ ${actual.toFixed(2)}%`.padEnd(11) +
      `│ ${status}`.padEnd(24) +
      '│'
  );
}

export function validateCoverage(tranche: 'T2' | 'T3', root = process.cwd()): ValidationResult {
  const coveragePath = join(root, 'artifacts', 'coverage', 'coverage-summary.json');
  const thresholds = THRESHOLDS[tranche];

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Gate 2 Validation: Test Coverage (${tranche})                     ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Overall Target: ${thresholds.overall}%`.padEnd(63) + '║');
  console.log(`║  Domain Target:  ${thresholds.domain}%`.padEnd(63) + '║');
  console.log(`║  Application Target: ${thresholds.application}%`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!existsSync(coveragePath)) {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✗ FAIL: Coverage report not found                          │');
    console.log('│  Run: pnpm run test:unit --coverage                         │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    return {
      gate: 'coverage',
      tranche,
      passed: false,
      exitCode: 1,
      timestamp: new Date().toISOString(),
      thresholds,
      actual: { overall: 0, domain: null, application: null },
      gaps: { overall: thresholds.overall, domain: null, application: null },
    };
  }

  const summary: CoverageSummary = JSON.parse(readFileSync(coveragePath, 'utf-8'));
  const overall = summary.total.lines.pct;
  const domain = getCoverageForPath(summary, 'packages/domain');
  const application = getCoverageForPath(summary, 'packages/application');

  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Coverage Results                                           │');
  console.log('├───────────────┬──────────┬──────────┬───────────────────────┤');
  console.log('│ Layer         │ Target   │ Actual   │ Status                │');
  console.log('├───────────────┼──────────┼──────────┼───────────────────────┤');

  const overallStatus = overall >= thresholds.overall ? '✓ MET' : '✗ NOT MET';
  console.log(
    `│ Overall       │ ${thresholds.overall}%`.padEnd(21) +
      `│ ${overall.toFixed(2)}%`.padEnd(11) +
      `│ ${overallStatus}`.padEnd(24) +
      '│'
  );

  printOptionalLayerRow('Domain', thresholds.domain, domain);
  printOptionalLayerRow('Application', thresholds.application, application);

  console.log('└───────────────┴──────────┴──────────┴───────────────────────┘');

  // Determine if all conditions are met
  const overallMet = overall >= thresholds.overall;
  const domainMet = domain === null || domain >= thresholds.domain;
  const appMet = application === null || application >= thresholds.application;
  const allMet = overallMet && domainMet && appMet;

  console.log('');
  if (allMet) {
    console.log(`│  ✓ PASS: ${tranche} coverage threshold met                        │`);
  } else {
    console.log(`│  ✗ FAIL: ${tranche} coverage threshold not met                    │`);
    if (!overallMet) {
      console.log(
        `│  Gap: Need +${(thresholds.overall - overall).toFixed(2)}% overall coverage`.padEnd(62) +
          '│'
      );
    }
  }

  const result: ValidationResult = {
    gate: 'coverage',
    tranche,
    passed: allMet,
    exitCode: allMet ? 0 : 1,
    timestamp: new Date().toISOString(),
    thresholds,
    actual: {
      overall,
      domain,
      application,
    },
    gaps: {
      overall: Math.max(0, thresholds.overall - overall),
      domain: domain !== null ? Math.max(0, thresholds.domain - domain) : null,
      application: application !== null ? Math.max(0, thresholds.application - application) : null,
    },
  };

  return result;
}

/** CLI entry: returns the exit code instead of exiting, so it can be tested. */
export function main(argv: string[] = process.argv.slice(2), root = process.cwd()): number {
  const requested = argv[0] || 'T2';
  // Take the value from the allow-list, never from argv, so only a known tranche reaches a path.
  const tranche = TRANCHES.find((t) => t === requested);
  if (!tranche) {
    console.error('Usage: npx tsx validate-coverage.ts [T2|T3]');
    return 1;
  }

  const result = validateCoverage(tranche, root);

  // Save result to artifacts
  const artifactsDir = join(root, 'artifacts', 'gate-2');
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  writeFileSync(
    join(artifactsDir, `coverage-validation-${tranche}.json`),
    JSON.stringify(result, null, 2)
  );

  console.log('');
  console.log(`Result saved to: artifacts/gate-2/coverage-validation-${tranche}.json`);

  return result.passed ? 0 : 1;
}

// Run only when executed directly, so tests can import the functions.
if (
  process.argv[1]?.endsWith('validate-coverage.ts') ||
  process.argv[1]?.endsWith('validate-coverage.js')
) {
  process.exit(main());
}
