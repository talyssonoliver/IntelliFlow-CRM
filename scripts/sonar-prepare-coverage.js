#!/usr/bin/env node
/**
 * Validate canonical coverage artifacts for SonarQube.
 *
 * Single source of truth:
 * - artifacts/coverage/coverage-summary.json
 * - artifacts/coverage/coverage-final.json
 * - artifacts/coverage/lcov.info
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const coverageDir = path.join(repoRoot, 'artifacts', 'coverage');
const summaryPath = path.join(coverageDir, 'coverage-summary.json');
const finalPath = path.join(coverageDir, 'coverage-final.json');
const lcovPath = path.join(coverageDir, 'lcov.info');
const MIN_PER_FILE_ENTRIES = Number(process.env.SONAR_COVERAGE_MIN_FILES || '2');

function requireFile(filePath) {
  if (fs.existsSync(filePath)) return;
  console.error(`Missing required coverage artifact: ${path.relative(repoRoot, filePath)}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Invalid JSON in ${path.relative(repoRoot, filePath)}`);
    console.error(String(error));
    process.exit(1);
  }
}

function main() {
  requireFile(summaryPath);
  requireFile(finalPath);
  requireFile(lcovPath);

  const summary = readJson(summaryPath);
  const coverageFinal = readJson(finalPath);

  const finalEntries = Object.keys(coverageFinal).length;
  const lcovSourceFiles = fs
    .readFileSync(lcovPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('SF:')).length;

  console.log(`Coverage source dir: ${path.relative(repoRoot, coverageDir)}`);
  if (summary?.total) {
    console.log(
      `Coverage summary: lines=${summary.total.lines.pct}% statements=${summary.total.statements.pct}% functions=${summary.total.functions.pct}% branches=${summary.total.branches.pct}%`
    );
  }
  console.log(`coverage-final entries: ${finalEntries}`);
  console.log(`lcov source files: ${lcovSourceFiles}`);

  if (finalEntries < MIN_PER_FILE_ENTRIES || lcovSourceFiles < MIN_PER_FILE_ENTRIES) {
    console.error(
      `Coverage artifacts look incomplete (min expected files=${MIN_PER_FILE_ENTRIES}). ` +
        'Regenerate coverage so artifacts/coverage is the single source of truth.'
    );
    process.exit(1);
  }

  console.log(`Canonical Sonar LCOV: ${path.relative(repoRoot, lcovPath)}`);
}

main();
