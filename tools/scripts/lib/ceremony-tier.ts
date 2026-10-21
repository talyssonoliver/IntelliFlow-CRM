/**
 * Ceremony Tier Detector — issue #579
 *
 * Classifies a Sprint_plan.csv task as needing the FULL MATOP ceremony
 * (multi-persona spec debate in `/spec-session` + the mandatory
 * Plan-Reviewer subagent in `/plan-session`) or the LIGHT ceremony
 * (single-persona spec, no debate rounds, no Plan-Reviewer subagent) for
 * template-following work that already has an established pattern to copy.
 *
 * Deterministic and pure — no I/O, no CSV parsing, no randomness. The CLI
 * that reads Sprint_plan.csv and the optional `.specify/memory/task-tiers.yaml`
 * manual-override file lives in `tools/scripts/ceremony-tier-audit.ts`.
 *
 * The "Lane" signal reuses `assignStoas()` (the same STOA assignment
 * `/exec` already uses for MATOP) rather than re-deriving it from the
 * `Owner` column text, so ceremony-tier agrees with the rest of the
 * pipeline about what a task's lane is, and works even on rows whose
 * `Owner` field has no "(STOA-*)" suffix.
 *
 * Decision boundary documented in
 * `.agents/skills/full-pipeline/references/ceremony-tier.md` — keep both
 * in sync; that doc is also where the "why" for each threshold lives.
 *
 * MATOP/STOA gate assignment in `/exec` (typecheck, test, lint, build, and
 * the STOA-specific correctness gates) is deliberately OUT OF SCOPE here.
 * Those are correctness validation, not ceremony, and stay full regardless
 * of tier — see the reference doc's "Out of scope" section.
 *
 * @module tools/scripts/lib/ceremony-tier
 */

import { assignStoas } from './workflow/validation';
import type { TaskRecord, StoaType } from './workflow/types';
import type { SprintTask } from './validation-utils';

export type CeremonyTier = 'light' | 'full';

/** A manual override value from `.specify/memory/task-tiers.yaml`. `'auto'` (or an
 * absent entry) defers to the heuristic. */
export type TierOverride = 'light' | 'full' | 'auto';

/** Lanes whose work is, by repo convention, template-following (see
 * `STOA_PREFIX_RULES` in `tools/scripts/lib/workflow/config.ts`: `PG-*` and
 * `IFC-*` — page components and core CRM features built from an
 * established pattern). Security/Quality/Intelligence/Automation lanes are
 * never template-following — they require fresh judgment every time. */
export const TEMPLATE_FOLLOWING_LANES: ReadonlySet<StoaType> = new Set<StoaType>([
  'Foundation',
  'Domain',
]);

/** Condition (b): at most this many dependencies, and every one of them
 * must already be completed, for the dependency check to pass. */
export const MAX_LIGHT_DEPENDENCIES = 2;

/** Condition (d): the Estimate (O/M/P) "most likely" value, in hours, must
 * be at or under this for the size check to pass. */
export const MAX_LIGHT_ESTIMATE_HOURS = 6;

/** Condition (c) keywords. Case-insensitive substring match against the
 * task's Description + Definition of Done. Matches the repo's own usage
 * (`docs/planning/module-settings-playbook.md`; PG-178/182/183/184/185's
 * "follows settings/account pattern", "mirror contact-automation.ts", "MUST
 * follow ... playbook"). */
const PATTERN_KEYWORDS: readonly string[] = [
  'pattern',
  'playbook',
  'follows',
  'mirror',
  'matching the',
];

const COMPLETED_STATUSES: ReadonlySet<string> = new Set(['completed', 'done']);

export interface CeremonyTierCheck {
  id: 'lane' | 'dependencies' | 'pattern' | 'size';
  passed: boolean;
  detail: string;
}

export interface CeremonyTierHeuristicResult {
  tier: CeremonyTier;
  lane: StoaType;
  checks: CeremonyTierCheck[];
}

export interface CeremonyTierResult extends CeremonyTierHeuristicResult {
  source: 'override' | 'heuristic';
}

/** Build the exact `TaskRecord` shape `assignStoas()` expects from a
 * `SprintTask` (whose extra columns are `string | undefined` via its index
 * signature). No `as` cast — every field is defaulted explicitly. */
function toTaskRecord(task: SprintTask): TaskRecord {
  return {
    'Task ID': task['Task ID'] ?? '',
    Section: task.Section ?? '',
    Description: task.Description ?? '',
    Owner: task.Owner ?? '',
    Dependencies: task.Dependencies ?? '',
    'Pre-requisites': task['Pre-requisites'] ?? '',
    'Definition of Done': task['Definition of Done'] ?? '',
    Status: task.Status ?? '',
    KPIs: task.KPIs ?? '',
    'Target Sprint': task['Target Sprint'] ?? '',
    'Artifacts To Track': task['Artifacts To Track'] ?? '',
    'Validation Method': task['Validation Method'] ?? '',
  };
}

/** True if `status` is a completed-equivalent status, per Sprint_plan.csv's
 * actual vocabulary (`Completed`) and the workflow lib's `WorkflowStatus`
 * union (`Done` does not appear there, but is tolerated defensively since
 * older rows / exports have used it). */
export function isCompletedStatus(status: string | undefined): boolean {
  return COMPLETED_STATUSES.has((status ?? '').trim().toLowerCase());
}

/** Parse a comma-separated `Dependencies` cell into trimmed, non-empty
 * task IDs. `undefined`/empty input yields `[]`. */
