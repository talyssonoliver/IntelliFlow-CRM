/**
 * The coverage gates may read artifacts/coverage/lcov.info only when the `coverage`
 * step produced it for this commit. The file is ignored, so it survives between runs:
 * finding it on disk proves nothing, and an older file would judge the wrong code.
 *
 * @param {object} state
 * @param {boolean} state.exists whether the file is on disk
 * @param {string | null} state.verdict the `coverage` step's verdict in this run, if reached
 * @param {boolean} state.cachedPass whether the last run for this commit passed that step
 * @returns {boolean} whether the file can be trusted
 */
export function lcovIsCurrent({ exists, verdict, cachedPass }) {
  if (!exists) return false;
  if (verdict === 'PASS' || verdict === 'CACHED_PASS') return true;
  // Not reached or not selected (`--only=diff-coverage`): the last run for this commit decides.
  if (verdict === null || verdict === 'SKIPPED_NOT_SELECTED') return cachedPass;
  return false;
}
