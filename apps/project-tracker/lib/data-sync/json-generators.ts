/**
 * JSON File Generators
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskRecord } from './types';
import { mapCsvStatusToRegistry, parseDependencies, parseArtifacts } from './csv-mapping';
import { readJsonTolerant, writeJsonFile, writeJsonFileStable } from './file-io';

/**
 * Update Sprint_plan.json grouped by section
 */
export function updateSprintPlanJson(tasks: TaskRecord[], metricsDir: string): void {
  const jsonPath = join(metricsDir, '_global', 'Sprint_plan.json');

  const tasksBySection: { [key: string]: any[] } = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    if (!tasksBySection[section]) {
      tasksBySection[section] = [];
    }

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
      Cadence: task.Cadence || '',
    });
  }

  writeJsonFile(jsonPath, tasksBySection, 2);
}

/** Sprint number from the CSV "Target Sprint" cell ("Continuous" → -1). */
function parseSprintNumber(task: TaskRecord): number {
  if (task['Target Sprint'] === 'Continuous') return -1;
  return Number.parseInt(task['Target Sprint'] || '0', 10) || 0;
}

/** Build a task-registry detail, merging over any existing entry. */
function buildTaskDetail(
  task: TaskRecord,
  status: string,
  dependencies: string[],
  artifacts: string[],
  existingDetails: Record<string, unknown> | undefined
): Record<string, unknown> {
  const derived = {
    section: task.Section,
    description: task.Description,
    owner: task.Owner,
    status,
    sprint: parseSprintNumber(task),
    dependencies,
    artifacts,
    kpis: task.KPIs || '',
    definition_of_done: task['Definition of Done'] || '',
    validation: task['Validation Method'] || '',
    prerequisites: task['Pre-requisites'] || '',
    cadence: task.Cadence || '',
  };
  return existingDetails ? { ...existingDetails, ...derived } : derived;
}

/** Lowest sprint with a non-DONE task; falls back to the highest known sprint. */
function deriveActiveSprint(
  taskDetails: Record<string, { status: string; sprint: number }>
): number {
  const nonDoneSprints = new Set<number>();
  let highestSprint = 0;
  for (const detail of Object.values(taskDetails)) {
    if (typeof detail.sprint === 'number' && detail.sprint >= 0) {
      if (detail.sprint > highestSprint) highestSprint = detail.sprint;
      if (detail.status !== 'DONE') nonDoneSprints.add(detail.sprint);
    }
  }
  return nonDoneSprints.size > 0 ? Math.min(...nonDoneSprints) : highestSprint;
}

/**
 * Update task-registry.json
 */
export function updateTaskRegistry(tasks: TaskRecord[], metricsDir: string): void {
  const registryPath = join(metricsDir, '_global', 'task-registry.json');
  let registry: any = {};

  if (existsSync(registryPath)) {
    registry = readJsonTolerant(registryPath);
  }

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
    const status = mapCsvStatusToRegistry(task.Status || '');

    tasksByStatus[status].push(taskId);

    const dependencies = parseDependencies(task.CleanDependencies || task.Dependencies || '');
    const artifacts = parseArtifacts(task['Artifacts To Track'] || '');

    taskDetails[taskId] = buildTaskDetail(
      task,
      status,
      dependencies,
      artifacts,
      registry.task_details?.[taskId]
    );
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

  const activeSprint = deriveActiveSprint(taskDetails);

  registry.last_updated = new Date().toISOString();
  registry.total_tasks = tasks.length;
  registry.active_sprint = `sprint-${activeSprint}`;
  registry.current_sprint = activeSprint;
  registry.tasks_by_status = tasksByStatus;
  registry.task_details = taskDetails;

  if (!registry.sprints) registry.sprints = {};
  registry.sprints['sprint-0'] = sprint0Stats;

  // last_updated is a freshness stamp only — carry it forward when nothing else
  // changed so a no-op sync leaves the registry untouched (ADR-066).
  writeJsonFileStable(registryPath, registry, ['last_updated'], 2);
}
