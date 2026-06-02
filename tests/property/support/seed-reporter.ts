/**
 * Deterministic seed reporting & replay.
 *
 * fast-check prints the `seed` and `path` of any failing property in its default
 * failure message. To turn that into a one-command replay we:
 *   1. Read `FC_SEED` (and optional `FC_PATH`) from the environment and feed them
 *      back into fast-check's global config (see `support/setup.ts`), so a CI
 *      failure reproduces byte-for-byte locally.
 *   2. Expose `replayCommand()` to render the exact command an engineer should
 *      run, used by the replay guide and (optionally) failure annotations.
 *
 * @module tests/property/support/seed-reporter
 */

import { resolveTier, type Tier } from './config';

/** The pinned replay seed, if `FC_SEED` is set to a finite number; else undefined. */
export function activeSeed(): number | undefined {
  const raw = process.env.FC_SEED;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** The pinned replay path, if `FC_PATH` is set; else undefined. */
export function activePath(): string | undefined {
  const raw = process.env.FC_PATH;
  return raw === undefined || raw === '' ? undefined : raw;
}

/**
 * Render the copy-paste command that reproduces a specific counterexample.
 * `seed`/`path` come straight from the fast-check failure banner.
 */
export function replayCommand(seed: number, path?: string, tier: Tier = resolveTier()): string {
  const pathPart = path ? ` FC_PATH=${path}` : '';
  return `FC_TIER=${tier} FC_SEED=${seed}${pathPart} pnpm test:property`;
}

/** Short human banner describing the active run, logged once per test file. */
export function runBanner(): string {
  const seed = activeSeed();
  const tier = resolveTier();
  return seed !== undefined
    ? `[property] tier=${tier} seed=${seed} (REPLAY)`
    : `[property] tier=${tier} seed=random`;
}
