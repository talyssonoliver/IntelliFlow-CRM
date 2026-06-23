/**
 * Data Sync Orchestrator
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { splitSprintPlan } from '../../../../tools/scripts/split-sprint-plan';
import { generateSpecTracker } from '../../../../tools/scripts/generate-spec-tracker';
import type { SyncResult, SafeUpdateResult, TaskRecord } from './types';
import { tryFormatMetricsJson, findRepoRoot } from './file-io';
import { updateSprintPlanJson, updateTaskRegistry } from './json-generators';
import { updateIndividualTaskFile } from './task-json-updater';
import { updatePhaseSummaries, updateSprintSummaryGeneric } from './summary-generators';
import { updateDependencyGraph } from './dependency-graph';
import { syncScheduleData } from './schedule-sync';

/**
 * Sync all metrics using default paths
 */
export async function syncAllMetrics(): Promise<SyncResult> {
  const metricsDir = join(process.cwd(), 'docs', 'metrics');
  const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');

  const altMetricsDir = join(process.cwd(), 'apps', 'project-tracker', 'docs', 'metrics');
  const altCsvPath = join(altMetricsDir, '_global', 'Sprint_plan.csv');

  if (existsSync(csvPath)) {
    return syncMetricsFromCSV(csvPath, metricsDir);
  } else if (existsSync(altCsvPath)) {
    return syncMetricsFromCSV(altCsvPath, altMetricsDir);
  } else {
    return {
      success: false,
      filesUpdated: [],
      errors: [`CSV not found at ${csvPath} or ${altCsvPath}`],
      summary: { tasksProcessed: 0, filesWritten: 0, timeElapsed: 0 },
    };
  }
}

/**
 * Options for syncMetricsFromCSV.
 *
 * `aggregatesOnly` (ADR-067 Phase 1): regenerate ONLY the purely-derived
 * aggregates (Sprint_plan.json, task-registry.json, dependency-graph.json,
 * sprint-N/_summary.json, split CSVs, spec-tracker.json, schedule-data) and
 * SKIP the per-task `{TASK_ID}.json` write loop. The per-task JSONs are MIXED
 * canonical/derived (they carry sole-copy evidence — see apps/project-tracker/
 * CLAUDE.md), so a consistency check / aggregate refresh must never rewrite
 * them. Gate 5 (Metrics Tracked State) uses this mode to regenerate aggregates
 * into a temp dir and diff for drift.
 */
export interface SyncOptions {
  aggregatesOnly?: boolean;
}

/**
 * Sync all metrics files from CSV (Single Source of Truth)
 */
export function syncMetricsFromCSV(
  csvPath: string,
  metricsDir: string,
  options: SyncOptions = {}
): SyncResult {
  const startTime = Date.now();
  const filesUpdated: string[] = [];
  const errors: string[] = [];

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as TaskRecord[];

    updateAllMetricsFiles(tasks, metricsDir, filesUpdated, errors, options);
    tryFormatMetricsJson(metricsDir);

    // Auto-regenerate split files
    const splitResult = splitSprintPlan();
    if (splitResult.success) {
      for (const part of splitResult.parts) {
        filesUpdated.push(`Sprint_plan_${part.name}.csv`);
      }
    } else if (splitResult.error) {
      errors.push(`CSV split: ${splitResult.error}`);
    }

    // Auto-regenerate spec-tracker.json
    const repoRoot = findRepoRoot(metricsDir);
    if (repoRoot) {
      const specTrackerResult = safeUpdate(() => {
        generateSpecTracker({ repoRoot, writeOutput: true });
      }, 'spec-tracker.json');
      if (specTrackerResult.success) {
        filesUpdated.push(specTrackerResult.file);
      } else {
        errors.push(`${specTrackerResult.file}: ${specTrackerResult.error}`);
      }
    }

    const timeElapsed = Date.now() - startTime;

    return {
      success: errors.length === 0,
      filesUpdated,
      errors,
      summary: {
        tasksProcessed: tasks.length,
        filesWritten: filesUpdated.length,
        timeElapsed,
      },
    };
  } catch (err) {
    return {
      success: false,
      filesUpdated,
      errors: [`Fatal error: ${err instanceof Error ? err.message : String(err)}`],
      summary: {
        tasksProcessed: 0,
        filesWritten: 0,
        timeElapsed: Date.now() - startTime,
      },
    };
  }
}

function applyResult(
  result: SafeUpdateResult,
  filesUpdated: string[],
  errors: string[],
  overrideName?: string
): void {
  if (result.success) {
    filesUpdated.push(overrideName ?? result.file);
  } else {
    errors.push(`${result.file}: ${result.error}`);
  }
}

