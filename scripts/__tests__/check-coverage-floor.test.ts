/**
 * Coverage ratchet floor (ADR-058) — computed over PRODUCT files only, now that
 * repo tooling (scripts/, tools/) shares the merged coverage report.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FLOOR,
  istanbulPercent,
  isToolingFile,
  resolveFloor,
  resolveSummaryPath,
  runCoverageFloor,
  splitTotals,
} from '../lib/coverage-floor.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = path.resolve('/repo');
const at = (rel: string) => path.join(ROOT, rel);

/** An Istanbul json-summary entry with the same covered/total for every metric. */
const entry = (covered: number, total: number) => {
  const m = { total, covered, skipped: 0, pct: istanbulPercent(covered, total) };
  return { lines: m, statements: m, functions: m, branches: m };
};

describe('istanbulPercent', () => {
  it('floors to two decimals like istanbul-lib-coverage', () => {
    expect(istanbulPercent(2, 3)).toBe(66.66);
    expect(istanbulPercent(1, 1)).toBe(100);
  });

  it('reports an empty set as 100%', () => {
    expect(istanbulPercent(0, 0)).toBe(100);
  });
});

describe('resolveFloor', () => {
  it('defaults to the ADR-058 floor', () => {
    expect(resolveFloor({})).toEqual(DEFAULT_FLOOR);
  });

  it('takes per-metric overrides from the environment', () => {
    expect(resolveFloor({ COVERAGE_FLOOR_LINES: '85' }).lines).toBe(85);
  });
});

describe('isToolingFile', () => {
  it.each([
    ['scripts/lib/diff-coverage.mjs', true],
    ['tools/scripts/x.ts', true],
    ['apps/project-tracker/lib/validation-profile.ts', true],
    ['apps/project-tracker/app/page.tsx', false],
    ['apps/project-tracker-v2/lib/a.ts', false],
    ['apps/api/src/agent/tools/search.ts', false],
    ['apps/ai-worker/scripts/check-queue.ts', false],
    ['packages/domain/src/a.ts', false],
    ['toolsmith/a.ts', false],
  ])('%s → %s', (rel, expected) => {
    expect(isToolingFile(at(rel), ROOT)).toBe(expected);
  });

  // The CLI passes root = process.cwd(); path.relative resolves a relative
  // summary key against the cwd, so a relative key works only in that case.
  it('accepts summary keys relative to the working directory', () => {
    expect(isToolingFile('scripts/a.mjs', process.cwd())).toBe(true);
    expect(isToolingFile('apps/web/src/a.ts', process.cwd())).toBe(false);
  });
});

describe('splitTotals', () => {
  it('sums product and tooling files separately and ignores the summary total', () => {
    const r = splitTotals(
      {
        total: entry(0, 999),
        [at('apps/web/src/a.ts')]: entry(9, 10),
        [at('packages/domain/src/b.ts')]: entry(1, 10),
        [at('scripts/c.mjs')]: entry(0, 50),
        [at('tools/d.ts')]: { lines: { total: 4, covered: 1 } },
      },
      ROOT
    );
    expect(r.productFiles).toBe(2);
    expect(r.toolingFiles).toBe(2);
    expect(r.product.lines).toEqual({ total: 20, covered: 10, pct: 50 });
    expect(r.tooling.lines).toEqual({ total: 54, covered: 1, pct: 1.85 });
    expect(r.tooling.branches).toEqual({ total: 50, covered: 0, pct: 0 });
  });
});

function gate(text: string | null, env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCoverageFloor({
    summaryPath: 'summary.json',
    root: ROOT,
    env,
    readFile: () => text,
    log: (m: string) => out.push(m),
    error: (m: string) => err.push(m),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('runCoverageFloor', () => {
  it('fails when the summary is missing', () => {
    const r = gate(null);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/summary\.json missing/);
  });

  it('fails when the summary is not JSON', () => {
    const r = gate('{nope');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/could not parse summary\.json/);
  });

  it('fails when there are no per-file product entries to measure', () => {
    for (const text of ['null', JSON.stringify({ total: entry(1, 1) })]) {
      const r = gate(text);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/no per-file product entries/);
    }
  });

  it('passes on product coverage even when untested tooling would sink the overall total', () => {
    const r = gate(
      JSON.stringify({
        [at('apps/web/src/a.ts')]: entry(90, 100),
        [at('tools/big.ts')]: entry(0, 10_000),
      })
    );
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Product coverage \(1 files\)/);
    expect(r.out).toMatch(/✓ lines: 90% \(floor 80%\)/);
    expect(r.out).toMatch(
      /Tooling coverage \(1 files, scripts\/, tools\/, apps\/project-tracker\/lib\/ .*lines 0%/
    );
    expect(r.out).toMatch(/✅ Product coverage meets the ratchet floor/);
  });

  it('fails when product coverage is under the floor, naming the floor in use', () => {
    const r = gate(JSON.stringify({ [at('apps/web/src/a.ts')]: entry(84, 100) }), {
      COVERAGE_FLOOR_LINES: '85',
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/✗ lines: 84% \(floor 85%\)/);
    expect(r.out).not.toMatch(/Tooling coverage/);
    expect(r.err).toMatch(/below the ratchet floor \(78\/70\/75\/85\)/);
  });
});

describe('resolveSummaryPath', () => {
  it('defaults to the merged coverage summary under the root', () => {
    expect(resolveSummaryPath(undefined, ROOT)).toBe(
      path.join(ROOT, 'artifacts', 'coverage', 'coverage-summary.json')
    );
  });

  it('resolves a relative path against the root', () => {
    expect(resolveSummaryPath('artifacts/x/summary.json', ROOT)).toBe(
      path.join(ROOT, 'artifacts', 'x', 'summary.json')
    );
  });

  it('accepts an absolute path inside the root', () => {
    const inside = path.join(ROOT, 'a', 'summary.json');
    expect(resolveSummaryPath(inside, ROOT)).toBe(inside);
  });

  it.each([
    ['../outside.json'],
    ['artifacts/../../outside.json'],
    [path.resolve('/elsewhere/summary.json')],
    [path.resolve('/repo-sibling/summary.json')],
  ])('refuses %s, which escapes the root', (arg) => {
    expect(() => resolveSummaryPath(arg, ROOT)).toThrow(/outside the repository/);
  });
});

describe('scripts/check-coverage-floor.mjs', () => {
  const cli = (args: string[]) =>
    spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'check-coverage-floor.mjs'), ...args],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }
    );

  it('runs end to end against a summary path given on the command line', () => {
    const tmp = fs.mkdtempSync(path.join(REPO_ROOT, 'artifacts', 'cov-floor-test-'));
    try {
      const summary = path.join(tmp, 'coverage-summary.json');
      fs.writeFileSync(
        summary,
        JSON.stringify({ [path.join(REPO_ROOT, 'apps/web/src/a.ts')]: entry(1, 1) })
      );
      const r = cli([summary]);
      expect(r.stdout).toMatch(/Product coverage meets the ratchet floor/);
      expect(r.status).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses a summary path outside the repository', () => {
    const r = cli([path.join(os.tmpdir(), 'coverage-summary.json')]);
    expect(r.stderr).toMatch(/outside the repository/);
    expect(r.status).toBe(1);
  });
});
