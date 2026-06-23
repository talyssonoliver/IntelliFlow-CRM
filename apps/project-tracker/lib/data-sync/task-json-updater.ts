/**
 * Individual Task JSON File Operations
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskRecord } from './types';
import { mapCsvStatusToIndividual, parseDependencies } from './csv-mapping';
import { readJsonTolerant, writeJsonFile, findTaskFile, findRepoRoot } from './file-io';

function classifyArtifacts(
  expectedArtifacts: string[],
  repoRoot: string
): { created: string[]; missing: string[] } {
  const created: string[] = [];
  const missing: string[] = [];
  for (const artifact of expectedArtifacts) {
    if (!artifact || artifact === null) continue;
    const artifactPath = artifact.includes('*') ? null : join(repoRoot, artifact);
    if (artifactPath && existsSync(artifactPath)) {
      created.push(artifact);
    } else if (artifact && !artifact.includes('*')) {
      missing.push(artifact);
    }
  }
  return { created, missing };
}

// applyCompletionTimestamps was REMOVED (ADR-067, anti-fabrication). It stamped
// completed_at = now, started_at = now - 15min, and actual_duration_minutes =
// target || 15 for any task flipped to DONE in the CSV — sync-time values
// masquerading as measured execution facts. Real timing is written by
// exec-metrics at actual execution start/end; sync must NEVER fabricate it.
// A CSV-only status flip leaves timing fields absent (honest "unknown").

function applyDependencySatisfied(taskData: any, task: TaskRecord, allTasks: TaskRecord[]): void {
  if (!taskData.dependencies) return;
  const requiredDeps = parseDependencies(task.CleanDependencies || task.Dependencies || '');
  const allSatisfied = requiredDeps.every((depId: string) => {
    const depTask = allTasks.find((t: TaskRecord) => t['Task ID'] === depId);
    return depTask && (depTask.Status === 'Done' || depTask.Status === 'Completed');
  });

  const prevSatisfied = taskData.dependencies.all_satisfied;
  const prevRequired: string[] = Array.isArray(taskData.dependencies.required)
    ? taskData.dependencies.required
    : [];
  const requiredChanged =
    prevRequired.length !== requiredDeps.length ||
    requiredDeps.some((dep: string, i: number) => dep !== prevRequired[i]);

  taskData.dependencies.all_satisfied = allSatisfied;
  taskData.dependencies.required = requiredDeps;

  // Only re-stamp verified_at when the satisfied-state or required set actually
  // changed (or it was never stamped). Re-deriving `new Date()` on every sync made
  // every task JSON diff on every run — the core write-cascade cause. See ADR-066.
  if (prevSatisfied !== allSatisfied || requiredChanged || !taskData.dependencies.verified_at) {
    taskData.dependencies.verified_at = new Date().toISOString();
  }

  if (allSatisfied && requiredDeps.length > 0) {
    taskData.dependencies_resolved = requiredDeps;
  }
}

function applyArtifactClassification(taskData: any, metricsDir: string): void {
  if (!taskData.artifacts) return;
  const repoRoot = findRepoRoot(metricsDir) || metricsDir;
  const expectedArtifacts = taskData.artifacts.expected || [];
  if (expectedArtifacts.some((a: any) => a !== null)) {
    const { created, missing } = classifyArtifacts(expectedArtifacts, repoRoot);
    taskData.artifacts.created = created;
    taskData.artifacts.missing = missing;
  }
}

/**
 * Update an individual task JSON file
 */
export function updateIndividualTaskFile(
  task: TaskRecord,
  metricsDir: string,
  allTasks?: TaskRecord[],
  sprintNum: number = 0
): void {
  const taskId = task['Task ID'];
  const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
  const taskFile = findTaskFile(taskId, sprintDir);

  if (!taskFile) {
    throw new Error(`Task file not found for ${taskId}`);
  }

  const taskData = readJsonTolerant(taskFile);
  const newStatus = mapCsvStatusToIndividual(task.Status || '');
  taskData.status = newStatus;

  if (task.Description) {
    taskData.description = task.Description;
  }

  if (allTasks) {
    applyDependencySatisfied(taskData, task, allTasks);
  }

  applyArtifactClassification(taskData, metricsDir);

  // NOTE (ADR-067): we do NOT synthesize a placeholder validation for DONE tasks.
  // generateDefaultValidations previously injected a fake `echo "Task X completed"`
  // run (exit_code 0, passed: true) — schema-shaped but meaningless provenance.
  // Real validation records (with actual exit codes + stdout hashes) are written
  // by exec-metrics at execution time. A DONE task with no validations stays empty
  // and is surfaced as a WARN by the Evidence-Integrity gate, not silently passed.

  writeJsonFile(taskFile, taskData, 2);
}
