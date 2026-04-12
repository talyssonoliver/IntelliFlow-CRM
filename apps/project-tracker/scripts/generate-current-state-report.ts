#!/usr/bin/env tsx

/**
 * Dynamic Current State Report CLI
 *
 * Writes:
 * - `docs/CURRENT_STATE_REPORT.md`
 * - `artifacts/reports/current-state-report.json`
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCurrentStateReport } from '../lib/current-state-report';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..');
const monorepoRoot = join(projectTrackerRoot, '..', '..');

const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
const specifySprintsDir = join(monorepoRoot, '.specify', 'sprints');
const markdownPath = join(monorepoRoot, 'docs', 'CURRENT_STATE_REPORT.md');
const jsonPath = join(monorepoRoot, 'artifacts', 'reports', 'current-state-report.json');

function writeSpecifySprintSummaries(result: ReturnType<typeof generateCurrentStateReport>): void {
  for (const sprint of result.data.sprints) {
    const sprintDir = join(specifySprintsDir, `sprint-${sprint.sprint}`);
    if (!existsSync(sprintDir)) {
      mkdirSync(sprintDir, { recursive: true });
    }

    const summaryPath = join(sprintDir, '_summary.json');
    const summary = {
      sprint: `sprint-${sprint.sprint}`,
      name: sprint.name,
      generated_at: result.data.generatedAt,
      summary_source: sprint.summarySource,
      task_summary: {
        total: sprint.totalTasks,
        completed: sprint.completedTasks,
        backlog: sprint.backlogTasks,
        blocked: sprint.blockedTasks,
        attested_completed: sprint.attestedCompletedTasks,
      },
      context: sprint.context,
      section_summary: sprint.sectionSummary,
      notable_completed: sprint.notableCompleted,
      open_tasks: sprint.openTasks,
      tasks: sprint.tasks,
    };

    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  }
}

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
writeSpecifySprintSummaries(firstPass);

const result = generateCurrentStateReport(metricsDir, specifySprintsDir, monorepoRoot);
writeFileSync(markdownPath, result.markdown, 'utf-8');
writeFileSync(jsonPath, `${JSON.stringify(result.data, null, 2)}\n`, 'utf-8');

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(`Tasks: ${result.data.overview.totalTasks}`);
console.log(`Completed: ${result.data.overview.completedTasks}`);
