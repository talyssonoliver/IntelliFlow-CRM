#!/usr/bin/env node
/**
 * TDD-Friendly Coverage Metadata Generator
 *
 * Adds metadata to coverage-summary.json for TDD workflow support:
 * - lastRunAt: ISO timestamp of when coverage was generated
 * - status: 'passed' | 'partial' | 'failed' | 'no-tests'
 * - testsTotal, testsPassed, testsFailed: Test execution counts
 * - thresholdsMet: Whether coverage meets target thresholds
 * - failingTests: List of failing test files (if any)
 *
 * This allows the UI to show real coverage data with accurate status,
 * even during TDD red/green cycles.
 *
 * @see IFC-044 - Unit Tests (Vitest + TDD)
 * @see IFC-088 - Continuous Quality Metrics
 */

const fs = require('fs');
const path = require('path');

// Target thresholds (per CLAUDE.md)
const THRESHOLDS = {
  statements: 90,
  branches: 80,
  functions: 90,
  lines: 90,
};

// Coverage output location (DRY - single source of truth)
const COVERAGE_DIR = path.join(__dirname, '..', '..', 'artifacts', 'coverage');
const COVERAGE_SUMMARY_PATH = path.join(COVERAGE_DIR, 'coverage-summary.json');

// Test results captured from vitest output (set via environment)
const TEST_EXIT_CODE = parseInt(process.env.VITEST_EXIT_CODE || '0', 10);
const TEST_OUTPUT_FILE = process.env.VITEST_OUTPUT_FILE;

/**
 * Parse test results from vitest JSON output or stdout capture
 */
function parseTestResults() {
  const results = {
    testsTotal: 0,
    testsPassed: 0,
    testsFailed: 0,
    testFiles: 0,
    failingTests: [],
    duration: 0,
  };

  // Try to read vitest JSON output if available
  if (TEST_OUTPUT_FILE && fs.existsSync(TEST_OUTPUT_FILE)) {
    try {
      const output = JSON.parse(fs.readFileSync(TEST_OUTPUT_FILE, 'utf8'));
      results.testsTotal = output.numTotalTests || 0;
      results.testsPassed = output.numPassedTests || 0;
      results.testsFailed = output.numFailedTests || 0;
      results.testFiles = output.numTotalTestSuites || 0;
      results.duration = output.duration || 0;

      if (output.testResults) {
        output.testResults.forEach((suite) => {
          if (suite.status === 'failed') {
            results.failingTests.push(path.basename(suite.name));
          }
        });
      }
    } catch (e) {
      console.warn('Could not parse vitest output file:', e.message);
    }
  }

  return results;
}

/**
 * Determine overall status based on test results and coverage
 */
function determineStatus(testResults, thresholdsMet) {
  if (testResults.testsTotal === 0) {
    return 'no-tests';
  }
  if (testResults.testsFailed > 0) {
    return 'partial'; // TDD red phase - tests failing but coverage generated
  }
  if (!thresholdsMet) {
    return 'partial'; // All tests pass but coverage below threshold
  }
  return 'passed';
}

/**
 * Check if coverage meets thresholds
 */
function checkThresholds(coverage) {
  if (!coverage || !coverage.total) {
    return { met: false, details: {} };
  }

  const total = coverage.total;
  const details = {
    statements: { target: THRESHOLDS.statements, actual: Math.round(total.statements?.pct || 0), met: false },
    branches: { target: THRESHOLDS.branches, actual: Math.round(total.branches?.pct || 0), met: false },
    functions: { target: THRESHOLDS.functions, actual: Math.round(total.functions?.pct || 0), met: false },
    lines: { target: THRESHOLDS.lines, actual: Math.round(total.lines?.pct || 0), met: false },
  };

  Object.keys(details).forEach((key) => {
    details[key].met = details[key].actual >= details[key].target;
  });

  const met = Object.values(details).every((d) => d.met);

  return { met, details };
}

/**
 * Main: Add metadata to coverage-summary.json
 */
function main() {
  console.log('Adding TDD metadata to coverage report...');

  // Ensure coverage directory exists
  if (!fs.existsSync(COVERAGE_DIR)) {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
  }

  // Read existing coverage summary (or create minimal structure)
  let coverage = {};
  if (fs.existsSync(COVERAGE_SUMMARY_PATH)) {
    try {
      coverage = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY_PATH, 'utf8'));
    } catch (e) {
      console.warn('Could not parse existing coverage-summary.json:', e.message);
    }
  }

  // Parse test results
  const testResults = parseTestResults();

  // Check thresholds
  const thresholds = checkThresholds(coverage);

  // Determine status
  const status = determineStatus(testResults, thresholds.met);

  // Build metadata
  const meta = {
    lastRunAt: new Date().toISOString(),
    status,
    exitCode: TEST_EXIT_CODE,
    testsTotal: testResults.testsTotal,
    testsPassed: testResults.testsPassed,
    testsFailed: testResults.testsFailed,
    testFiles: testResults.testFiles,
    duration: testResults.duration,
    thresholdsMet: thresholds.met,
    thresholds: thresholds.details,
    failingTests: testResults.failingTests.slice(0, 10), // Limit to 10 for readability
  };

  // Merge metadata into coverage
  coverage.meta = meta;

  // Write back
  fs.writeFileSync(COVERAGE_SUMMARY_PATH, JSON.stringify(coverage, null, 2));

  // Also write to artifacts/misc/coverage for backward compatibility
  const miscCoverageDir = path.join(__dirname, '..', '..', 'artifacts', 'misc', 'coverage');
  if (!fs.existsSync(miscCoverageDir)) {
    fs.mkdirSync(miscCoverageDir, { recursive: true });
  }
  fs.writeFileSync(path.join(miscCoverageDir, 'coverage-summary.json'), JSON.stringify(coverage, null, 2));

  // Log summary
  console.log('\nCoverage Metadata Added:');
  console.log(`  Status: ${status.toUpperCase()}`);
  console.log(`  Last Run: ${meta.lastRunAt}`);
  console.log(`  Tests: ${testResults.testsPassed}/${testResults.testsTotal} passed`);
  if (testResults.testsFailed > 0) {
    console.log(`  Failing: ${testResults.failingTests.join(', ')}`);
  }
  console.log(`  Thresholds Met: ${thresholds.met ? 'YES' : 'NO'}`);

  if (coverage.total) {
    const t = coverage.total;
    console.log(`  Coverage: Stmts ${Math.round(t.statements?.pct || 0)}%, ` +
                `Branch ${Math.round(t.branches?.pct || 0)}%, ` +
                `Funcs ${Math.round(t.functions?.pct || 0)}%, ` +
                `Lines ${Math.round(t.lines?.pct || 0)}%`);
  }

  console.log(`\nOutput: ${COVERAGE_SUMMARY_PATH}`);
}

main();
