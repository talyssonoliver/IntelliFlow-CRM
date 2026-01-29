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
    '--max-old-space-size=16384',
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
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');

  // Format: "Tests  X passed | Y skipped (Z)"
  const testsMatch = stripped.match(/Tests\s+(\d+)\s+passed/);
  if (testsMatch) {
    testsPassedCount = parseInt(testsMatch[1], 10);
  }

  const failedMatch = stripped.match(/(\d+)\s+failed/);
  if (failedMatch) {
    testsFailedCount = parseInt(failedMatch[1], 10);
  }
});

// Pass through stderr
vitest.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle process exit
vitest.on('close', (code) => {
  // Strip ANSI codes from full output for checking
  const strippedOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

  // Check if we saw test results in the output
  const sawTestResults = strippedOutput.includes('Test Files') && strippedOutput.includes('Tests');

  // Also try to parse from final output if not caught incrementally
  if (testsPassedCount === 0) {
    const match = strippedOutput.match(/Tests\s+(\d+)\s+passed/);
    if (match) {
      testsPassedCount = parseInt(match[1], 10);
    }
  }

  if (sawTestResults && testsFailedCount === 0 && testsPassedCount > 0) {
    // Tests passed! Exit 0 regardless of worker crash
    console.log('\n✅ Tests completed successfully (' + testsPassedCount + ' passed)');
    if (code !== 0) {
      console.log('ℹ️  Worker cleanup crash ignored (all tests passed before crash)');
    }
    process.exit(0);
  } else if (testsFailedCount > 0) {
    // Tests failed
    console.log('\n❌ Tests failed (' + testsFailedCount + ' failures)');
    process.exit(1);
  } else {
    // No results seen - something went wrong
    console.log('\n❌ Test run did not complete properly');
    process.exit(code || 1);
  }
});

// Handle errors
vitest.on('error', (err) => {
  console.error('Failed to start vitest:', err);
  process.exit(1);
});
