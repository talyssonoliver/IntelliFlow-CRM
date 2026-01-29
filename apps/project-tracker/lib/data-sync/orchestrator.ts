/**
 * Data Sync Orchestrator
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { splitSprintPlan } from '../../../../tools/scripts/split-sprint-plan';
import type { SyncResult, SafeUpdateResult, TaskRecord } from './types';
import { tryFormatMetricsJson, findTaskFile } from './file-io';
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
 * Sync all metrics files from CSV (Single Source of Truth)
 */
export function syncMetricsFromCSV(csvPath: string, metricsDir: string): SyncResult {
  const startTime = Date.now();
  const filesUpdated: string[] = [];
  const errors: string[] = [];

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as TaskRecord[];

    updateAllMetricsFiles(tasks, metricsDir, filesUpdated, errors);
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

/**
 * Update all metrics files
 */
function updateAllMetricsFiles(
  tasks: TaskRecord[],
  metricsDir: string,
  filesUpdated: string[],
  errors: string[]
): void {
  // Update Sprint_plan.json
  const updateResult = safeUpdate(
    () => updateSprintPlanJson(tasks, metricsDir),
    'Sprint_plan.json'
  );
  if (updateResult.success) {
    filesUpdated.push(updateResult.file);
  } else {
    errors.push(`${updateResult.file}: ${updateResult.error}`);
  }

  // Update task-registry.json
  const registryResult = safeUpdate(
    () => updateTaskRegistry(tasks, metricsDir),
    'task-registry.json'
  );
  if (registryResult.success) {
    filesUpdated.push(registryResult.file);
  } else {
    errors.push(`${registryResult.file}: ${registryResult.error}`);
  }

  // Group tasks by sprint
  const tasksBySprint = new Map<number, TaskRecord[]>();
  for (const task of tasks) {
    const sprintRaw = task['Target Sprint'];
    const sprintNum = parseInt(sprintRaw || '0', 10);
    if (!isNaN(sprintNum) && sprintNum >= 0) {
      if (!tasksBySprint.has(sprintNum)) {
        tasksBySprint.set(sprintNum, []);
      }
      tasksBySprint.get(sprintNum)!.push(task);
    }
  }

  // Process each sprint
  for (const [sprintNum, sprintTasks] of tasksBySprint) {
    const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
    if (!existsSync(sprintDir)) continue;

    // Update individual task files
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

    // Update phase summaries for Sprint 0
    if (sprintNum === 0) {
      const phaseResult = safeUpdate(
        () => updatePhaseSummaries(sprintTasks, metricsDir),
        'sprint-0/phase summaries'
      );
      if (phaseResult.success) {
        filesUpdated.push(phaseResult.file);
      } else {
        errors.push(`${phaseResult.file}: ${phaseResult.error}`);
      }
    }

    // Update sprint summary
    const summaryResult = safeUpdate(
      () => updateSprintSummaryGeneric(sprintTasks, metricsDir, sprintNum),
      `sprint-${sprintNum}/_summary.json`
    );
    if (summaryResult.success) {
      filesUpdated.push(summaryResult.file);
    } else {
      errors.push(`${summaryResult.file}: ${summaryResult.error}`);
    }
  }

  // Update dependency graph
  const graphResult = safeUpdate(
    () => updateDependencyGraph(tasks, metricsDir),
    'dependency-graph.json'
  );
  if (graphResult.success) {
    filesUpdated.push(graphResult.file);
  } else {
    errors.push(`${graphResult.file}: ${graphResult.error}`);
  }

  // Calculate and sync PMBOK schedule data
  const scheduleResult = safeUpdate(
    () => {
      const result = syncScheduleData(tasks, metricsDir);
      if (!result.success) {
        throw new Error(result.errors.join('; '));
      }
    },
    'schedule-data'
  );
  if (scheduleResult.success) {
    filesUpdated.push('schedule-data (PMBOK)');
  } else {
    errors.push(`${scheduleResult.file}: ${scheduleResult.error}`);
  }
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
