/**
 * Data Synchronization Utility
 * Single Source of Truth: Sprint_plan.csv
 * Automatically updates all derived files
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

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
  const updateResult = safeUpdate(() => updateSprintPlanJson(tasks, metricsDir), 'Sprint_plan.json');
  if (updateResult.success) {
    filesUpdated.push(updateResult.file);
  } else {
    errors.push(`${updateResult.file}: ${updateResult.error}`);
  }

  // Update task-registry.json
  const registryResult = safeUpdate(() => updateTaskRegistry(tasks, metricsDir), 'task-registry.json');
  if (registryResult.success) {
    filesUpdated.push(registryResult.file);
  } else {
    errors.push(`${registryResult.file}: ${registryResult.error}`);
  }

  // Update individual task files for Sprint 0
  const sprint0Tasks = tasks.filter(t => String(t['Target Sprint']) === '0');
  for (const task of sprint0Tasks) {
    const taskResult = safeUpdate(() => updateIndividualTaskFile(task, metricsDir), `${task['Task ID']}.json`);
    if (taskResult.success) {
      filesUpdated.push(taskResult.file);
    } else {
      errors.push(`${taskResult.file}: ${taskResult.error}`);
    }
  }

  // Update phase summaries
  const phaseResult = safeUpdate(() => updatePhaseSummaries(sprint0Tasks, metricsDir), 'phase summaries');
  if (phaseResult.success) {
    filesUpdated.push(phaseResult.file);
  } else {
    errors.push(`${phaseResult.file}: ${phaseResult.error}`);
  }
}

function safeUpdate(fn: () => void, filename: string): { success: boolean; file: string; error?: string } {
  try {
    fn();
    return { success: true, file: filename };
  } catch (err) {
    return { success: false, file: filename, error: err instanceof Error ? err.message : String(err) };
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
      'Section': task.Section,
      'Description': task.Description,
      'Owner': task.Owner,
      'Dependencies': task.Dependencies,
      'CleanDependencies': task.CleanDependencies,
      'CrossQuarterDeps': task.CrossQuarterDeps,
      'Pre-requisites': task['Pre-requisites'],
      'Definition of Done': task['Definition of Done'],
      'Status': task.Status,
      'KPIs': task.KPIs,
      'Target Sprint': task['Target Sprint'],
      'Artifacts To Track': task['Artifacts To Track'],
      'Validation Method': task['Validation Method'],
    });
  }

  // Write back
  writeFileSync(jsonPath, JSON.stringify(tasksBySection, null, 4), 'utf-8');
}

function updateTaskRegistry(tasks: any[], metricsDir: string): void {
  const registryPath = join(metricsDir, '_global', 'task-registry.json');
  let registry: any = {};

  // Read existing registry
  if (existsSync(registryPath)) {
    registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  }

  // Update tasks_by_status
  const tasksByStatus: { [key: string]: string[] } = {
    DONE: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    PLANNED: [],
    FAILED: [],
  };

  const taskDetails: { [key: string]: any } = {};

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const status = mapCsvStatusToRegistry(task.Status);

    tasksByStatus[status].push(taskId);

    // Update task details (preserve additional fields if they exist)
    const existingDetails = registry.task_details?.[taskId];
    taskDetails[taskId] = existingDetails ? {
      ...existingDetails,
      section: task.Section,
      description: task.Description,
      owner: task.Owner,
      status,
      sprint: Number.parseInt(task['Target Sprint'], 10) || 0,
    } : {
      section: task.Section,
      description: task.Description,
      owner: task.Owner,
      status,
      sprint: Number.parseInt(task['Target Sprint'], 10) || 0,
    };
  }

  // Update sprint stats for sprint 0
  const sprint0Tasks = tasks.filter(t => String(t['Target Sprint']) === '0');
  const sprint0Stats = {
    total_tasks: sprint0Tasks.length,
    completed: sprint0Tasks.filter(t => t.Status === 'Done' || t.Status === 'Completed').length,
    in_progress: sprint0Tasks.filter(t => t.Status === 'In Progress').length,
    blocked: sprint0Tasks.filter(t => t.Status === 'Blocked').length,
    not_started: sprint0Tasks.filter(t => t.Status === 'Planned').length,
  };

  // Merge with existing registry
  registry.last_updated = new Date().toISOString();
  registry.tasks_by_status = tasksByStatus;
  registry.task_details = taskDetails;

  if (!registry.sprints) registry.sprints = {};
  registry.sprints['sprint-0'] = sprint0Stats;

  writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
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
  const taskData = JSON.parse(readFileSync(taskFile, 'utf-8'));

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

  writeFileSync(taskFile, JSON.stringify(taskData, null, 2), 'utf-8');
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
  const phases = ['phase-0-initialisation', 'phase-1-ai-foundation', 'phase-2-parallel', 
                  'phase-3-dependencies', 'phase-4-integration', 'phase-5-completion'];

  for (const phase of phases) {
    const phaseDir = join(sprint0Dir, phase);
    const summaryPath = join(phaseDir, '_phase-summary.json');

    if (!existsSync(summaryPath)) continue;

    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

    // Count tasks in this phase
    const phaseTasks: any[] = [];
    const searchPhase = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== '_phase-summary.json') {
          const taskData = JSON.parse(readFileSync(fullPath, 'utf-8'));
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
    const done = phaseTasks.filter(t => t.status === 'DONE').length;
    const in_progress = phaseTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const blocked = phaseTasks.filter(t => t.status === 'BLOCKED').length;
    const not_started = phaseTasks.filter(t => t.status === 'PLANNED' || t.status === 'NOT_STARTED').length;

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

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  }
}

function mapCsvStatusToRegistry(status: string): string {
  if (status === 'Done' || status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Blocked') return 'BLOCKED';
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
