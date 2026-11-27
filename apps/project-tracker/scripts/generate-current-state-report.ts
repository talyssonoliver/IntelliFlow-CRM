#!/usr/bin/env tsx

/**
 * Dynamic Current State Report CLI
 *
 * Writes:
 * - `docs/CURRENT_STATE_REPORT.md`
 * - `artifacts/reports/current-state-report.json`
 * - `.specify/sprints/sprint-{N}/_summary.json` (writeSprintSummaries)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCurrentStateReport, writeSprintSummaries } from '../lib/current-state-report';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..');
const monorepoRoot = join(projectTrackerRoot, '..', '..');

const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
const specifySprintsDir = join(monorepoRoot, '.specify', 'sprints');
const markdownPath = join(monorepoRoot, 'docs', 'CURRENT_STATE_REPORT.md');
const jsonPath = join(monorepoRoot, 'artifacts', 'reports', 'current-state-report.json');

if (!existsSync(metricsDir)) {
  console.error(`Metrics directory not found: ${metricsDir}`);
  process.exit(1);
}

if (!existsSync(specifySprintsDir)) {
  console.error(`.specify sprint directory not found: ${specifySprintsDir}`);
  process.exit(1);
}

for (const outputPath of [markdownPath, jsonPath]) {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

const firstPass = generateCurrentStateReport(metricsDir, specifySprintsDir, monorepoRoot);
writeSprintSummaries(firstPass.data, specifySprintsDir);

const result = generateCurrentStateReport(metricsDir, specifySprintsDir, monorepoRoot);
writeFileSync(markdownPath, result.markdown, 'utf-8');
writeFileSync(jsonPath, `${JSON.stringify(result.data, null, 2)}\n`, 'utf-8');

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(`Tasks: ${result.data.overview.totalTasks}`);
console.log(`Completed: ${result.data.overview.completedTasks}`);
