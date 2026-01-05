#!/usr/bin/env node
/**
 * TDD-Friendly Coverage Runner
 *
 * Cross-platform wrapper that:
 * 1. Runs vitest with coverage
 * 2. Always generates metadata (even if tests fail)
 * 3. Returns appropriate exit code based on mode
 *
 * Usage:
 *   node scripts/ci/run-coverage.js          # TDD mode (always exits 0)
 *   node scripts/ci/run-coverage.js --strict # CI mode (fails if tests fail)
 *
 * @see IFC-044 - Unit Tests (Vitest + TDD)
 */

const { spawn } = require('child_process');
const path = require('path');

const isStrict = process.argv.includes('--strict');
const isCI = process.env.CI === 'true';

console.log(`\n=== Coverage Runner (${isStrict ? 'STRICT' : 'TDD'} mode) ===\n`);

// Run vitest with coverage
const vitest = spawn('npx', ['vitest', 'run', '--coverage', '--reporter=verbose'], {
  cwd: path.join(__dirname, '..', '..'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    FORCE_COLOR: '1',
  },
});

vitest.on('close', (vitestExitCode) => {
  console.log(`\nVitest exited with code: ${vitestExitCode}`);

  // Set exit code for metadata script
  process.env.VITEST_EXIT_CODE = String(vitestExitCode);

  // Run metadata script
  console.log('\n=== Adding Coverage Metadata ===\n');

  const metadata = spawn('node', [path.join(__dirname, 'add-coverage-metadata.js')], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  metadata.on('close', (metaExitCode) => {
    if (metaExitCode !== 0) {
      console.error('Warning: Metadata script failed');
    }

    // Determine final exit code
    if (isStrict || isCI) {
      // Strict mode: propagate vitest exit code
      process.exit(vitestExitCode);
    } else {
      // TDD mode: always exit 0 (coverage was generated)
      if (vitestExitCode !== 0) {
        console.log('\n[TDD Mode] Tests failed but coverage generated. Use --strict for CI.');
      }
      process.exit(0);
    }
  });

  metadata.on('error', (err) => {
    console.error('Failed to run metadata script:', err);
    process.exit(isStrict ? vitestExitCode : 0);
  });
});

vitest.on('error', (err) => {
  console.error('Failed to start vitest:', err);
  process.exit(1);
});
