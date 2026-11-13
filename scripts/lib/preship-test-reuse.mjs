/**
 * Run the unit tests once per gate.
 *
 * Pre-ship's coverage step runs, project by project, every test the unit-tests
 * step would run (same scope, plus the integration project), with coverage on,
 * and fails on any failing test. Running the unit tests again afterwards
 * repeated that work: 19% of all local gate time in the week to 2026-11-13,
 * about 14 minutes on every full-scope gate. So the coverage run records each
 * project's outcome, and the unit-tests step (which now runs after it) accepts
 * that record when it is for this HEAD and this exact scope, fails on any
 * failure in it, and runs itself only the projects the coverage run does not
 * cover. Anything it cannot match (no record, another HEAD or scope, a run that
 * allowed failures, a project with no result) means it runs as before.
 */

import { unitTestRuns } from './preship-project-scope.mjs';

/** Where run-coverage.js writes the record, relative to the repo root. */
export const RESULTS_FILE = 'artifacts/coverage-parts/RESULTS.json';

/** The projects run-coverage.js runs, in order (it imports this list). */
export const COVERAGE_PROJECTS = [
  'web',
  'ai-worker',
  'domain',
  // `db` is in sonar.sources (so Sonar's new_coverage covers it via the CI
  // sharded run) and its src is NOT in sonar.coverage.exclusions, but it was
  // missing here — so pre-ship's local merged lcov had zero db coverage and
  // diff-coverage flagged every db logic change as "no lcov". Add it to close
  // the pre-ship↔Sonar parity gap. db tests are node-env unit tests (no live
  // DB) and run in ~2s.
  'db',
  'adapters',
  'application',
  'validators',
  'ui',
  'observability',
  'worker-shared',
  'events-worker',
  'ingestion-worker',
  'combined-worker',
  'architecture',
  'a11y',
  'integration',
  'api',
  // `root` runs the repo-tooling tests (scripts/**, tools/**). Tooling is in
  // sonar.sources and CI shards `--project=root`, so without it here pre-ship's
  // merged lcov had no tooling coverage and diff-coverage would score every
  // changed tooling line as "no lcov" while Sonar saw it covered.
  'root',
  // tools/scripts/subset-material-symbols.mjs's tests (#1216): CI shards this project too.
  'tools-mjs',
];

/**
 * One string per test selection, the same for both steps: 'full', or the
 * related files and fully-run projects, sorted.
 * @param {string[] | null} relatedFiles null for a full run
 * @param {string[]} fullProjects
 */
export function scopeSignature(relatedFiles, fullProjects = []) {
  if (relatedFiles === null) return 'full';
  return JSON.stringify({ files: [...relatedFiles].sort(), projects: [...fullProjects].sort() });
}

/**
 * The projects the unit-tests step would run vitest in for a scope (never
 * integration): every project for a full scope; for a related one, the fully
 * run projects, plus every other project when there are related files.
 * @param {{scope: string, files: string[], projects?: string[]}} scope
 * @param {string[]} allProjects
 */
export function unitProjects(scope, allProjects) {
  const all = allProjects.filter((p) => p !== 'integration');
  if (scope.scope === 'none') return [];
  if (scope.scope !== 'related') return all;
  if (scope.files.length > 0) return all;
  return (scope.projects ?? []).filter((p) => all.includes(p));
}

/**
 * Whether the unit-tests step may take its verdict from the coverage record.
 * @param {any} record parsed RESULTS.json, or null
 * @param {{headSha: string | null, signature: string, needed: string[]}} want
 * @returns {{reuse: false, why: string} | {reuse: true, failed: string[], covered: string[], remaining: string[]}}
 */
export function reuseVerdict(record, { headSha, signature, needed }) {
  if (!record || typeof record !== 'object') return { reuse: false, why: 'no coverage record' };
  if (!headSha || record.headSha !== headSha) {
    return { reuse: false, why: 'the coverage record is for another commit' };
  }
  if (record.signature !== signature) {
    return { reuse: false, why: 'the coverage record is for another test scope' };
  }
  if (record.allowTestFailures) {
    return { reuse: false, why: 'the coverage run allowed test failures' };
  }
  const results = Array.isArray(record.results) ? record.results : [];
  const byProject = new Map(results.map((r) => [r.project, r]));
  const coverable = needed.filter((p) => COVERAGE_PROJECTS.includes(p));
  const missing = coverable.filter((p) => !byProject.has(p));
  if (missing.length > 0) {
    return { reuse: false, why: `no coverage result for ${missing.join(', ')}` };
  }
  const failed = coverable.filter((p) => byProject.get(p).testFailures !== 0);
  return {
    reuse: true,
    failed,
    covered: coverable,
    remaining: needed.filter((p) => !COVERAGE_PROJECTS.includes(p)),
  };
}

/**
 * The vitest argument lists for the projects the coverage run does not cover,
 * in the same scope: each fully run project (or every one, for a full scope)
 * with `run`, the rest with `related` over the changed files.
 * @param {{scope: string, files: string[], projects?: string[]}} scope
 * @param {string[]} remaining
 * @returns {string[][]}
 */
export function remainingRuns(scope, remaining) {
  if (remaining.length === 0) return [];
  const full =
    scope.scope === 'related' ? remaining.filter((p) => scope.projects?.includes(p)) : remaining;
  const related = remaining.filter((p) => !full.includes(p));
  const runs = [];
  if (full.length > 0) runs.push(['run', ...full.map((p) => `--project=${p}`)]);
  if (related.length > 0 && scope.files.length > 0) {
    runs.push([
      'related',
      '--run',
      '--passWithNoTests',
      ...related.map((p) => `--project=${p}`),
      ...scope.files,
    ]);
  }
  return runs;
}

/**
 * What the unit-tests step runs: the vitest argument lists, the projects whose
 * coverage-run result failed (the step fails on them), and lines to log.
 * @param {{scope: {scope: string, files: string[], projects?: string[]},
 *          names: string[] | null, record: any, headSha: string | null}} input
 *   names: every vitest project name, or null when the project list is unreadable
 * @returns {{runs: string[][], failed: string[], log: string[]}}
 */
export function planUnitRuns({ scope, names, record, headSha }) {
  const log = [];
  let runScope = scope;
  if (names === null && scope.projects?.length) {
    log.push('cannot read the vitest project list; running the full suite');
    runScope = { scope: 'full', reason: 'project list unreadable', files: [] };
  }
  if (runScope.scope === 'none') return { runs: [], failed: [], log };
  if (names !== null) {
    const signature =
      runScope.scope === 'full'
        ? scopeSignature(null)
        : scopeSignature(runScope.files, runScope.projects ?? []);
    const verdict = reuseVerdict(record, {
      headSha,
      signature,
      needed: unitProjects(runScope, names),
    });
    if (verdict.reuse) {
      log.push(
        `taking ${verdict.covered.length} project(s) from this commit's coverage run` +
          (verdict.remaining.length ? `; running ${verdict.remaining.join(', ')} here` : '')
      );
      return { runs: remainingRuns(runScope, verdict.remaining), failed: verdict.failed, log };
    }
    log.push(`running the tests here (${verdict.why})`);
  }
  return { runs: unitTestRuns(runScope, names ?? []), failed: [], log };
}