function groupTasksBySprint(tasks: TaskRecord[]): Map<number, TaskRecord[]> {
  const tasksBySprint = new Map<number, TaskRecord[]>();
  for (const task of tasks) {
    const sprintNum = Number.parseInt(task['Target Sprint'] || '0', 10);
    if (!Number.isNaN(sprintNum) && sprintNum >= 0) {
      if (!tasksBySprint.has(sprintNum)) {
        tasksBySprint.set(sprintNum, []);
      }
      tasksBySprint.get(sprintNum)!.push(task);
    }
  }
  return tasksBySprint;
}

function processSprintTasks(
  sprintNum: number,
  sprintTasks: TaskRecord[],
  tasks: TaskRecord[],
  metricsDir: string,
  filesUpdated: string[],
  errors: string[],
  options: SyncOptions = {}
): void {
  const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
  if (!existsSync(sprintDir)) return;

  // ADR-067 Phase 1: in aggregates-only mode, never touch the per-task JSONs
  // (they carry sole-copy canonical content). Still regenerate the sprint
  // _summary.json below from the existing per-task files + CSV.
  if (!options.aggregatesOnly) {
    for (const task of sprintTasks) {
      const taskResult = safeUpdate(
        () => updateIndividualTaskFile(task, metricsDir, tasks, sprintNum),
        `sprint-${sprintNum}/${task['Task ID']}.json`
      );
      if (taskResult.success) {
        filesUpdated.push(taskResult.file);
      } else if (!taskResult.error?.includes('not found')) {
        errors.push(`${taskResult.file}: ${taskResult.error}`);
      }
    }
  }

  if (sprintNum === 0) {
    applyResult(
      safeUpdate(() => updatePhaseSummaries(sprintTasks, metricsDir), 'sprint-0/phase summaries'),
      filesUpdated,
      errors
    );
  }

  applyResult(
    safeUpdate(
      () => updateSprintSummaryGeneric(sprintTasks, metricsDir, sprintNum),
      `sprint-${sprintNum}/_summary.json`
    ),
    filesUpdated,
    errors
  );
}

/**
 * Update all metrics files
 */
function updateAllMetricsFiles(
  tasks: TaskRecord[],
  metricsDir: string,
  filesUpdated: string[],
  errors: string[],
  options: SyncOptions = {}
): void {
  applyResult(
    safeUpdate(() => updateSprintPlanJson(tasks, metricsDir), 'Sprint_plan.json'),
    filesUpdated,
    errors
  );

  applyResult(
    safeUpdate(() => updateTaskRegistry(tasks, metricsDir), 'task-registry.json'),
    filesUpdated,
    errors
  );

  const tasksBySprint = groupTasksBySprint(tasks);
  for (const [sprintNum, sprintTasks] of tasksBySprint) {
    processSprintTasks(sprintNum, sprintTasks, tasks, metricsDir, filesUpdated, errors, options);
  }

  applyResult(
    safeUpdate(() => updateDependencyGraph(tasks, metricsDir), 'dependency-graph.json'),
    filesUpdated,
    errors
  );

  const scheduleResult = safeUpdate(() => {
    const result = syncScheduleData(tasks, metricsDir);
    if (!result.success) {
      throw new Error(result.errors.join('; '));
    }
  }, 'schedule-data');
  applyResult(scheduleResult, filesUpdated, errors, 'schedule-data (PMBOK)');
}

/**
 * Safe update wrapper with error handling
 */
function safeUpdate(fn: () => void, filename: string): SafeUpdateResult {
  try {
    fn();
    return { success: true, file: filename };
  } catch (err) {
    return {
      success: false,
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Format sync result for display
 */
export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];

  lines.push(
    '='.repeat(80),
    'DATA SYNCHRONIZATION REPORT',
    '='.repeat(80),
    '',
    `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`,
    `Tasks Processed: ${result.summary.tasksProcessed}`,
    `Files Updated: ${result.summary.filesWritten}`,
    `Time Elapsed: ${result.summary.timeElapsed}ms`,
    ''
  );

  if (result.filesUpdated.length > 0) {
    lines.push('FILES UPDATED:', '-'.repeat(80));
    for (const file of result.filesUpdated) {
      lines.push(`  ✓ ${file}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('ERRORS:', '-'.repeat(80));
    for (const error of result.errors) {
      lines.push(`  ✗ ${error}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(80));

  return lines.join('\n');
}
