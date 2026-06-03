#!/usr/bin/env node
/**
 * Test runner wrapper script
 *
 * Runs Vitest and interprets results based on test output rather than exit code.
 * This handles the case where all tests pass but a worker OOMs during cleanup.
 *
 * The OOM error happens AFTER:
 * 1. All tests have run
 * 2. Results have been printed ("X tests passed")
 * 3. Coverage has been collected
 *
 * So we can safely ignore the OOM crash and exit 0 if tests passed.
 */

const { spawn } = require('child_process');
const path = require('path');

// Track test results from stdout
let output = '';
let testsPassedCount = 0;
let testsFailedCount = 0;

// Get additional args (e.g., --coverage)
const additionalArgs = process.argv.slice(2);

// Run vitest with inherited stdio for real-time output
const vitest = spawn(
  'node',
  [
    '--max-old-space-size=8192',
    '--expose-gc',
    './node_modules/vitest/vitest.mjs',
    'run',
    ...additionalArgs,
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  }
);

// Capture stdout to parse results
vitest.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(data);
  output += text;

  // Parse test results from output
  // Strip ANSI codes for parsing
  // eslint-disable-next-line no-control-regex
  const stripped = text.replaceAll(/\x1b\[[0-9;]*m/g, '');

  // Format: "Tests  X passed | Y skipped (Z)"
  const testsMatch = stripped.match(/Tests\s+(\d+)\s+passed/);
  if (testsMatch) {
    testsPassedCount = Number.parseInt(testsMatch[1], 10);
  }

  const failedMatch = stripped.match(/(\d+)\s+failed/);
  if (failedMatch) {
    testsFailedCount = Number.parseInt(failedMatch[1], 10);
  }
});

// Pass through stderr
vitest.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle process exit
vitest.on('close', (code) => {
  // Strip ANSI codes from full output for checking
  // eslint-disable-next-line no-control-regex
  const strippedOutput = output.replaceAll(/\x1b\[[0-9;]*m/g, '');

  // Check if we saw test results in the output
  const sawTestResults = strippedOutput.includes('Test Files') && strippedOutput.includes('Tests');

  // Also try to parse from final output if not caught incrementally
  if (testsPassedCount === 0) {
    const match = strippedOutput.match(/Tests\s+(\d+)\s+passed/);
    if (match) {
      testsPassedCount = Number.parseInt(match[1], 10);
    }
  }

  // F-06 hardening (CI Audit Report): Vitest's exit code is the source of
  // truth. We ONLY forgive a non-zero exit when (a) results were printed,
  // (b) zero tests failed, AND (c) the non-zero code is explained by a KNOWN
  // post-run worker/teardown crash (OOM during cleanup, vitest-pool RPC
  // teardown race — the same noise vitest.config.ts onUnhandledError swallows).
  // Any OTHER non-zero exit fails the run, so a stdout-format change, an early
  // crash, or a coverage-threshold breach can never be mis-read as green.
  const KNOWN_CLEANUP_NOISE = [
    'Worker exited unexpectedly',
    'JS heap out of memory',
    'EnvironmentTeardownError',
    'Closing rpc while',
    'onUserConsoleLog',
    'vitest-pool',
  ];
  const sawCleanupNoise = KNOWN_CLEANUP_NOISE.some((marker) => strippedOutput.includes(marker));
  const cleanPass = sawTestResults && testsFailedCount === 0 && testsPassedCount > 0;

  if (cleanPass && code === 0) {
    console.log('\n✅ Tests completed successfully (' + testsPassedCount + ' passed)');
    process.exit(0);
  } else if (cleanPass && sawCleanupNoise) {
    console.log('\n✅ Tests completed successfully (' + testsPassedCount + ' passed)');
    console.log(
      'ℹ️  Worker cleanup crash ignored (all tests passed; known teardown noise, exit ' + code + ')'
    );
    process.exit(0);
  } else if (testsFailedCount > 0) {
    console.log('\n❌ Tests failed (' + testsFailedCount + ' failures)');
    process.exit(1);
  } else if (code !== 0) {
    // Non-zero exit, no failed-test count, no recognised cleanup noise — treat
    // as a real failure (early crash, reporter/format drift, threshold breach).
    console.log('\n❌ Test run exited ' + code + ' without a clean pass signal — failing.');
    process.exit(code);
  } else {
    console.log('\n❌ Test run did not complete properly');
    process.exit(1);
  }
});

// Handle errors
vitest.on('error', (err) => {
  console.error('Failed to start vitest:', err);
  process.exit(1);
});
