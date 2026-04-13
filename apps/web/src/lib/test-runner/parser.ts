/**
 * Vitest Output Parser
 *
 * Parses vitest verbose output to extract test pass/fail events.
 * Handles different output formats from vitest reporter.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TestRunProgress, CoverageMetrics } from './types';

// Vitest output patterns
const PATTERNS = {
  // Test file with result count: "✓ packages/domain/src/__tests__/Lead.test.ts (12 tests) 45ms"
  suiteComplete:
    /^[ \t]*([✓✔✗✘×])[ \t]+([^\n]{1,500}\.(?:test|spec)\.[jt]sx?)[ \t]+\((\d{1,10})[ \t]+tests?\)[ \t]+(\d{1,10})(?:ms|s)/,
  // Individual test pass: "  ✓ should create a lead (12ms)"
  testPass: /^[ \t]*[✓✔][ \t]+([^\n]{1,500}?)(?:[ \t]+\((\d{1,10})(?:ms|s)\))?$/, // NOSONAR S5852 — bounded {1,500}, parses controlled Vitest output
  // Individual test fail: "  ✗ should validate email (23ms)"
  testFail: /^[ \t]*[✗✘×][ \t]+([^\n]{1,500}?)(?:[ \t]+\((\d{1,10})(?:ms|s)\))?$/, // NOSONAR S5852
  // Test skip: "  ↓ should handle edge case [skipped]"
  testSkip: /^[ \t]*[↓⊘○][ \t]+([^\n]{1,500}?)(?:[ \t]+\[skipped\])?$/, // NOSONAR S5852
  // Coverage table header: "All files |   85.5 |   72.3 |   91.2 |   84.1"
  coverageTable: /^\s*All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
  // Test counts — parsed via multiple simpler regexes (see parseTestCounts).
  // Pattern: "Tests  12 passed | 2 failed | 1 skipped (14)"
  testCountsPassed: /Tests?\s+(\d+)\s+passed/,
  testCountsFailed: /\|\s*(\d+)\s+failed/,
  testCountsSkipped: /\|\s*(\d+)\s+skipped/,
  testCountsTotal: /\((\d+)\)\s*$/,
  // Duration: "Duration  1.23s"
  duration: /Duration\s+([\d.]+)s/,
  // File running: "RUN  packages/domain/src/__tests__/Lead.test.ts"
  fileStart: /^\s*(?:RUN|Running)\s+([^\s]{1,500}\.(?:test|spec)\.[jt]sx?)$/,
};

function parseSuiteComplete(line: string, runId: string): TestRunProgress | null {
  const m = PATTERNS.suiteComplete.exec(line);
  if (!m) return null;
  const [, status, file, testCount, duration] = m;
  return {
    runId,
    type: 'suite_complete',
    timestamp: new Date().toISOString(),
    data: {
      file,
      suiteName: file.split('/').pop() || file,
      testsRun: Number.parseInt(testCount, 10),
      duration: Number.parseInt(duration, 10),
      passed: status === '✓' || status === '✔',
    },
  };
}

function parseTestPassOrFail(
  line: string,
  runId: string,
  type: 'test_pass' | 'test_fail'
): TestRunProgress | null {
  const pattern = type === 'test_pass' ? PATTERNS.testPass : PATTERNS.testFail;
  const m = pattern.exec(line);
  if (!m) return null;
  const [, testName, duration] = m;
  return {
    runId,
    type,
    timestamp: new Date().toISOString(),
    data: { testName, duration: duration ? Number.parseInt(duration, 10) : undefined },
  };
}

function parseTestSkip(line: string, runId: string): TestRunProgress | null {
  const m = PATTERNS.testSkip.exec(line);
  if (!m) return null;
  return {
    runId,
    type: 'test_skip',
    timestamp: new Date().toISOString(),
    data: { testName: m[1] },
  };
}

function parseFileStart(line: string, runId: string): TestRunProgress | null {
  const m = PATTERNS.fileStart.exec(line);
  if (!m) return null;
  const file = m[1];
  return {
    runId,
    type: 'suite_start',
    timestamp: new Date().toISOString(),
    data: { file, suiteName: file.split('/').pop() || file },
  };
}

function parseCoverageTable(line: string, runId: string): TestRunProgress | null {
  const m = PATTERNS.coverageTable.exec(line);
  if (!m) return null;
  const [, stmts, branches, funcs, lines] = m;
  return {
    runId,
    type: 'coverage_complete',
    timestamp: new Date().toISOString(),
    data: {
      coverage: {
        statements: { total: 0, covered: 0, pct: Number.parseFloat(stmts) },
        branches: { total: 0, covered: 0, pct: Number.parseFloat(branches) },
        functions: { total: 0, covered: 0, pct: Number.parseFloat(funcs) },
        lines: { total: 0, covered: 0, pct: Number.parseFloat(lines) },
      },
    },
  };
}

function parseTestCounts(line: string, runId: string): TestRunProgress | null {
  const passedMatch = PATTERNS.testCountsPassed.exec(line);
  const totalMatch = PATTERNS.testCountsTotal.exec(line);
  if (!passedMatch || !totalMatch) return null;

  const failedMatch = PATTERNS.testCountsFailed.exec(line);
  const skippedMatch = PATTERNS.testCountsSkipped.exec(line);

  return {
    runId,
    type: 'complete',
    timestamp: new Date().toISOString(),
    data: {
      testsPassed: Number.parseInt(passedMatch[1], 10),
      testsFailed: failedMatch ? Number.parseInt(failedMatch[1], 10) : 0,
      testsSkipped: skippedMatch ? Number.parseInt(skippedMatch[1], 10) : 0,
      testsRun: Number.parseInt(totalMatch[1], 10),
    },
  };
}

/**
 * Parse a single line of vitest output
 */
