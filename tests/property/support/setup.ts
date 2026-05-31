/**
 * Global setup for the `property` Vitest project.
 *
 * Applies the tier-aware fast-check configuration once per worker and pins the
 * replay seed when `FC_SEED` is provided. Loaded via `setupFiles` in
 * `tests/property/vitest.config.ts`.
 *
 * NOTE: we intentionally do NOT install a custom `reporter`/`asyncReporter` —
 * fast-check's default failure banner already prints `seed`, `path`, and the
 * shrunk counterexample, which is exactly the replay payload. Overriding the
 * reporter would force us to pick sync vs async and break the other kind.
 *
 * @module tests/property/support/setup
 */

import fc from 'fast-check';
import { beforeAll } from 'vitest';
import { numRunsForTier, resolveTier, timeLimitForTier } from './config';
import { activeSeed, runBanner } from './seed-reporter';

// SAFETY: when DB property tests are explicitly enabled, pin the @intelliflow/db
// singleton (used by repository-level tests) to the throwaway TEST_DATABASE_URL so
// it can never reach a dev/prod database via the ambient DATABASE_URL that the root
// Vitest config injects from .env*.
if (process.env.RUN_DB_PROPERTY_TESTS === '1' && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const tier = resolveTier();
const seed = activeSeed();
const limit = timeLimitForTier(tier);

fc.configureGlobal({
  numRuns: numRunsForTier(tier),
  endOnFailure: true,
  ...(seed !== undefined ? { seed } : {}),
  ...(limit !== undefined ? { interruptAfterTimeLimit: limit, markInterruptAsFailure: false } : {}),
});

let bannerShown = false;
beforeAll(() => {
  if (bannerShown) return;
  bannerShown = true;
  // One line per worker so CI logs show the tier/seed without spamming.
  console.log(runBanner());
});
