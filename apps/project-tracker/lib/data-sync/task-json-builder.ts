/**
 * Per-task metrics JSON BUILDER (ADR-067 Phase 2).
 *
 * Reconstructs the derived per-task read-model (`sprint-N/<TASK>.json`) by MERGING:
 *   - CSV-derived projection from Sprint_plan.csv (section/description/owner/sprint/status/
 *     dependencies.required+all_satisfied/dependencies_resolved) — the single source of truth
 *   - the canonical OPERATIONAL + EVIDENCE content from
 *     `.specify/sprints/sprint-N/attestations/<TASK>/task-tracking.json` (everything else,
 *     verbatim: status_history, blockers, execution.*, timings, target_duration_minutes,
 *     kpis, artifacts, validations, notes, and the extra-schema fields)
 *
 * This REPLACES the legacy mutate-in-place path (task-json-updater.updateIndividualTaskFile):
 * the per-task JSON is no longer hand/agent-edited, it is generated. The no-loss guarantee is
 * proven by tools/scripts/prove-metrics-roundtrip.mjs (regenerate == committed on every
 * operational field; CSV-derived fields are authoritatively re-derived).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskRecord } from './types';
import { mapCsvStatusToIndividual, parseDependencies } from './csv-mapping';

const META_KEYS = new Set(['task_id', 'dependencies_meta', '$schema']);

/** Build the index the builder needs (dependency satisfaction is computed across all tasks). */
export function indexTasksById(tasks: TaskRecord[]): Record<string, TaskRecord> {
  const byId: Record<string, TaskRecord> = {};
  for (const t of tasks) byId[t['Task ID']] = t;
  return byId;
}

/**
 * Read the canonical task-tracking.json for a task, or `{}` if none exists (cohort C — an
 * attestation-only task with no historical operational record).
 */
export function readTaskTracking(repoRoot: string, sprintNum: number, taskId: string): any {
  const p = join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNum}`,
    'attestations',
    taskId,
    'task-tracking.json'
  );
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Pure builder: (CSV row + task-tracking) -> the per-task read-model object.
 * `csvById` is used only to compute `dependencies.all_satisfied`.
 */
export function buildTaskJson(
  task: TaskRecord,
  taskTracking: Record<string, any>,
  sprintNum: number,
  csvById: Record<string, TaskRecord>
): Record<string, any> {
  const required = parseDependencies(task.CleanDependencies || task.Dependencies || '');
  const allSatisfied = required.every((depId) => {
    const dep = csvById[depId];
    return Boolean(dep && (dep.Status === 'Done' || dep.Status === 'Completed'));
  });

  const out: Record<string, any> = {
    $schema: '../schemas/task-status.schema.json',
    task_id: task['Task ID'],
    section: task.Section,
    description: task.Description,
    owner: task.Owner,
    sprint: `sprint-${sprintNum}`,
    status: mapCsvStatusToIndividual(task.Status || ''),
    dependencies: { required, all_satisfied: allSatisfied },
  };

  const meta = taskTracking.dependencies_meta;
  if (meta && meta.verified_at !== undefined) out.dependencies.verified_at = meta.verified_at;
  if (meta && meta.notes !== undefined) out.dependencies.notes = meta.notes;

  out.dependencies_resolved = allSatisfied && required.length > 0 ? required : [];

  // Overlay every operational/evidence field verbatim from the canonical task-tracking record.
  for (const [k, v] of Object.entries(taskTracking)) {
    if (META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}