export function parseVitestLine(line: string, runId: string): TestRunProgress | null {
  if (!line.trim()) return null;
  return (
    parseSuiteComplete(line, runId) ??
    parseTestPassOrFail(line, runId, 'test_pass') ??
    parseTestPassOrFail(line, runId, 'test_fail') ??
    parseTestSkip(line, runId) ??
    parseFileStart(line, runId) ??
    parseCoverageTable(line, runId) ??
    parseTestCounts(line, runId) ??
    null
  );
}

/**
 * Parse coverage-summary.json file
 */
export function parseCoverageSummary(projectRoot: string): CoverageMetrics | null {
  const coveragePaths = [
    join(projectRoot, 'artifacts', 'coverage', 'coverage-summary.json'),
    join(projectRoot, 'coverage', 'coverage-summary.json'),
  ];

  for (const coveragePath of coveragePaths) {
    if (existsSync(coveragePath)) {
      try {
        const data = JSON.parse(readFileSync(coveragePath, 'utf8'));
        if (data.total) {
          return {
            lines: {
              total: data.total.lines.total,
              covered: data.total.lines.covered,
              pct: data.total.lines.pct,
            },
            statements: {
              total: data.total.statements.total,
              covered: data.total.statements.covered,
              pct: data.total.statements.pct,
            },
            functions: {
              total: data.total.functions.total,
              covered: data.total.functions.covered,
              pct: data.total.functions.pct,
            },
            branches: {
              total: data.total.branches.total,
              covered: data.total.branches.covered,
              pct: data.total.branches.pct,
            },
          };
        }
      } catch (error) {
        console.error('Failed to parse coverage summary:', error);
      }
    }
  }

  return null;
}

/**
 * Parse multiple lines of vitest output
 */
export function parseVitestOutput(
  output: string,
  runId: string
): { events: TestRunProgress[]; summary: { passed: number; failed: number; skipped: number } } {
  const lines = output.split('\n');
  const events: TestRunProgress[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of lines) {
    const event = parseVitestLine(line, runId);
    if (event) {
      events.push(event);

      // Track counts
      if (event.type === 'test_pass') passed++;
      if (event.type === 'test_fail') failed++;
      if (event.type === 'test_skip') skipped++;
    }
  }

  return { events, summary: { passed, failed, skipped } };
}
