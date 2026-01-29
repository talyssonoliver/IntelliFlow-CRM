/**
 * Vitest Output Parser
 *
 * Parses vitest verbose output to extract test pass/fail events.
 * Handles different output formats from vitest reporter.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TestRunProgress, CoverageMetrics } from './types';

// Vitest output patterns
const PATTERNS = {
  // Test file with result count: "✓ packages/domain/src/__tests__/Lead.test.ts (12 tests) 45ms"
  suiteComplete: /^\s*([✓✔✗✘×])\s+(.+\.(?:test|spec)\.[jt]sx?)\s+\((\d+)\s+tests?\)\s+(\d+)(?:ms|s)/,
  // Individual test pass: "  ✓ should create a lead (12ms)"
  testPass: /^\s*[✓✔]\s+(.+?)(?:\s+\((\d+)(?:ms|s)\))?$/,
  // Individual test fail: "  ✗ should validate email (23ms)"
  testFail: /^\s*[✗✘×]\s+(.+?)(?:\s+\((\d+)(?:ms|s)\))?$/,
  // Test skip: "  ↓ should handle edge case [skipped]"
  testSkip: /^\s*[↓⊘○]\s+(.+?)(?:\s+\[skipped\])?$/,
  // Coverage table header: "All files |   85.5 |   72.3 |   91.2 |   84.1"
  coverageTable:
    /^\s*All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
  // Test counts: "Tests  12 passed | 2 failed (14)"
  testCounts: /Tests?\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)/,
  // Duration: "Duration  1.23s"
  duration: /Duration\s+([\d.]+)s/,
  // File running: "RUN  packages/domain/src/__tests__/Lead.test.ts"
  fileStart: /^\s*(?:RUN|Running)\s+(.+\.(?:test|spec)\.[jt]sx?)$/,
};

/**
 * Parse a single line of vitest output
 */
export function parseVitestLine(line: string, runId: string): TestRunProgress | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Check for suite completion (file with test count)
  const suiteMatch = line.match(PATTERNS.suiteComplete);
  if (suiteMatch) {
    const [, status, file, testCount, duration] = suiteMatch;
    const passed = status === '✓' || status === '✔';
    return {
      runId,
      type: 'suite_complete',
      timestamp: new Date().toISOString(),
      data: {
        file,
        suiteName: file.split('/').pop() || file,
        testsRun: parseInt(testCount, 10),
        duration: parseInt(duration, 10),
        passed,
      },
    };
  }

  // Check for individual test pass
  const passMatch = line.match(PATTERNS.testPass);
  if (passMatch) {
    const [, testName, duration] = passMatch;
    return {
      runId,
      type: 'test_pass',
      timestamp: new Date().toISOString(),
      data: {
        testName,
        duration: duration ? parseInt(duration, 10) : undefined,
      },
    };
  }

  // Check for individual test fail
  const failMatch = line.match(PATTERNS.testFail);
  if (failMatch) {
    const [, testName, duration] = failMatch;
    return {
      runId,
      type: 'test_fail',
      timestamp: new Date().toISOString(),
      data: {
        testName,
        duration: duration ? parseInt(duration, 10) : undefined,
      },
    };
  }

  // Check for test skip
  const skipMatch = line.match(PATTERNS.testSkip);
  if (skipMatch) {
    const [, testName] = skipMatch;
    return {
      runId,
      type: 'test_skip',
      timestamp: new Date().toISOString(),
      data: {
        testName,
      },
    };
  }

  // Check for file start
  const fileStartMatch = line.match(PATTERNS.fileStart);
  if (fileStartMatch) {
    const [, file] = fileStartMatch;
    return {
      runId,
      type: 'suite_start',
      timestamp: new Date().toISOString(),
      data: {
        file,
        suiteName: file.split('/').pop() || file,
      },
    };
  }

  // Check for coverage table
  const coverageMatch = line.match(PATTERNS.coverageTable);
  if (coverageMatch) {
    const [, stmts, branches, funcs, lines] = coverageMatch;
    return {
      runId,
      type: 'coverage_complete',
      timestamp: new Date().toISOString(),
      data: {
        coverage: {
          statements: { total: 0, covered: 0, pct: parseFloat(stmts) },
          branches: { total: 0, covered: 0, pct: parseFloat(branches) },
          functions: { total: 0, covered: 0, pct: parseFloat(funcs) },
          lines: { total: 0, covered: 0, pct: parseFloat(lines) },
        },
      },
    };
  }

  // Check for test counts
  const countsMatch = line.match(PATTERNS.testCounts);
  if (countsMatch) {
    const [, passed, failed, skipped, total] = countsMatch;
    return {
      runId,
      type: 'complete',
      timestamp: new Date().toISOString(),
      data: {
        testsPassed: parseInt(passed, 10),
        testsFailed: failed ? parseInt(failed, 10) : 0,
        testsSkipped: skipped ? parseInt(skipped, 10) : 0,
        testsRun: parseInt(total, 10),
      },
    };
  }

  return null;
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
