#!/usr/bin/env tsx
/**
 * Generate the DERIVED metrics tree from Sprint_plan.csv + the canonical .specify records.
 *
 * ADR-067 Phase 2: regenerates the derived aggregates (Sprint_plan.json,
 * task-registry.json, dependency-graph.json, sprint-N/_summary.json, the split CSVs,
 * spec-tracker.json, schedule-data) AND each per-task `{TASK_ID}.json`, rebuilt from
 * CSV + `.specify/.../task-tracking.json` (the canonical home for sole-copy operational +
 * evidence content). The whole metrics tree is a generated cache; canonical state lives in
 * Sprint_plan.csv + .specify. Run at dev-start, in CI before the sprint-data gate, and on demand.
 *
 * No-loss is proven by tools/scripts/prove-metrics-roundtrip.mjs.
 */
import { syncMetricsFromCSV, formatSyncResult } from '../lib/data-sync';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(here, '..');
const csvPath = join(projectTrackerRoot, 'docs', 'metrics', '_global', 'Sprint_plan.csv');
const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');

if (!existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

console.log(
  'Generating derived metrics tree (ADR-067 Phase 2: aggregates + per-task rebuild)...\n'
);
const result = syncMetricsFromCSV(csvPath, metricsDir, { rebuildPerTask: true });
console.log(formatSyncResult(result));
process.exit(result.success ? 0 : 1);
