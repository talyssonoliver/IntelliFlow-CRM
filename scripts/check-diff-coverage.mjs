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

// Source files only; mirror Sonar's coverage exclusions (tests/configs/types/generated).
const EXCLUDE = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(__tests__|__mocks__|migrations|generated|dist|build|\.next|node_modules)\//,
];
const INCLUDE_EXT = /\.[cm]?[jt]sx?$/;
const isCoverableFile = (f) => INCLUDE_EXT.test(f) && !EXCLUDE.some((re) => re.test(f));

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
const lcovPath = path.join(root, LCOV);
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
  const hits = lineHits.get(file);
  if (!hits) continue; // not in coverage scope (excluded / no instrumentation) — skip, like Sonar
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
  console.log(
    `  ${fp >= MIN ? '✓' : '✗'} ${fp.toFixed(1).padStart(5)}%  ${f.fCov}/${f.fTot}  ${f.file}`
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
