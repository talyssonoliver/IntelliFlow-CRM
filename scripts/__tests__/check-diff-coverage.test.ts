/**
 * Acceptance test for check-diff-coverage.mjs blind-spot fix (issue #382).
 *
 * The blind spot: a brand-new source file with no tests is ABSENT from lcov.
 * The prior behaviour was to skip absent files ("not in coverage scope"), so
 * a completely-untested new page scored "100% local / 0% on SonarCloud".
 * The fix: absent files now count as 0% covered, mirroring Sonar new_coverage.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// ESM __dirname shim for .ts files run via Vitest
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

const SCRIPT = path.resolve(__dirname, '..', 'check-diff-coverage.mjs');

function runScript(lcovContent: string, env: Record<string, string> = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-cov-test-'));
  const lcovPath = path.join(tmp, 'lcov.info');
  fs.writeFileSync(lcovPath, lcovContent, 'utf8');
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, DIFF_COVER_LCOV: lcovPath, DIFF_COVER_BASE: 'origin/main', ...env },
    maxBuffer: 8 * 1024 * 1024,
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// ---------------------------------------------------------------------------
// Mirror the file-classification predicates from check-diff-coverage.mjs.
// Kept in sync with the script — a divergence here means the acceptance test
// doesn't test the real behaviour.
// ---------------------------------------------------------------------------

const EXCLUDE = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(__tests__|__mocks__|migrations|generated|dist|build|\.next|node_modules)\//,
];
const INCLUDE_EXT = /\.[cm]?[jt]sx?$/;
const SONAR_COVERAGE_EXCLUDE = [
  /^apps\/api\/src\/tracing\/example\.ts$/,
  /^apps\/project-tracker\/app\/api\//,
  /^apps\/project-tracker\/components\//,
  /^apps\/project-tracker\/lib\/data-sync\.ts$/,
  /^apps\/ai-worker\/src\/index\.ts$/,
];
const isCoverableFile = (f: string) => INCLUDE_EXT.test(f) && !EXCLUDE.some((re) => re.test(f));
const isSonarCoverageExcluded = (f: string) => SONAR_COVERAGE_EXCLUDE.some((re) => re.test(f));

// ---------------------------------------------------------------------------
// Pure intersection logic extracted for unit testing (mirrors the script patch)
// ---------------------------------------------------------------------------

interface FileEntry {
  file: string;
  fCov: number;
  fTot: number;
  absent?: boolean;
}

interface CoverageResult {
  coverable: number;
  covered: number;
  perFile: FileEntry[];
}

/** Tally hit/coverable lines for a file present in lcov. */
function tallyPresentFile(lines: Set<number>, hits: Map<number, number>) {
  let fCov = 0;
  let fTot = 0;
  for (const ln of lines) {
    if (hits.has(ln)) {
      fTot++;
      if ((hits.get(ln) ?? 0) > 0) fCov++;
    }
  }
  return { fCov, fTot };
}

/**
 * Re-implements the fixed intersection logic from check-diff-coverage.mjs.
 * Absent-from-lcov files are counted as 0% covered (the blind-spot fix).
 */
function computeCoverage(
  added: Map<string, Set<number>>,
  lineHits: Map<string, Map<number, number>>
): CoverageResult {
  let coverable = 0;
  let covered = 0;
  const perFile: FileEntry[] = [];
  for (const [file, lines] of added) {
    if (isSonarCoverageExcluded(file)) continue;
    const hits = lineHits.get(file);
    if (!hits) {
      // FIXED: absent = 0% covered (issue #382 blind spot)
      if (lines.size > 0) {
        coverable += lines.size;
        perFile.push({ file, fCov: 0, fTot: lines.size, absent: true });
      }
      continue;
    }
    const { fCov, fTot } = tallyPresentFile(lines, hits);
    if (fTot > 0) {
      coverable += fTot;
      covered += fCov;
      perFile.push({ file, fCov, fTot });
    }
  }
  return { coverable, covered, perFile };
}

// ---------------------------------------------------------------------------
// Tests: file classification
// ---------------------------------------------------------------------------

