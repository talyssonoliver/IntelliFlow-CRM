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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * Read the canonical task-tracking.json for a task at a specific sprint, or `{}` if none exists.
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

/** Read one task-tracking.json at a known sprint; throws (never returns null) if it is corrupt. */
function readTaskTrackingAt(
  sprintsRoot: string,
  sprintNum: number,
  taskId: string
): { sprintNum: number; data: any } | null {
  const p = join(sprintsRoot, `sprint-${sprintNum}`, 'attestations', taskId, 'task-tracking.json');
  if (!existsSync(p)) return null;
  try {
    return { sprintNum, data: JSON.parse(readFileSync(p, 'utf8')) };
  } catch (err) {
    // A PRESENT-but-corrupt record must SURFACE, never be misread as "no record". Returning null
    // would make buildIndividualTaskFile throw "not found" (swallowed by the orchestrator) and
    // silently DROP a task that has canonical evidence. Throw with context so the sync reports it
    // (orchestrator collects it in errors[]; the message does not contain "not found", so it is
    // not treated as an absent/backlog task).
    throw new Error(
      `task-tracking.json for ${taskId} at ${p} exists but is unparseable: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  }
}

/**
 * Locate a task's canonical task-tracking.json and return its sprint number + parsed data, or
 * null if the task has no canonical operational record (a backlog task that should NOT get a
 * generated per-task file).
 *
 * Resolution is DETERMINISTIC and authoritative: the CSV Target Sprint (`preferredSprint`) is
 * checked first, so a task whose record exists in two sprint dirs (real data: IFC-025 in sprint-6
 * AND sprint-14, IFC-198 in sprint-13 AND sprint-29) always resolves to its CSV sprint rather than
 * whatever order `readdirSync` happens to yield (which differs across filesystems). Only if the
 * CSV sprint has no record do we scan the remaining sprints in numeric order (covers the handful
 * of historically misfiled tasks whose record sprint ≠ CSV sprint). This makes the generated tree
 * reproducible from .specify alone on a fresh checkout (the per-task tree is gitignored).
 */
export function findTaskTracking(
  repoRoot: string,
  taskId: string,
  preferredSprint?: number
): { sprintNum: number; data: any } | null {
  const sprintsRoot = join(repoRoot, '.specify', 'sprints');
  if (!existsSync(sprintsRoot)) return null;

  if (preferredSprint !== undefined) {
    const hit = readTaskTrackingAt(sprintsRoot, preferredSprint, taskId);
    if (hit) return hit;
  }

  const otherSprints = readdirSync(sprintsRoot)
    .map((e) => /^sprint-(\d+)$/.exec(e))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => n !== preferredSprint)
    .sort((a, b) => a - b);
  for (const sprintNum of otherSprints) {
    const hit = readTaskTrackingAt(sprintsRoot, sprintNum, taskId);
    if (hit) return hit;
  }
  return null;
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
