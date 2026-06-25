#!/usr/bin/env ts-node

/**
 * Session Context Snapshot CLI
 *
 * Writes `docs/SESSION_CONTEXT.md` from the current state of the metrics tree.
 * Mirrors `scripts/sync-metrics.ts` ergonomics: resolves paths relative to this
 * script's location so invocation from any cwd works.
 *
 * Usage:
 *   npx tsx apps/project-tracker/scripts/generate-context.ts
 *   (or)  cd apps/project-tracker && npx tsx scripts/generate-context.ts
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCurrentStateReport } from '../lib/current-state-report';
import { generateContextSnapshot } from '../lib/context-snapshot';
import { syncMetricsFromCSV } from '../lib/data-sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..');
const monorepoRoot = join(projectTrackerRoot, '..', '..');

const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
const specifySprintsDir = join(monorepoRoot, '.specify', 'sprints');
const sessionContextPath = join(monorepoRoot, 'docs', 'SESSION_CONTEXT.md');
const stateReportMdPath = join(monorepoRoot, 'docs', 'CURRENT_STATE_REPORT.md');
const stateReportJsonPath = join(monorepoRoot, 'artifacts', 'reports', 'current-state-report.json');

if (!existsSync(metricsDir)) {
  console.error(`Metrics directory not found: ${metricsDir}`);
  process.exit(1);
}

for (const outputPath of [sessionContextPath, stateReportMdPath, stateReportJsonPath]) {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Step 0 (ADR-067 Phase 2): regenerate the metrics tree (per-task JSONs + aggregates) from
// Sprint_plan.csv + .specify first — it is a gitignored generated cache, so on a fresh checkout
// the current-state-report / context-snapshot below would otherwise read a stale or absent tree.
{
  const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');
  if (existsSync(csvPath)) {
    const result = syncMetricsFromCSV(csvPath, metricsDir, { rebuildPerTask: true });
    if (!result.success) {
      console.warn(
        `  ⚠ metrics generation reported errors: ${result.errors.slice(0, 3).join('; ')}`
      );
    }
  }
}

// Step 1: Regenerate the current-state-report so SESSION_CONTEXT reads fresh data
if (existsSync(specifySprintsDir)) {
  const stateReport = generateCurrentStateReport(metricsDir, specifySprintsDir, monorepoRoot);
  writeFileSync(stateReportMdPath, stateReport.markdown, 'utf-8');
  writeFileSync(stateReportJsonPath, `${JSON.stringify(stateReport.data, null, 2)}\n`, 'utf-8');
  console.log(
    `  State report: ${stateReport.data.overview.completedTasks}/${stateReport.data.overview.totalTasks} tasks`
  );
}

// Step 2: Generate SESSION_CONTEXT (reads the fresh state-report JSON for Project Health)
const result = generateContextSnapshot(metricsDir, monorepoRoot);
writeFileSync(sessionContextPath, result.markdown, 'utf-8');

console.log(`Wrote ${sessionContextPath} (${result.markdown.length} bytes)`);
console.log(`  Sources: ${result.sourceFiles.length} files`);
process.exit(0);
