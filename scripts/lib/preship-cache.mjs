/**
 * Which step results from an earlier pre-ship run at the same HEAD may be reused.
 *
 * A cached PASS stands for "this step passed on this code". That holds for steps
 * whose outcome depends only on the code. It does not hold for the integration
 * suite, whose outcome also depends on live infrastructure: a run with the test
 * database or Redis down can pass having executed none of its infra-gated tests
 * (2026-10-05), and caching that pass would carry "0 executed" into every later
 * run at that HEAD. Such steps always run again.
 */

/** Steps whose pass depends on more than the code, so it is never reused. */
export const NEVER_CACHED = new Set(['integration-tests']);

/**
 * The earlier result to reuse for this step, or null to run it.
 * @param {string} stepId
 * @param {{steps?: Array<{id: string, verdict: string}>} | null | undefined} prev
 */
export function reusableResult(stepId, prev) {
  if (NEVER_CACHED.has(stepId)) return null;
  const cached = prev?.steps?.find((s) => s.id === stepId);
  return cached && cached.verdict === 'PASS' ? cached : null;
}