describe('check-diff-coverage: file classification', () => {
  it('classifies a new Next.js page as coverable', () => {
    expect(isCoverableFile('apps/web/src/app/contacts/[id]/page.tsx')).toBe(true);
  });

  it('does NOT classify .test.ts as coverable', () => {
    expect(isCoverableFile('apps/api/src/foo.test.ts')).toBe(false);
  });

  it('does NOT classify .d.ts as coverable', () => {
    expect(isCoverableFile('packages/domain/src/foo.d.ts')).toBe(false);
  });

  it('does NOT classify .config.ts as coverable', () => {
    expect(isCoverableFile('apps/web/vitest.config.ts')).toBe(false);
  });

  it('excludes Sonar coverage exclusion: apps/api/src/tracing/example.ts', () => {
    expect(isSonarCoverageExcluded('apps/api/src/tracing/example.ts')).toBe(true);
  });

  it('excludes Sonar coverage exclusion: project-tracker app/api routes', () => {
    expect(isSonarCoverageExcluded('apps/project-tracker/app/api/sprint-plan/route.ts')).toBe(true);
  });

  it('does NOT exclude a normal source file from Sonar coverage exclusions', () => {
    expect(isSonarCoverageExcluded('apps/web/src/app/contacts/[id]/page.tsx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: absent-from-lcov blind spot (acceptance gate for issue #382)
// ---------------------------------------------------------------------------

describe('check-diff-coverage: absent-from-lcov blind spot (issue #382)', () => {
  it('PASS when no coverable source files are changed (HEAD as base)', () => {
    const r = runScript('SF:apps/web/src/app/page.tsx\nDA:1,1\nend_of_record\n', {
      DIFF_COVER_BASE: 'HEAD',
    });
    expect(r.stdout).toMatch(
      /no coverable source lines changed|no changed lines are in coverage scope/
    );
    expect(r.status).toBe(0);
  });

  it('FAIL when a changed coverable file is absent from lcov (the blind spot)', () => {
    const lcovDummyOnly = 'SF:apps/web/src/app/dummy-only.tsx\nDA:1,1\nend_of_record\n';
    const r = runScript(lcovDummyOnly);

    if (r.stderr.includes('git diff against')) {
      console.warn('SKIP: origin/main not reachable in this environment');
      return;
    }
    const noCoverableLines =
      r.stdout.includes('no coverable source lines changed') ||
      r.stdout.includes('no changed lines are in coverage scope');
    if (noCoverableLines) {
      // No TS/TSX source lines changed in this diff — gate passes correctly.
      console.warn('INFO: no coverable source lines in diff — gate passed');
      expect(r.status).toBe(0);
      return;
    }
    // Changed files absent from lcov → must fail with [no lcov] annotation
    expect(r.stdout).toMatch(/\[no lcov/);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Diff coverage .* is below the 80%/);
  });
});

// ---------------------------------------------------------------------------
// Tests: intersection logic (pure, git-state-independent)
// ---------------------------------------------------------------------------

describe('check-diff-coverage: intersection logic with absent file', () => {
  it('counts absent-from-lcov coverable file lines as uncovered (0%)', () => {
    const added = new Map([
      ['apps/web/src/app/contacts/page.tsx', new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])],
    ]);
    const lineHits = new Map<string, Map<number, number>>();

    const { coverable, covered, perFile } = computeCoverage(added, lineHits);
    const pct = coverable > 0 ? (covered / coverable) * 100 : 100;

    expect(coverable).toBe(10);
    expect(covered).toBe(0);
    expect(pct).toBe(0);
    expect(perFile[0].absent).toBe(true);
    expect(perFile[0].fCov).toBe(0);
    expect(perFile[0].fTot).toBe(10);
  });

  it('still passes for a file that IS in lcov with all lines hit', () => {
    const added = new Map([['packages/domain/src/models/contact.ts', new Set([10, 11, 12])]]);
    const lineHits = new Map([
      [
        'packages/domain/src/models/contact.ts',
        new Map([
          [10, 5],
          [11, 3],
          [12, 1],
        ]),
      ],
    ]);

    const { coverable, covered } = computeCoverage(added, lineHits);
    expect((covered / coverable) * 100).toBe(100);
    expect(covered).toBe(3);
    expect(coverable).toBe(3);
  });

  it('skips files in Sonar coverage exclusions even when absent from lcov', () => {
    const added = new Map([['apps/api/src/tracing/example.ts', new Set([1, 2, 3])]]);
    const lineHits = new Map<string, Map<number, number>>();

    const { coverable } = computeCoverage(added, lineHits);
    expect(coverable).toBe(0); // fully skipped — no coverage expectation
  });
});