export function parseDependencyIds(dependencies: string | undefined): string[] {
  if (!dependencies) return [];
  return dependencies
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Parse an `Estimate (O/M/P)` cell (e.g. `"120/240/480"`, minutes) into
 * the most-likely ("M") estimate in hours. Returns `null` if the cell is
 * missing, malformed, or the M value is not a positive number — callers
 * MUST treat `null` as "unknown size", which the heuristic below fails
 * closed on (defaults to FULL ceremony, never LIGHT). */
export function parseEstimateHours(estimate: string | undefined): number | null {
  if (!estimate) return null;
  const parts = estimate.split('/');
  if (parts.length !== 3) return null;
  const mostLikelyMinutes = Number(parts[1].trim());
  if (!Number.isFinite(mostLikelyMinutes) || mostLikelyMinutes <= 0) return null;
  return mostLikelyMinutes / 60;
}

/** True if any of the given texts (case-insensitive) reference an existing
 * pattern or playbook — see `PATTERN_KEYWORDS`. */
export function referencesExistingPattern(...texts: Array<string | undefined>): boolean {
  const haystack = texts
    .filter((t): t is string => Boolean(t))
    .join(' \n ')
    .toLowerCase();
  if (!haystack) return false;
  return PATTERN_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/**
 * Run the four deterministic conditions from issue #579's design sketch
 * against one task:
 *
 *   (a) Lane is template-following  (Foundation or Domain, via assignStoas)
 *   (b) dependencies <= 2, and every one of them is already completed
 *   (c) Description/Definition of Done references an existing pattern
 *   (d) Estimate (O/M/P) most-likely value <= 6 hours
 *
 * `tier` is `'light'` only when ALL FOUR pass — this is an AND, not a
 * score — a single failing condition (e.g. 3 dependencies, or a brand-new
 * pattern) is enough to require the full ceremony. This fails closed: an
 * unparseable estimate or an unresolved dependency counts as a failure,
 * never a pass.
 *
 * `statusByTaskId` must contain every task's Status, keyed by exact
 * `Task ID` (case-sensitive, matching the CSV) — used to check condition
 * (b)'s "previously-completed" requirement. Pass the full
 * Sprint_plan.csv in by Task ID; a dependency missing from the map is
 * treated as not-completed (fails closed).
 */
export function classifyCeremonyTierHeuristic(
  task: SprintTask,
  statusByTaskId: ReadonlyMap<string, string>
): CeremonyTierHeuristicResult {
  const lane = assignStoas(toTaskRecord(task)).primaryStoa;
  const laneOk = TEMPLATE_FOLLOWING_LANES.has(lane);
  const checks: CeremonyTierCheck[] = [
    {
      id: 'lane',
      passed: laneOk,
      detail: `Lane=${lane} (${laneOk ? 'template-following' : 'not template-following'})`,
    },
  ];

  const depIds = parseDependencyIds(task.Dependencies);
  const unresolvedDeps = depIds.filter((id) => !isCompletedStatus(statusByTaskId.get(id)));
  const depsOk = depIds.length <= MAX_LIGHT_DEPENDENCIES && unresolvedDeps.length === 0;
  checks.push({
    id: 'dependencies',
    passed: depsOk,
    detail:
      `${depIds.length} dependency(ies) (max ${MAX_LIGHT_DEPENDENCIES}), ` +
      `${unresolvedDeps.length} not previously-completed` +
      (unresolvedDeps.length > 0 ? `: ${unresolvedDeps.join(', ')}` : ''),
  });

  const patternOk = referencesExistingPattern(task.Description, task['Definition of Done']);
  checks.push({
    id: 'pattern',
    passed: patternOk,
    detail: patternOk
      ? 'Description/Definition of Done references an existing pattern or playbook'
      : 'No pattern/playbook reference found in Description or Definition of Done',
  });

  const hours = parseEstimateHours(task['Estimate (O/M/P)']);
  const sizeOk = hours !== null && hours <= MAX_LIGHT_ESTIMATE_HOURS;
  checks.push({
    id: 'size',
    passed: sizeOk,
    detail:
      hours === null
        ? `Estimate (O/M/P) "${task['Estimate (O/M/P)'] ?? ''}" is missing or unparseable — defaulting to FULL`
        : `Most-likely estimate ${hours.toFixed(1)}h (max ${MAX_LIGHT_ESTIMATE_HOURS}h)`,
  });

  const tier: CeremonyTier = checks.every((check) => check.passed) ? 'light' : 'full';
  return { tier, lane, checks };
}

/**
 * Resolve the ceremony tier for one task: a manual `light`/`full` override
 * in `.specify/memory/task-tiers.yaml` always wins (and short-circuits the
 * heuristic, with an empty `checks` list — the override IS the reason);
 * `'auto'` or no entry at all defers to `classifyCeremonyTierHeuristic`.
 */
export function resolveCeremonyTier(
  task: SprintTask,
  statusByTaskId: ReadonlyMap<string, string>,
  overrides?: ReadonlyMap<string, TierOverride>
): CeremonyTierResult {
  const override = overrides?.get(task['Task ID']);
  if (override === 'light' || override === 'full') {
    return {
      tier: override,
      lane: assignStoas(toTaskRecord(task)).primaryStoa,
      checks: [],
      source: 'override',
    };
  }
  return { ...classifyCeremonyTierHeuristic(task, statusByTaskId), source: 'heuristic' };
}
