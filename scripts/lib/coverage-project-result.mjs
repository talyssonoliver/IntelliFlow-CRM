/**
 * How scripts/run-coverage.js classifies and words the outcome of one project's
 * vitest run. Kept pure so the wording can be tested without running vitest.
 */

/**
 * Classify a finished project run.
 *
 * @param {object} run
 * @param {string} run.project
 * @param {number | null} run.code exit code (null when killed by a signal)
 * @param {boolean} run.timedOut the runner killed it for exceeding its cap
 * @param {number} run.timeoutMs the cap that applied
 * @param {{ numFailedTests?: number, numFailedTestSuites?: number } | null} run.report
 *   the parsed vitest JSON report, or null when there is none
 * @returns {{ project: string, code: number, testFailures: number, thresholdBreach: boolean,
 *   timedOut: boolean, timeoutMs: number }}
 *   testFailures is -1 when the failure is real but its cause is unknown
 *   (crash, or killed on timeout): never reported as green.
 */
export function classifyProjectRun({ project, code, timedOut, timeoutMs, report }) {
  const result = {
    project,
    code: code ?? 1,
    testFailures: 0,
    thresholdBreach: false,
    timedOut: Boolean(timedOut),
    timeoutMs,
  };
  if (timedOut) {
    // A killed run is incomplete whatever its (partial) report says.
    result.testFailures = -1;
    return result;
  }
  if (report) {
    result.testFailures = (report.numFailedTests || 0) + (report.numFailedTestSuites || 0);
    if (code !== 0 && result.testFailures === 0) result.thresholdBreach = true;
  } else if (code !== 0) {
    result.testFailures = -1;
  }
  return result;
}

/** The reason text for a failed project (not a threshold-only breach). */
export function describeProjectFailure(result) {
  if (result.timedOut) {
    return `timed out after ${result.timeoutMs / 60000} min (killed)`;
  }
  if (result.testFailures === -1) return `exit ${result.code} (no JSON report — early crash?)`;
  return `${result.testFailures} test failure(s), exit ${result.code}`;
}
