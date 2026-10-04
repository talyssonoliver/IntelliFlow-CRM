/**
 * Diff-coverage gate logic — mirrors SonarCloud's `new_coverage` condition
 * LOCALLY so "the changed lines aren't tested enough" fails on the laptop, not
 * after a CI round. This is the gap that let PR #265 pass pre-ship's *overall*
 * ratchet floor (which a small diff barely moves) while CI's `new_coverage`
 * (coverage of the CHANGED lines, >= 80%) went red.
 *
 * How it works: intersect the lines ADDED since the merge-base with `origin/main`
 * with the per-line hit data in the merged LCOV report (the SAME lcov Sonar
 * consumes: artifacts/coverage/lcov.info), then assert covered/coverable >= 80%.
 *
 * Scope: which files count is read from sonar-project.properties
 * (`sonar.sources`, `sonar.exclusions`, `sonar.coverage.exclusions`) via
 * ./sonar-scope.mjs, so this gate and Sonar cannot disagree about scope.
 *
 * BLIND-SPOT FIX (2026-06-11, #382): a new source file with zero tests is
 * ABSENT from lcov entirely. The prior logic skipped absent files ("not in
 * coverage scope — skip, like Sonar") so a brand-new untested page like
 * contacts/[id]/page.tsx scored "100%" locally while Sonar counted every new
 * line as uncovered and failed new_coverage (IFC-256 example). The fix: a
 * coverable file that is absent from lcov is treated as 0% covered — EVERY
 * added line counts as uncovered — matching Sonar's behaviour. A file is still
 * fully skipped only when it matches sonar.coverage.exclusions.
 *
 * Kept free of process/git side effects so it is unit-tested in-process
 * (scripts/__tests__/check-diff-coverage.test.ts); the CLI wrapper
 * scripts/check-diff-coverage.mjs only wires in git, the filesystem and exit.
 */
import path from 'node:path';

// Files Sonar never measures for coverage even inside sonar.sources. Test and
// build output are also in sonar.exclusions; .d.ts and *.config.* are not, but
// carry no executable lines, so Sonar has nothing to count there either.
const ALWAYS_EXCLUDED = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(__tests__|__mocks__|migrations|generated|dist|build|\.next|node_modules)\//,
];
const INCLUDE_EXT = /\.[cm]?[jt]sx?$/;

/**
 * @param {{ sourceRoots: string[], exclusions: RegExp[], coverageExclusions: RegExp[] }} scope
 */
export function createClassifier(scope) {
  const inSources = (f) => scope.sourceRoots.some((root) => f.startsWith(`${root}/`));
  return {
    /** A JS/TS file Sonar analyses (in sonar.sources, not excluded). */
    isCoverableFile: (f) =>
      INCLUDE_EXT.test(f) &&
      inSources(f) &&
      !ALWAYS_EXCLUDED.some((re) => re.test(f)) &&
      !scope.exclusions.some((re) => re.test(f)),
    /** Sonar holds no coverage expectation for this file. */
    isSonarCoverageExcluded: (f) => scope.coverageExclusions.some((re) => re.test(f)),
  };
}

/**
 * Lines ADDED per file, from `git diff --unified=0` output.
 *
 * @param {string} diffText
 * @param {(f: string) => boolean} isCoverableFile
 * @returns {Map<string, Set<number>>}
 */
