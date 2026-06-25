/**
 * Individual Task JSON File Operations
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { TaskRecord } from './types';
import { mapCsvStatusToIndividual, parseDependencies } from './csv-mapping';
import {
  readJsonTolerant,
  writeJsonFile,
  findTaskFile,
  findRepoRoot,
  removeOtherTaskFileCopies,
} from './file-io';
import { buildTaskJson, findTaskTracking, indexTasksById } from './task-json-builder';

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

/**
 * Build (regenerate) an individual task JSON from CSV + its canonical task-tracking.json
 * (ADR-067 Phase 2). Unlike updateIndividualTaskFile, this does NOT read/mutate the existing
 * per-task file as a source — that file is now a pure derived read-model. It writes to the
 * file's current location if one exists, otherwise to `sprint-N/<TASK>.json`.
 */
export function buildIndividualTaskFile(
  task: TaskRecord,
  metricsDir: string,
  allTasks: TaskRecord[],
  sprintNum: number
): void {
  const taskId = task['Task ID'];
  const repoRoot = findRepoRoot(metricsDir) || metricsDir;
  // Generate a per-task read-model IFF the task has a canonical operational record under
  // .specify (task-tracking.json). Backlog/never-started tasks have none and live only in the
  // aggregate (Sprint_plan.json) — surfaced as "not found" (the orchestrator swallows it).
  // Resolution prefers the CSV Target Sprint (sprintNum) so a task with records in two sprints
  // resolves deterministically; the output is a FLAT sprint-{N}/<TASK>.json at the resolved
  // record's sprint, reproducible from .specify alone on a fresh checkout (no dependence on any
  // existing file's phase-* location, which does not exist on a fresh checkout).
  const tt = findTaskTracking(repoRoot, taskId, sprintNum);
  if (!tt) {
    throw new Error(`Task file not found for ${taskId}`);
  }
  const built = buildTaskJson(task, tt.data, tt.sprintNum, indexTasksById(allTasks));
  const target = join(metricsDir, `sprint-${tt.sprintNum}`, `${taskId}.json`);
  // The sprint-{N} dir may not exist yet on a fresh checkout (the whole tree is gitignored).
  mkdirSync(dirname(target), { recursive: true });
  // Collapse any pre-existing legacy/relocated copy of this task (e.g. a phase-* file from the old
  // tracked tree) to exactly one flat file, so the recursive _summary walk never double-counts it.
  removeOtherTaskFileCopies(metricsDir, taskId, target);
  writeJsonFile(target, built, 2);
}
