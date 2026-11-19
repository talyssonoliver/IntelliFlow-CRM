/**
 * Which pre-ship steps are CI-only on this PC (owner ruling 2026-11-19).
 *
 * Full builds and the full test suite run in GitHub Actions (free, the repo is public). The
 * local gate keeps quick, scoped checks only. Two things are left to CI here:
 *  - the production `build` (next build, tsup of every app): CI's required `Build` job;
 *  - a full-suite widening: when the related-only test scope turns into the whole suite
 *    (lockfile, package.json, tsconfig, vitest config, Prisma schema, test setup), the unit
 *    tests and coverage steps are CI's sharded runners' job.
 * PRESHIP_FULL_BUILD=1 and PRESHIP_FULL_TESTS=1 still force them locally; under CI nothing
 * changes.
 */

export const FULL_BUILD_ENV = 'PRESHIP_FULL_BUILD';
export const FULL_TESTS_ENV = 'PRESHIP_FULL_TESTS';

/** The line printed for a step that is left to CI. */
export const ciGuardLine = (job) => `skipped locally, CI is the guard (${job})`;

/**
 * @param {{isCI: boolean, env: Record<string, string | undefined>}} opts
 * @returns {boolean} true when the production build is left to CI
 */
export function localBuildIsCiOnly({ isCI, env }) {
  return !isCI && env[FULL_BUILD_ENV] !== '1';
}

/**
 * @param {{isCI: boolean, env: Record<string, string | undefined>, scope: string}} opts
 *   scope is the resolved test scope ('full' | 'related' | 'none')
 * @returns {boolean} true when a full-suite run is left to CI
 */
export function localFullSuiteIsCiOnly({ isCI, env, scope }) {
  return !isCI && env[FULL_TESTS_ENV] !== '1' && scope === 'full';
}
