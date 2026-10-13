/**
 * Ceremony Tier manual-override config — issue #579.
 *
 * Loads `.specify/memory/task-tiers.yaml`, the manual-pin alternative the
 * issue allowed in place of a new Sprint_plan.csv column (adding a column
 * to the single source of truth would require regenerating every
 * `Sprint_plan_*.csv` split, the task-registry/task-tracking JSON
 * derivations, and the schemas in
 * `apps/project-tracker/docs/metrics/schemas/` — out of scope for a
 * detector that most tasks will never need to override). It lives under
 * `.specify/memory/` (not `.specify/` directly) because `.gitignore` blocks
 * `.specify/*` except for the `.specify/memory/**` and `.specify/sprints/**`
 * carve-outs — `.specify/memory/` is already documented there as the home
 * for "durable governance docs" (`Framework.md`, `constitution.md`), which
 * is exactly what a tracked, PR-reviewed override file is.
 *
 * The file is optional. A missing file, or one with no `overrides` key,
 * yields an empty map, and every task falls through to the heuristic in
 * `./ceremony-tier.ts`.
 *
 * @module tools/scripts/lib/ceremony-tier-config
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { TierOverride } from './ceremony-tier';

export const TASK_TIERS_CONFIG_PATH = '.specify/memory/task-tiers.yaml';

const VALID_OVERRIDES: ReadonlySet<string> = new Set(['light', 'full', 'auto']);

interface TaskTiersFile {
  overrides?: Record<string, unknown>;
}

/**
 * Load `.specify/memory/task-tiers.yaml` from `repoRoot` and return its
 * `overrides` map as `Task ID -> TierOverride`. Task IDs are normalized to
 * upper-case + trimmed so `pg-999` and `PG-999 ` both match the CSV's
 * `PG-999`. Unrecognized override values (anything other than
 * `light`/`full`/`auto`, case-insensitively) are dropped rather than
 * throwing, so one typo in the config can't crash the audit — it just
 * leaves that task on the heuristic, which is the safe direction to fail
 * in (see `classifyCeremonyTierHeuristic`'s fail-closed doc comment).
 */
export function loadTierOverrides(repoRoot: string): Map<string, TierOverride> {
  const overrides = new Map<string, TierOverride>();
  const path = join(repoRoot, TASK_TIERS_CONFIG_PATH);
  if (!existsSync(path)) return overrides;

  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as TaskTiersFile | null | undefined;
  const entries = parsed?.overrides ?? {};

  for (const [taskId, rawValue] of Object.entries(entries)) {
    const normalizedValue = String(rawValue).trim().toLowerCase();
    if (!VALID_OVERRIDES.has(normalizedValue)) continue;
    const normalizedTaskId = taskId.trim().toUpperCase();
    if (!normalizedTaskId) continue;
    overrides.set(normalizedTaskId, normalizedValue as TierOverride);
  }

  return overrides;
}
