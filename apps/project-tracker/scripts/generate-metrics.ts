#!/usr/bin/env tsx
/**
 * Generate the PURELY-DERIVED metrics aggregates from Sprint_plan.csv.
 *
 * ADR-067 Phase 1: regenerates ONLY the derived aggregate files
 * (Sprint_plan.json, task-registry.json, dependency-graph.json,
 * sprint-N/_summary.json, the split CSVs, spec-tracker.json, schedule-data) and
 * never touches the per-task `{TASK_ID}.json` files (which carry sole-copy
 * canonical content). These aggregates are gitignored and regenerated at
 * dev-start, in CI before the sprint-data gate, and on demand.
 *
 * For a full sync that also (re)writes per-task JSONs, use scripts/sync-metrics.ts.
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

console.log('Generating derived metrics aggregates (ADR-067, aggregates-only)...\n');
const result = syncMetricsFromCSV(csvPath, metricsDir, { aggregatesOnly: true });
console.log(formatSyncResult(result));
process.exit(result.success ? 0 : 1);
