#!/usr/bin/env node
/**
 * Diff-coverage gate — mirrors SonarCloud's `new_coverage` condition LOCALLY so
 * "the changed lines aren't tested enough" fails on the laptop, not after a CI
 * round. This is the gap that let PR #265 pass pre-ship's *overall* ratchet floor
 * (which a small diff barely moves) while CI's `new_coverage` (coverage of the
 * CHANGED lines, >= 80%) went red.
 *
 * How it works: intersect the lines ADDED since the merge-base with `origin/main`
 * with the per-line hit data in the merged LCOV report (the SAME lcov Sonar
 * consumes: artifacts/coverage/lcov.info), then assert covered/coverable >= 80%.
 *
 * BLIND-SPOT FIX (2026-06-11, #382): a new source file with zero tests is
 * ABSENT from lcov entirely. The prior logic skipped absent files ("not in
 * coverage scope — skip, like Sonar") so a brand-new untested page like
 * contacts/[id]/page.tsx scored "100%" locally while Sonar counted every new
 * line as uncovered and failed new_coverage (IFC-256 example). The fix: a
 * coverable file that is absent from lcov is now treated as 0% covered —
 * EVERY added line counts as uncovered — matching Sonar's behaviour. A file
 * is still fully skipped only when it matches sonar.coverage.exclusions (e.g.
 * apps/project-tracker/app/api/**, apps/api/src/tracing/example.ts).
 *
 * Runs AFTER the coverage step in pre-ship (it needs the lcov to exist).
 *
 * Exit: 0 meets the floor (or no coverable changed lines) · 1 below floor / no lcov.
 *
 * Env:
 *   DIFF_COVER_MIN     coverage floor, default 80 (matches Sonar new_coverage)
 *   DIFF_COVER_BASE    base ref, default origin/main
 *   DIFF_COVER_LCOV    lcov path, default artifacts/coverage/lcov.info
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MIN = Number(process.env.DIFF_COVER_MIN ?? 80);
const BASE_REF = process.env.DIFF_COVER_BASE || 'origin/main';
const LCOV = process.env.DIFF_COVER_LCOV || 'artifacts/coverage/lcov.info';

function sh(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
}

const root = (() => {
  const r = sh('git', ['rev-parse', '--show-toplevel']);
  return r.status === 0 ? r.stdout.trim().replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');
})();

// Source files only; mirror Sonar's sonar.sources + sonar.coverage.exclusions so the
// local gate operates on exactly the same file set as SonarCloud.
//
// sonar.sources in sonar-project.properties covers:
//   apps/api/src, apps/ai-worker/src, apps/web/src,
//   apps/project-tracker/{app,components,lib},
//   packages/{adapters,api-client,application,db,domain,observability,platform,ui,validators}/src
//
// Files outside those paths (scripts/, tools/, infra/, tests/, artifacts/) are NOT
// instrumented by Sonar and must be excluded here to avoid false positives on
// changed tooling/config files that will never appear in lcov.
const SONAR_SOURCE_ROOTS = [
  /^apps\/api\/src\//,
  /^apps\/ai-worker\/src\//,
  /^apps\/web\/src\//,
  /^apps\/project-tracker\/(app|components|lib)\//,
  /^packages\/(adapters|api-client|application|db|domain|observability|platform|ui|validators)\/src\//,
  // Note: apps/workers/ is intentionally excluded — it is NOT in sonar.sources
  // (sonar-project.properties lists only apps/{api,ai-worker,web,project-tracker} and packages/).
  // Workers source is excluded from both SonarCloud analysis and the lcov coverage report,
  // so treating changed worker files as coverable causes false-positive 0% failures.
];
const EXCLUDE = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(__tests__|__mocks__|migrations|generated|dist|build|\.next|node_modules)\//,
];
// Extra exclusions mirroring sonar.coverage.exclusions (paths that Sonar explicitly
// excludes from coverage measurement — absent files in these paths stay skipped).
const SONAR_COVERAGE_EXCLUDE = [
  /^apps\/api\/src\/tracing\/example\.ts$/,
  /^apps\/project-tracker\/app\/api\//,
  /^apps\/project-tracker\/components\//,
  /^apps\/project-tracker\/lib\/data-sync\.ts$/,
  /^apps\/ai-worker\/src\/index\.ts$/,
  // Mock adapters in packages/adapters/src/external/ are test-infrastructure with
  // no coverage expectation (same exclusion applied in the root vitest coverage config
  // for packages/adapters/src/external/OpenAIService.ts).
  /^packages\/adapters\/src\/external\/Mock[A-Za-z]+\.ts$/,
];
const INCLUDE_EXT = /\.[cm]?[jt]sx?$/;
const isCoverableFile = (f) =>
  INCLUDE_EXT.test(f) &&
  SONAR_SOURCE_ROOTS.some((re) => re.test(f)) &&
  !EXCLUDE.some((re) => re.test(f));
// Files in Sonar's coverage exclusion list are skipped entirely (no coverage expectation).
const isSonarCoverageExcluded = (f) => SONAR_COVERAGE_EXCLUDE.some((re) => re.test(f));

// --- base ---
const mb = sh('git', ['merge-base', 'HEAD', BASE_REF]);
const base = mb.status === 0 ? mb.stdout.trim() : BASE_REF;

// --- added lines per file (git diff -U0) ---
const diff = sh('git', ['diff', '--unified=0', '--no-color', base, 'HEAD']);
if (diff.status !== 0) {
  console.error(
    `::error::check-diff-coverage: git diff against ${BASE_REF} failed (is it fetched?).`
  );
  process.exit(1);
}
const added = new Map(); // relPath -> Set(lineNo)
{
  let file = null;
  let newLine = 0;
  for (const line of diff.stdout.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      file = p === '/dev/null' ? null : p;
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file == null) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (isCoverableFile(file)) {
        if (!added.has(file)) added.set(file, new Set());
        added.get(file).add(newLine);
      }
      newLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // deletion: old side only, new cursor unchanged
    } else if (!line.startsWith('\\')) {
      newLine++; // context (rare with -U0)
    }
  }
}

if (added.size === 0) {
  console.log('check-diff-coverage: no coverable source lines changed — PASS.');
  process.exit(0);
}

// --- lcov per-file per-line hits ---
const lcovPath = path.isAbsolute(LCOV) ? LCOV : path.join(root, LCOV);
if (!fs.existsSync(lcovPath)) {
  console.error(`::error::check-diff-coverage: ${LCOV} missing — run the coverage step first.`);
  process.exit(1);
}
const lineHits = new Map(); // relPath -> Map(line -> hits)
{
  let cur = null;
  for (const line of fs.readFileSync(lcovPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      let f = line.slice(3).trim().replace(/\\/g, '/');
      if (f.startsWith(root + '/')) f = f.slice(root.length + 1);
      f = f.replace(/^\.\//, '');
      cur = f;
      if (!lineHits.has(cur)) lineHits.set(cur, new Map());
    } else if (line.startsWith('DA:') && cur) {
      const [ln, hits] = line.slice(3).split(',');
      lineHits.get(cur).set(Number(ln), Number(hits));
    } else if (line === 'end_of_record') {
      cur = null;
    }
  }
}

// --- intersect ---
let coverable = 0;
let covered = 0;
const perFile = [];
for (const [file, lines] of added) {
  // Skip files that match Sonar's explicit coverage.exclusions — Sonar doesn't
  // count those lines, so we shouldn't either.
  if (isSonarCoverageExcluded(file)) continue;

  const hits = lineHits.get(file);

  if (!hits) {
    // File is coverable but ABSENT from lcov — this means it has NO tests at all.
    // Sonar counts every new line as uncovered (new_coverage = 0%).
    // Prior behaviour was to skip such files ("not in coverage scope"), which let
    // completely-untested new files like a Next.js page.tsx pass locally while
    // Sonar flagged them. Fix: count ALL added lines as uncovered (hits = 0).
    // (Issue #382: IFC-256 contacts/[id]/page.tsx was the trigger case.)
    const fTot = lines.size;
    if (fTot > 0) {
      coverable += fTot;
      // covered += 0  (all lines are uncovered)
      perFile.push({ file, fCov: 0, fTot, absent: true });
    }
    continue;
  }

  let fCov = 0;
  let fTot = 0;
  for (const ln of lines) {
    if (hits.has(ln)) {
      fTot++;
      if (hits.get(ln) > 0) fCov++;
    }
  }
  if (fTot > 0) {
    coverable += fTot;
    covered += fCov;
    perFile.push({ file, fCov, fTot });
  }
}

if (coverable === 0) {
  console.log('check-diff-coverage: no changed lines are in coverage scope — PASS.');
  process.exit(0);
}

const pct = (covered / coverable) * 100;
perFile.sort((a, b) => a.fCov / a.fTot - b.fCov / b.fTot);
console.log(`check-diff-coverage: new-line coverage vs ${BASE_REF} (floor ${MIN}%):\n`);
for (const f of perFile) {
  const fp = (f.fCov / f.fTot) * 100;
  const tag = f.absent ? '  [no lcov — file has no tests]' : '';
  console.log(
    `  ${fp >= MIN ? '✓' : '✗'} ${fp.toFixed(1).padStart(5)}%  ${f.fCov}/${f.fTot}  ${f.file}${tag}`
  );
}
console.log(`\n  TOTAL new_coverage: ${pct.toFixed(1)}%  (${covered}/${coverable} lines)`);

if (pct < MIN) {
  console.error(
    `::error::Diff coverage ${pct.toFixed(1)}% is below the ${MIN}% floor — add tests for the changed lines (mirrors Sonar new_coverage).`
  );
  process.exit(1);
}
console.log(`✅ Diff coverage meets the ${MIN}% floor.`);
process.exit(0);