export function parseAddedLines(diffText, isCoverableFile) {
  const added = new Map();
  const cursor = { file: null, newLine: 0 };
  for (const line of diffText.split(/\r?\n/)) {
    if (readHeader(line, cursor) || cursor.file == null) continue;
    if (line.startsWith('+')) {
      if (isCoverableFile(cursor.file)) addLine(added, cursor.file, cursor.newLine);
      cursor.newLine++;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      cursor.newLine++; // context (rare with -U0); deletions only move the old side
    }
  }
  return added;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Apply a `+++ b/<file>` or `@@ … +<start> … @@` header to the cursor.
 * Returns true when the line was a header (and so carries no content).
 */
function readHeader(line, cursor) {
  if (line.startsWith('+++ ')) {
    const p = line.slice(4).replace(/^b\//, '').trim();
    cursor.file = p === '/dev/null' ? null : p;
    return true;
  }
  const hunk = HUNK_HEADER.exec(line);
  if (hunk) {
    cursor.newLine = Number(hunk[1]);
    return true;
  }
  return false;
}

function addLine(added, file, lineNo) {
  if (!added.has(file)) added.set(file, new Set());
  added.get(file).add(lineNo);
}

/**
 * Per-file per-line hit counts from an lcov report, keyed by repo-relative path.
 *
 * @param {string} lcovText
 * @param {string} root repo root, forward slashes
 * @returns {Map<string, Map<number, number>>}
 */
export function parseLcov(lcovText, root) {
  const lineHits = new Map();
  let cur = null;
  for (const line of lcovText.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      let f = line.slice(3).trim().replaceAll('\\', '/');
      if (f.startsWith(`${root}/`)) f = f.slice(root.length + 1);
      cur = f.replace(/^\.\//, '');
      if (!lineHits.has(cur)) lineHits.set(cur, new Map());
    } else if (line.startsWith('DA:') && cur) {
      const [ln, hits] = line.slice(3).split(',');
      lineHits.get(cur).set(Number(ln), Number(hits));
    } else if (line === 'end_of_record') {
      cur = null;
    }
  }
  return lineHits;
}

/**
 * Intersect added lines with lcov hits.
 *
 * @param {Map<string, Set<number>>} added
 * @param {Map<string, Map<number, number>>} lineHits
 * @param {(f: string) => boolean} isSonarCoverageExcluded
 */
export function computeDiffCoverage(added, lineHits, isSonarCoverageExcluded) {
  let coverable = 0;
  let covered = 0;
  const perFile = [];
  for (const [file, lines] of added) {
    if (isSonarCoverageExcluded(file)) continue;
    const hits = lineHits.get(file);
    if (!hits) {
      // Coverable but ABSENT from lcov: no test loads it, so Sonar counts every
      // new line as uncovered (#382).
      coverable += lines.size;
      perFile.push({ file, fCov: 0, fTot: lines.size, absent: true });
      continue;
    }
    let fCov = 0;
    let fTot = 0;
    for (const ln of lines) {
      if (!hits.has(ln)) continue; // not an executable line
      fTot++;
      if (hits.get(ln) > 0) fCov++;
    }
    if (fTot > 0) {
      coverable += fTot;
      covered += fCov;
      perFile.push({ file, fCov, fTot });
    }
  }
  return { coverable, covered, perFile };
}

/**
 * The whole gate. Returns the process exit code.
 *
 * @param {object} io
 * @param {string} io.root repo root, forward slashes
 * @param {{ sourceRoots: string[], exclusions: RegExp[], coverageExclusions: RegExp[] }} io.scope
 * @param {Record<string, string | undefined>} io.env
 * @param {(cmd: string, args: string[]) => { status: number | null, stdout: string }} io.sh
 * @param {(p: string) => string | null} io.readFile returns null when the file is missing
 * @param {(msg: string) => void} io.log
 * @param {(msg: string) => void} io.error
 * @returns {number}
 */
export function runDiffCoverage({ root, scope, env, sh, readFile, log, error }) {
  const min = Number(env.DIFF_COVER_MIN ?? 80);
  const baseRef = env.DIFF_COVER_BASE || 'origin/main';
  const lcov = env.DIFF_COVER_LCOV || 'artifacts/coverage/lcov.info';
  const { isCoverableFile, isSonarCoverageExcluded } = createClassifier(scope);

  const mb = sh('git', ['merge-base', 'HEAD', baseRef]);
  const base = mb.status === 0 ? mb.stdout.trim() : baseRef;
  const diff = sh('git', ['diff', '--unified=0', '--no-color', base, 'HEAD']);
  if (diff.status !== 0) {
    error(`::error::check-diff-coverage: git diff against ${baseRef} failed (is it fetched?).`);
    return 1;
  }

  const added = parseAddedLines(diff.stdout, isCoverableFile);
  if (added.size === 0) {
    log('check-diff-coverage: no coverable source lines changed — PASS.');
    return 0;
  }

  const lcovText = readFile(path.isAbsolute(lcov) ? lcov : path.join(root, lcov));
  if (lcovText == null) {
    error(`::error::check-diff-coverage: ${lcov} missing — run the coverage step first.`);
    return 1;
  }

  const { coverable, covered, perFile } = computeDiffCoverage(
    added,
    parseLcov(lcovText, root),
    isSonarCoverageExcluded
  );
  if (coverable === 0) {
    log('check-diff-coverage: no changed lines are in coverage scope — PASS.');
    return 0;
  }

  const pct = (covered / coverable) * 100;
  perFile.sort((a, b) => a.fCov / a.fTot - b.fCov / b.fTot);
  log(`check-diff-coverage: new-line coverage vs ${baseRef} (floor ${min}%):\n`);
  for (const f of perFile) {
    const fp = (f.fCov / f.fTot) * 100;
    const tag = f.absent ? '  [no lcov — file has no tests]' : '';
    log(
      `  ${fp >= min ? '✓' : '✗'} ${fp.toFixed(1).padStart(5)}%  ${f.fCov}/${f.fTot}  ${f.file}${tag}`
    );
  }
  log(`\n  TOTAL new_coverage: ${pct.toFixed(1)}%  (${covered}/${coverable} lines)`);

  if (pct < min) {
    error(
      `::error::Diff coverage ${pct.toFixed(1)}% is below the ${min}% floor — add tests for the changed lines (mirrors Sonar new_coverage).`
    );
    return 1;
  }
  log(`✅ Diff coverage meets the ${min}% floor.`);
  return 0;
}
