/**
 * Data Synchronization Utility
 * Single Source of Truth: Sprint_plan.csv
 * Automatically updates all derived files
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';

// Read a JSON file that may be wrapped in Markdown code fences (```json ... ```)
function readJsonTolerant(path: string): any {
  let content = readFileSync(path, 'utf-8');
  // Remove ```json or ``` markers if present
  content = content.replace(/^```\s*json\s*/i, '');
  content = content.replace(/^```\s*/i, '');
  content = content.replace(/```\s*$/i, '');
  content = content.trim();
  return JSON.parse(content);
}

function writeJsonFile(path: string, data: unknown, space = 2): void {
  writeFileSync(path, `${JSON.stringify(data, null, space)}\n`, 'utf-8');
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git'))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function tryFormatMetricsJson(metricsDir: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.INTELLIFLOW_SKIP_PRETTIER === '1') return;

  const repoRoot = findRepoRoot(metricsDir) ?? process.cwd();
  const glob = `${metricsDir.replaceAll('\\', '/')}/**/*.json`;

  const result = spawnSync('pnpm', ['exec', 'prettier', '--write', glob], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  if (result.error) {
    console.warn(`[data-sync] Prettier formatting skipped: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    console.warn(
      `[data-sync] Prettier formatting failed (exit ${result.status}).\n${result.stderr || result.stdout}`
    );
  }
}

export interface SyncResult {
  success: boolean;
  filesUpdated: string[];
  errors: string[];
  summary: {
    tasksProcessed: number;
    filesWritten: number;
    timeElapsed: number;
  };
}

/**
 * Sync all metrics files from CSV (Single Source of Truth)
 */
export function syncMetricsFromCSV(csvPath: string, metricsDir: string): SyncResult {
  const startTime = Date.now();
  const filesUpdated: string[] = [];
  const errors: string[] = [];

  try {
    // Read and parse CSV
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as any[];

    // Update all metrics files
    updateAllMetricsFiles(tasks, metricsDir, filesUpdated, errors);
    tryFormatMetricsJson(metricsDir);

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

function updateAllMetricsFiles(
  tasks: any[],
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

  // Update individual task files for Sprint 0
  const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
  for (const task of sprint0Tasks) {
    const taskResult = safeUpdate(
      () => updateIndividualTaskFile(task, metricsDir),
      `${task['Task ID']}.json`
    );
    if (taskResult.success) {
      filesUpdated.push(taskResult.file);
    } else {
      errors.push(`${taskResult.file}: ${taskResult.error}`);
    }
  }

  // Update phase summaries
  const phaseResult = safeUpdate(
    () => updatePhaseSummaries(sprint0Tasks, metricsDir),
    'phase summaries'
  );
  if (phaseResult.success) {
    filesUpdated.push(phaseResult.file);
  } else {
    errors.push(`${phaseResult.file}: ${phaseResult.error}`);
  }

  // Update sprint summary
  const summaryResult = safeUpdate(
    () => updateSprintSummary(sprint0Tasks, metricsDir),
    '_summary.json'
  );
  if (summaryResult.success) {
    filesUpdated.push(summaryResult.file);
  } else {
    errors.push(`${summaryResult.file}: ${summaryResult.error}`);
  }
}

function safeUpdate(
  fn: () => void,
  filename: string
): { success: boolean; file: string; error?: string } {
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

function updateSprintPlanJson(tasks: any[], metricsDir: string): void {
  const jsonPath = join(metricsDir, '_global', 'Sprint_plan.json');

  // Group tasks by section
  const tasksBySection: { [key: string]: any[] } = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    if (!tasksBySection[section]) {
      tasksBySection[section] = [];
    }

    // Map CSV fields to JSON format
    tasksBySection[section].push({
      'Task ID': task['Task ID'],
      Section: task.Section,
      Description: task.Description,
      Owner: task.Owner,
      Dependencies: task.Dependencies,
      CleanDependencies: task.CleanDependencies,
      CrossQuarterDeps: task.CrossQuarterDeps,
      'Pre-requisites': task['Pre-requisites'],
      'Definition of Done': task['Definition of Done'],
      Status: task.Status,
      KPIs: task.KPIs,
      'Target Sprint': task['Target Sprint'],
      'Artifacts To Track': task['Artifacts To Track'],
      'Validation Method': task['Validation Method'],
    });
  }

  // Write back
  writeJsonFile(jsonPath, tasksBySection, 2);
}

function updateTaskRegistry(tasks: any[], metricsDir: string): void {
  const registryPath = join(metricsDir, '_global', 'task-registry.json');
  let registry: any = {};

  // Read existing registry
  if (existsSync(registryPath)) {
    registry = readJsonTolerant(registryPath);
  }

  // Update tasks_by_status
  const tasksByStatus: { [key: string]: string[] } = {
    DONE: [],
    IN_PROGRESS: [],
    VALIDATING: [],
    BLOCKED: [],
    PLANNED: [],
    BACKLOG: [],
    FAILED: [],
    NEEDS_HUMAN: [],
    IN_REVIEW: [],
  };

  const taskDetails: { [key: string]: any } = {};

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const status = mapCsvStatusToRegistry(task.Status);

    tasksByStatus[status].push(taskId);

    // Parse dependencies from CSV (CleanDependencies field, comma-separated)
    const depsString = task.CleanDependencies || task.Dependencies || '';
    const dependencies = depsString
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0);

    // Parse artifacts from CSV
    const artifactsString = task['Artifacts To Track'] || '';
    const artifacts = artifactsString
      .split(',')
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);

    // Update task details (preserve additional fields if they exist)
    const existingDetails = registry.task_details?.[taskId];
    taskDetails[taskId] = existingDetails
      ? {
          ...existingDetails,
          section: task.Section,
          description: task.Description,
          owner: task.Owner,
          status,
          sprint:
            task['Target Sprint'] === 'Continuous'
              ? -1
              : Number.parseInt(task['Target Sprint'], 10) || 0,
          dependencies,
          artifacts,
          kpis: task.KPIs || '',
          definition_of_done: task['Definition of Done'] || '',
          validation: task['Validation Method'] || '',
          prerequisites: task['Pre-requisites'] || '',
        }
      : {
          section: task.Section,
          description: task.Description,
          owner: task.Owner,
          status,
          sprint:
            task['Target Sprint'] === 'Continuous'
              ? -1
              : Number.parseInt(task['Target Sprint'], 10) || 0,
          dependencies,
          artifacts,
          kpis: task.KPIs || '',
          definition_of_done: task['Definition of Done'] || '',
          validation: task['Validation Method'] || '',
          prerequisites: task['Pre-requisites'] || '',
        };
  }

  // Update sprint stats for sprint 0
  const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
  const sprint0Stats = {
    total_tasks: sprint0Tasks.length,
    completed: sprint0Tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length,
    in_progress: sprint0Tasks.filter((t) => t.Status === 'In Progress').length,
    validating: sprint0Tasks.filter((t) => t.Status === 'Validating').length,
    blocked: sprint0Tasks.filter((t) => t.Status === 'Blocked').length,
    planned: sprint0Tasks.filter((t) => t.Status === 'Planned').length,
    backlog: sprint0Tasks.filter((t) => t.Status === 'Backlog').length,
    failed: sprint0Tasks.filter((t) => t.Status === 'Failed').length,
    needs_human: sprint0Tasks.filter((t) => t.Status === 'Needs Human').length,
    in_review: sprint0Tasks.filter((t) => t.Status === 'In Review').length,
  };

  // Merge with existing registry
  registry.last_updated = new Date().toISOString();
  registry.tasks_by_status = tasksByStatus;
  registry.task_details = taskDetails;

  if (!registry.sprints) registry.sprints = {};
  registry.sprints['sprint-0'] = sprint0Stats;

  writeJsonFile(registryPath, registry, 2);
}

function updateIndividualTaskFile(task: any, metricsDir: string): void {
  const taskId = task['Task ID'];

  // Find the task file
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const taskFile = findTaskFile(taskId, sprint0Dir);

  if (!taskFile) {
    throw new Error(`Task file not found for ${taskId}`);
  }

  // Read existing task data
  const taskData = readJsonTolerant(taskFile);

  // Update status
  const newStatus = mapCsvStatusToIndividual(task.Status);
  taskData.status = newStatus;

  // Update timestamps if completed
  if (newStatus === 'DONE' && !taskData.completed_at) {
    taskData.completed_at = new Date().toISOString();
    if (!taskData.started_at) {
      taskData.started_at = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
    }
    taskData.actual_duration_minutes = taskData.target_duration_minutes || 15;
  }

  // Update description if changed
  if (task.Description) {
    taskData.description = task.Description;
  }

  writeJsonFile(taskFile, taskData, 2);
}

function findTaskFile(taskId: string, baseDir: string): string | null {
  const search = (dir: string): string | null => {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const found = search(fullPath);
        if (found) return found;
      } else if (entry.name === `${taskId}.json`) {
        return fullPath;
      }
    }

    return null;
  };

  return search(baseDir);
}

function updatePhaseSummaries(tasks: any[], metricsDir: string): void {
  // Group tasks by phase
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const phases = [
    'phase-0-initialisation',
    'phase-1-ai-foundation',
    'phase-2-parallel',
    'phase-3-dependencies',
    'phase-4-final-setup',
    'phase-5-completion',
  ];

  for (const phase of phases) {
    const phaseDir = join(sprint0Dir, phase);
    const summaryPath = join(phaseDir, '_phase-summary.json');

    if (!existsSync(summaryPath)) continue;

    const summary = readJsonTolerant(summaryPath);

    // Count tasks in this phase
    const phaseTasks: any[] = [];
    const searchPhase = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name !== '_phase-summary.json'
        ) {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.phase === phase) {
            phaseTasks.push(taskData);
          }
        } else if (entry.isDirectory()) {
          searchPhase(fullPath);
        }
      }
    };

    searchPhase(phaseDir);

    // Calculate aggregated metrics
    const done = phaseTasks.filter((t) => t.status === 'DONE').length;
    const in_progress = phaseTasks.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'VALIDATING'
    ).length;
    const blocked = phaseTasks.filter(
      (t) => t.status === 'BLOCKED' || t.status === 'NEEDS_HUMAN' || t.status === 'FAILED'
    ).length;
    const not_started = phaseTasks.filter(
      (t) =>
        t.status === 'PLANNED' ||
        t.status === 'NOT_STARTED' ||
        t.status === 'BACKLOG' ||
        t.status === 'IN_REVIEW'
    ).length;

    summary.aggregated_metrics = {
      total_tasks: phaseTasks.length,
      done,
      in_progress,
      blocked,
      not_started,
    };

    // Update timestamps
    if (done === phaseTasks.length && phaseTasks.length > 0) {
      summary.completed_at = new Date().toISOString();
    }

    writeJsonFile(summaryPath, summary, 2);
  }
}

function mapCsvStatusToRegistry(status: string): string {
  if (status === 'Done' || status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Validating') return 'VALIDATING';
  if (status === 'Blocked') return 'BLOCKED';
  if (status === 'Planned') return 'PLANNED';
  if (status === 'Backlog') return 'BACKLOG';
  if (status === 'Failed') return 'FAILED';
  if (status === 'Needs Human') return 'NEEDS_HUMAN';
  if (status === 'In Review') return 'IN_REVIEW';

  // Validation: Warn on unknown status
  console.warn(`⚠️  Unknown status "${status}" - defaulting to PLANNED`);
  return 'PLANNED';
}

function mapCsvStatusToIndividual(status: string): string {
  return mapCsvStatusToRegistry(status);
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

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate metrics consistency after sync
 */
export function validateMetricsConsistency(csvPath: string, metricsDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as any[];

    const sprint0Tasks = tasks.filter((t) => String(t['Target Sprint']) === '0');
    const csvTaskIds = new Set(sprint0Tasks.map((t) => t['Task ID']));

    // Find all JSON files
    const sprint0Dir = join(metricsDir, 'sprint-0');
    const taskJsonFiles = findAllTaskJsons(sprint0Dir);

    // Check for orphaned files
    for (const jsonFile of taskJsonFiles) {
      const content = readFileSync(jsonFile, 'utf-8');
      const taskData = JSON.parse(content);
      const taskId = taskData.task_id || taskData.taskId;

      if (!csvTaskIds.has(taskId)) {
        warnings.push(`Orphaned file detected: ${taskId} - not in CSV or not Sprint 0`);
      }
    }

    return { passed: errors.length === 0, errors, warnings };
  } catch (err) {
    return {
      passed: false,
      errors: [`Validation error: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

function findAllTaskJsons(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findAllTaskJsons(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      results.push(fullPath);
    }
  }

  return results;
}

function updateSprintSummary(tasks: any[], metricsDir: string): void {
  const summaryPath = join(metricsDir, 'sprint-0', '_summary.json');

  if (!existsSync(summaryPath)) {
    throw new Error('Sprint summary file not found');
  }

  const summary = readJsonTolerant(summaryPath);

  // Calculate task counts from CSV
  const done = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length;
  const inProgress = tasks.filter(
    (t) => t.Status === 'In Progress' || t.Status === 'Validating'
  ).length;
  const blocked = tasks.filter((t) => t.Status === 'Blocked').length;
  const backlog = tasks.filter((t) => t.Status === 'Backlog').length;
  const planned = tasks.filter((t) => t.Status === 'Planned').length;
  const failed = tasks.filter((t) => t.Status === 'Failed').length;
  const needsHuman = tasks.filter((t) => t.Status === 'Needs Human').length;
  const inReview = tasks.filter((t) => t.Status === 'In Review').length;
  const notStarted = backlog + planned + inReview;

  // Update task_summary
  summary.task_summary = {
    total: tasks.length,
    done,
    in_progress: inProgress,
    blocked: blocked + needsHuman,
    not_started: notStarted,
    failed,
  };

  // Update KPI for tasks completed
  if (summary.kpi_summary?.tasks_completed) {
    summary.kpi_summary.tasks_completed.actual = done;
    summary.kpi_summary.tasks_completed.status =
      done >= summary.kpi_summary.tasks_completed.target ? 'ON_TARGET' : 'BELOW_TARGET';
  }

  // Update automation percentage
  if (summary.kpi_summary?.automation_percentage) {
    const automationPct = tasks.length > 0 ? (done / tasks.length) * 100 : 0;
    summary.kpi_summary.automation_percentage.actual = Math.round(automationPct * 10) / 10;
  }

  // Update completed_tasks list from individual task files
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const completedTasks: Array<{ task_id: string; completed_at: string; duration_minutes: number }> =
    [];

  const searchForCompleted = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        try {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.status === 'DONE' && taskData.completed_at) {
            completedTasks.push({
              task_id: taskData.task_id || taskData.taskId || entry.name.replace('.json', ''),
              completed_at: taskData.completed_at,
              duration_minutes:
                taskData.actual_duration_minutes || taskData.target_duration_minutes || 15,
            });
          }
        } catch {
          // Skip invalid files
        }
      } else if (entry.isDirectory()) {
        searchForCompleted(fullPath);
      }
    }
  };

  searchForCompleted(sprint0Dir);

  // Sort by completion time
  completedTasks.sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  summary.completed_tasks = completedTasks;

  // Update phases array from phase directories
  const phaseIds = [
    'phase-0-initialisation',
    'phase-1-ai-foundation',
    'phase-2-parallel',
    'phase-3-dependencies',
    'phase-4-final-setup',
    'phase-5-completion',
  ];

  const updatedPhases: Array<{
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
  }> = [];

  for (const phaseId of phaseIds) {
    const phaseSummaryPath = join(sprint0Dir, phaseId, '_phase-summary.json');
    if (existsSync(phaseSummaryPath)) {
      try {
        const phaseSummary = readJsonTolerant(phaseSummaryPath);
        const metrics = phaseSummary.aggregated_metrics || {};
        const totalTasks = metrics.total_tasks || 0;
        const doneTasks = metrics.done || 0;
        const inProgressTasks = metrics.in_progress || 0;

        let status = 'NOT_STARTED';
        if (doneTasks === totalTasks && totalTasks > 0) {
          status = 'DONE';
        } else if (inProgressTasks > 0 || doneTasks > 0) {
          status = 'IN_PROGRESS';
        }

        updatedPhases.push({
          id: phaseId,
          status,
          started_at: phaseSummary.started_at || null,
          completed_at:
            status === 'DONE' ? phaseSummary.completed_at || new Date().toISOString() : null,
        });
      } catch {
        // Skip invalid phase summaries
      }
    }
  }

  if (updatedPhases.length > 0) {
    summary.phases = updatedPhases;
  }

  // Update notes
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  summary.notes = `${done}/${tasks.length} tasks DONE (${pct}%). Last synced: ${new Date().toISOString()}`;

  writeJsonFile(summaryPath, summary, 2);
}
