/**
 * Tier-aware fast-check configuration.
 *
 * The property suite runs in three tiers controlled by the `FC_TIER` env var:
 *   - smoke    (PR gate)      : low run count, fast, deterministic-friendly
 *   - standard (main branch)  : normal run count
 *   - stress   (nightly only) : high run count + time budget
 *
 * Run count is the ONLY thing that changes per tier — the properties themselves
 * are identical, so a failure in any tier reproduces in every other tier given
 * the same seed. See `docs/claude-refs/property-test-replay.md`.
 *
 * @module tests/property/support/config
 */

export type Tier = 'smoke' | 'standard' | 'stress';

/** Resolve the active tier from `FC_TIER` (defaults to smoke). */
export function resolveTier(): Tier {
  const raw = (process.env.FC_TIER ?? 'smoke').toLowerCase();
  if (raw === 'stress') return 'stress';
  if (raw === 'standard') return 'standard';
  return 'smoke';
}

/** Number of generated cases per property for a given tier. */
export function numRunsForTier(tier: Tier = resolveTier()): number {
  switch (tier) {
    case 'stress':
      return 1000;
    case 'standard':
      return 200;
    case 'smoke':
    default:
      return 25;
  }
}

/**
 * Wall-clock budget per property (ms). Only the stress tier is time-bounded so a
 * pathological generator cannot run for the whole nightly window. smoke/standard
 * rely on numRuns alone. `undefined` => no interrupt.
 */
export function timeLimitForTier(tier: Tier = resolveTier()): number | undefined {
  return tier === 'stress' ? 60_000 : undefined;
}

/**
 * Build a fast-check `Parameters` object for the active tier. Pass `overrides`
 * to tune a single property (e.g. a heavier numRuns for a known-thin space).
 * `endOnFailure: true` makes shrinking deterministic and keeps CI output small.
 */
export function propertyParams(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tier = resolveTier();
  const limit = timeLimitForTier(tier);
  return {
    numRuns: numRunsForTier(tier),
    endOnFailure: true,
    ...(limit !== undefined
      ? { interruptAfterTimeLimit: limit, markInterruptAsFailure: false }
      : {}),
    ...overrides,
  };
}
