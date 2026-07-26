/**
 * Unit tests for the runtime silent-skip gate (#658 — ADR-054 §9).
 *
 * Every case drives the gate through its injected seams (`loadResults`,
 * `loadRegistry`, `fileExists`, `now`) so nothing here spins up a real Vitest run
 * or touches the coverage artifacts — same approach as the sibling
 * `flaky-test-skip-gate.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeFile,
  isSilent,
  toRepoRelative,
  validateEntry,
  reconcile,
  runInfraSkipGate,
  formatReport,
  formatJobSummary,
  loadRegistry,
  loadResults,
  main,
  REASON_PATTERN,
  REGISTRY_PATH,
  type RegistryEntry,
  type FileSummary,
  type ManifestLoad,
} from '../infra-skip-gate.js';
import { resolve, join, dirname } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** 2026-07-26T00:00:00Z — before every seeded `reviewBy`. */
const NOW = Date.parse('2026-07-26T00:00:00Z');

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    file: 'tests/integration/x.test.ts',
    kind: 'infra-gated',
    maxSkipped: 5,
    reviewBy: '2026-10-31',
    reason: 'ADR-054: #658 — needs Supabase buckets.',
    ...over,
  };
}

function summary(over: Partial<FileSummary> = {}): FileSummary {
  return {
    file: 'tests/integration/x.test.ts',
    collected: 5,
    executed: 0,
    skipped: 5,
    project: 'integration',
    ...over,
  };
}

function manifest(files: FileSummary[]): ManifestLoad {
  return { status: 'ok', files };
}

const alwaysExists = () => true;

// ---------------------------------------------------------------------------
// summarizeFile / isSilent
// ---------------------------------------------------------------------------

describe('summarizeFile', () => {
  it('counts passed and failed as executed, skipped and todo as not', () => {
    const s = summarizeFile(
      'a.test.ts',
      [
        { status: 'passed' },
        { status: 'failed' },
        { status: 'skipped' },
        { status: 'todo' },
        { status: 'skipped' },
      ],
      'integration'
    );
    expect(s).toMatchObject({ collected: 5, executed: 2, skipped: 3 });
  });

  it('treats an empty file as collected 0', () => {
    expect(summarizeFile('a.test.ts', [], 'integration')).toMatchObject({
      collected: 0,
      executed: 0,
      skipped: 0,
    });
  });
});

describe('isSilent', () => {
  it('is true only when tests were collected but none executed', () => {
    expect(isSilent(summary({ collected: 5, executed: 0 }))).toBe(true);
    expect(isSilent(summary({ collected: 5, executed: 1, skipped: 4 }))).toBe(false);
  });

  it('is false for a file that collected nothing (passWithNoTests / import failure)', () => {
    expect(isSilent(summary({ collected: 0, executed: 0, skipped: 0 }))).toBe(false);
  });
});

describe('toRepoRelative', () => {
  it('normalizes a Windows absolute path to a repo-relative POSIX path', () => {
    expect(toRepoRelative('C:/repo', 'C:\\repo\\tests\\a.test.ts')).toBe('tests/a.test.ts');
  });

  it('leaves an already-relative path alone', () => {
    expect(toRepoRelative('C:/repo', 'tests/a.test.ts')).toBe('tests/a.test.ts');
  });
});

// ---------------------------------------------------------------------------
// R4 — registry grammar / shape
// ---------------------------------------------------------------------------

describe('REASON_PATTERN (ADR-054 reference grammar)', () => {
  it.each([
    'ADR-054: #658 — needs buckets',
    'ADR-054: DEFERRED pending infra',
    'ADR-054: ENG-OPS-002.R17 — pending deletion',
    'ADR-054: QUAL-006 — known flake',
  ])('accepts a concrete reference: %s', (reason) => {
    expect(REASON_PATTERN.test(reason)).toBe(true);
  });

  it.each(['because the buckets are missing', 'ADR-054: it skips locally', 'skipped for now'])(
    'rejects decoration with no reference: %s',
    (reason) => {
      expect(REASON_PATTERN.test(reason)).toBe(false);
    }
  );
});

describe('validateEntry', () => {
  const opts = { now: NOW, exists: alwaysExists };

  it('accepts a well-formed entry', () => {
    expect(validateEntry(entry(), opts)).toEqual([]);
  });

  it('R4: rejects a free-text reason', () => {
    const v = validateEntry(entry({ reason: 'it needs docker' }), opts);
    expect(v.map((x) => x.rule)).toContain('R4');
  });

  it('R4: rejects an unknown kind', () => {
    const v = validateEntry(entry({ kind: 'whatever' }), opts);
    expect(v.some((x) => x.rule === 'R4' && /invalid kind/.test(x.message))).toBe(true);
  });

  it('R4: rejects a malformed reviewBy', () => {
    const v = validateEntry(entry({ reviewBy: 'soon' }), opts);
    expect(v.some((x) => /reviewBy/.test(x.message))).toBe(true);
  });

  it('R4: rejects a negative or non-numeric maxSkipped', () => {
    expect(validateEntry(entry({ maxSkipped: -1 }), opts).some((x) => x.rule === 'R4')).toBe(true);
  });

  it('R4: rejects an entry with no file field', () => {
    const v = validateEntry({ ...entry(), file: undefined as unknown as string }, opts);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('R4');
  });

  it('R3: fails an entry past its reviewBy date', () => {
    const v = validateEntry(entry({ reviewBy: '2026-01-01' }), opts);
    expect(v.some((x) => x.rule === 'R3')).toBe(true);
  });

  it('R3: an entry is still valid THROUGH its reviewBy day', () => {
    const v = validateEntry(entry({ reviewBy: '2026-07-26' }), {
      now: Date.parse('2026-07-26T12:00:00Z'),
      exists: alwaysExists,
    });
    expect(v.some((x) => x.rule === 'R3')).toBe(false);
  });

  it('R5: fails an entry whose file no longer exists', () => {
    const v = validateEntry(entry(), { now: NOW, exists: () => false });
    expect(v.some((x) => x.rule === 'R5')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1 / R2 — reconciliation
// ---------------------------------------------------------------------------

describe('reconcile', () => {
  it('R1: flags an undeclared suite that executed nothing', () => {
    const { violations, silent } = reconcile([summary()], []);
    expect(silent).toHaveLength(1);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('R1');
  });

  it('R1: does NOT flag a declared silent suite', () => {
    const { violations } = reconcile([summary()], [entry()]);
    expect(violations).toEqual([]);
  });

  it('R1: does NOT flag a suite that executed at least one test', () => {
    const { violations, silent } = reconcile(
      [summary({ collected: 5, executed: 1, skipped: 4 })],
      []
    );
    expect(silent).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('R1: does NOT flag a file that collected nothing', () => {
    const { violations } = reconcile([summary({ collected: 0, skipped: 0 })], []);
    expect(violations).toEqual([]);
  });

  it('ignores non-test files defensively', () => {
    const { violations } = reconcile([summary({ file: 'tools/helper.ts' })], []);
    expect(violations).toEqual([]);
  });

  it('R2: flags a declared suite skipping ABOVE its ceiling', () => {
    const { violations } = reconcile(
      [summary({ collected: 9, executed: 0, skipped: 9 })],
      [entry({ maxSkipped: 5 })]
    );
    expect(violations.map((v) => v.rule)).toEqual(['R2']);
  });

  it('R2: a declared suite running MORE than declared passes (environment-robustness)', () => {
    // The nightly runs file-ingestion fully. That must never fail the gate —
    // it is the environment the suite is supposed to work in.
    const { violations, silent } = reconcile(
      [summary({ collected: 12, executed: 12, skipped: 0 })],
      [entry({ maxSkipped: 12 })]
    );
    expect(silent).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('R2: a partially-running declared suite under its ceiling passes', () => {
    const { violations } = reconcile(
      [summary({ collected: 12, executed: 8, skipped: 4 })],
      [entry({ maxSkipped: 5 })]
    );
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Freshness — the gate must never PASS on an unverifiable run
// ---------------------------------------------------------------------------

describe('runInfraSkipGate — freshness', () => {
  it('reports unverifiable (not pass, not fail) when the run marker is stale', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => ({
        status: 'unverifiable',
        reason: 'RUN_ID.json was written for deadbeef, current HEAD is cafebabe',
        files: [],
      }),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(r.status).toBe('unverifiable');
    expect(r.summaries).toEqual([]);
    expect(formatReport(r)).toContain('NO VERIFIED RUN');
  });

  it('an unverifiable run is NEVER a PASS — it must not exit 0', () => {
    // Regression guard for a defect found in this gate's own first implementation:
    // it printed "NO VERIFIED RUN" and then "✓ PASS" and exited 0, reproducing the
    // exact silence-as-success bug it exists to catch.
    const opts = {
      loadResults: () => ({ status: 'unverifiable' as const, reason: 'stale run', files: [] }),
      loadRegistry: () => [entry()],
      fileExists: alwaysExists,
      now: () => NOW,
    };
    const r = runInfraSkipGate(REPO_ROOT, opts);
    expect(r.ok).toBe(false);
    const report = formatReport(r);
    expect(report).toContain('✗ FAIL');
    expect(report).not.toContain('✓ PASS');
    expect(main(REPO_ROOT, opts)).toBe(1);
  });

  it('never masks a bad registry, even with no verified run', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => ({ status: 'unverifiable', reason: 'no run', files: [] }),
      loadRegistry: () => [entry({ reason: 'no reference here' })],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'R4')).toBe(true);
  });

  it('a stale manifest can never produce a PASS verdict on stale data', () => {
    const stale = runInfraSkipGate(REPO_ROOT, {
      // A silently-skipping undeclared suite exists, but the run is unverifiable —
      // the gate must not reconcile against it at all.
      loadResults: () => ({ status: 'unverifiable', reason: 'stale', files: [summary()] }),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(stale.silent).toEqual([]);
    expect(stale.status).toBe('unverifiable');
  });
});

// ---------------------------------------------------------------------------
// End-to-end through the runner
// ---------------------------------------------------------------------------

describe('runInfraSkipGate', () => {
  it('passes when every silent suite is declared and in date', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => manifest([summary()]),
      loadRegistry: () => [entry()],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.silent).toHaveLength(1);
    expect(formatReport(r)).toContain('✓ PASS');
  });

  it('fails when a silent suite is undeclared', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => manifest([summary()]),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(r.ok).toBe(false);
    const report = formatReport(r);
    expect(report).toContain('✗ FAIL');
    expect(report).toContain('UNDECLARED');
  });

  it('main() returns 1 on violation and 0 on pass', () => {
    const failing = main(REPO_ROOT, {
      loadResults: () => manifest([summary()]),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(failing).toBe(1);

    const passing = main(REPO_ROOT, {
      loadResults: () => manifest([summary()]),
      loadRegistry: () => [entry()],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(passing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Job summary
// ---------------------------------------------------------------------------

describe('formatJobSummary', () => {
  it('renders a table row per silent suite, marking undeclared ones', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => manifest([summary()]),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    const md = formatJobSummary(r);
    expect(md).toContain('| Suite | Skipped / Collected | Status |');
    expect(md).toContain('**UNDECLARED**');
  });

  it('says so plainly when nothing skipped', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => manifest([summary({ collected: 3, executed: 3, skipped: 0 })]),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(formatJobSummary(r)).toContain('No suite executed zero tests');
  });

  it('reports the unverifiable case rather than an empty table', () => {
    const r = runInfraSkipGate(REPO_ROOT, {
      loadResults: () => ({ status: 'unverifiable', reason: 'no run', files: [] }),
      loadRegistry: () => [],
      fileExists: alwaysExists,
      now: () => NOW,
    });
    expect(formatJobSummary(r)).toContain('No verified run to audit');
  });
});

// ---------------------------------------------------------------------------
// loadResults — the real filesystem freshness path (DEFECT-1 guard)
// ---------------------------------------------------------------------------

describe('loadResults (filesystem)', () => {
  const HEAD = 'a'.repeat(40);

  function makeParts(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'skipgate-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return dir;
  }

  const resultJson = (name: string, statuses: string[]) =>
    JSON.stringify({
      testResults: [{ name, assertionResults: statuses.map((status) => ({ status })) }],
    });

  it('is unverifiable when the run marker is absent', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/integration/vitest-result.json': resultJson('a.test.ts', [
        'skipped',
      ]),
    });
    const r = loadResults(dir, () => HEAD);
    expect(r.status).toBe('unverifiable');
    expect(r.reason).toMatch(/RUN_ID/);
  });

  it('is unverifiable when the marker is for a different commit (STALE RUN)', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: 'b'.repeat(40) }),
      'artifacts/coverage-parts/integration/vitest-result.json': resultJson('a.test.ts', [
        'skipped',
      ]),
    });
    const r = loadResults(dir, () => HEAD);
    expect(r.status).toBe('unverifiable');
    expect(r.reason).toMatch(/stale run/);
    expect(r.files).toEqual([]);
  });

  it('is unverifiable when the marker is corrupt', () => {
    const dir = makeParts({ 'artifacts/coverage-parts/RUN_ID.json': '{not json' });
    expect(loadResults(dir, () => HEAD).status).toBe('unverifiable');
  });

  it('is unverifiable when git HEAD cannot be resolved', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: HEAD }),
    });
    expect(loadResults(dir, () => null).status).toBe('unverifiable');
  });

  it('is unverifiable when a project manifest is corrupt (never shrinks the audited set)', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: HEAD }),
      'artifacts/coverage-parts/integration/vitest-result.json': '{broken',
    });
    const r = loadResults(dir, () => HEAD);
    expect(r.status).toBe('unverifiable');
    expect(r.reason).toMatch(/corrupt/);
  });

  it('is unverifiable when the marker matches but no manifests exist', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: HEAD }),
    });
    expect(loadResults(dir, () => HEAD).status).toBe('unverifiable');
  });

  it('loads and summarizes manifests across projects when the marker matches HEAD', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: HEAD }),
      'artifacts/coverage-parts/integration/vitest-result.json': resultJson(
        'tests/integration/a.test.ts',
        ['skipped', 'skipped']
      ),
      'artifacts/coverage-parts/domain/vitest-result.json': resultJson('tests/domain/b.test.ts', [
        'passed',
      ]),
    });
    const r = loadResults(dir, () => HEAD);
    expect(r.status).toBe('ok');
    expect(r.files).toHaveLength(2);
    const skipped = r.files.find((f) => f.file.endsWith('a.test.ts'));
    expect(skipped).toMatchObject({ collected: 2, executed: 0, skipped: 2 });
    expect(r.files.map((f) => f.project).sort()).toEqual(['domain', 'integration']);
  });

  it('skips entries with no usable name and non-directory children', () => {
    const dir = makeParts({
      'artifacts/coverage-parts/RUN_ID.json': JSON.stringify({ headSha: HEAD }),
      'artifacts/coverage-parts/stray.txt': 'ignored',
      'artifacts/coverage-parts/integration/vitest-result.json': JSON.stringify({
        testResults: [{ assertionResults: [] }, { name: 'ok.test.ts', assertionResults: [] }],
      }),
    });
    const r = loadResults(dir, () => HEAD);
    expect(r.status).toBe('ok');
    expect(r.files).toHaveLength(1);
  });
});

describe('loadRegistry (filesystem)', () => {
  it('returns [] when the registry file is absent', () => {
    expect(loadRegistry(mkdtempSync(join(tmpdir(), 'noreg-')))).toEqual([]);
  });

  it('returns [] on malformed JSON rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badreg-'));
    mkdirSync(join(dir, 'tools', 'scripts'), { recursive: true });
    writeFileSync(join(dir, REGISTRY_PATH), '{nope');
    expect(loadRegistry(dir)).toEqual([]);
  });

  it('tolerates a BOM and a missing entries array', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bomreg-'));
    mkdirSync(join(dir, 'tools', 'scripts'), { recursive: true });
    writeFileSync(join(dir, REGISTRY_PATH), '﻿' + JSON.stringify({}));
    expect(loadRegistry(dir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Default (non-injected) wiring — exercises the real git + fs helpers
// ---------------------------------------------------------------------------

describe('default wiring', () => {
  it('runs end-to-end against the real repo using its own I/O helpers', () => {
    // No injections at all: this drives currentHeadSha(), defaultFileExists(),
    // loadResults() and loadRegistry() for real. Without a coverage run present
    // the verdict is "unverifiable" — which is exactly the fail-closed behaviour
    // we want, and it must never be a PASS-on-nothing.
    const r = runInfraSkipGate(REPO_ROOT);
    expect(['ok', 'unverifiable']).toContain(r.status);
    expect(r.declared.length).toBeGreaterThan(0);
    // The committed registry is valid, so no R3/R4/R5 violations regardless of run state.
    expect(r.violations).toEqual([]);
  });

  it('writes a job summary when GITHUB_STEP_SUMMARY is set', () => {
    const summaryFile = join(mkdtempSync(join(tmpdir(), 'summary-')), 'summary.md');
    const prev = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    try {
      const code = main(REPO_ROOT, {
        loadResults: () => manifest([summary()]),
        loadRegistry: () => [entry()],
        fileExists: alwaysExists,
        now: () => NOW,
      });
      expect(code).toBe(0);
      expect(readFileSync(summaryFile, 'utf-8')).toContain('Runtime silent-skip gate');
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
    }
  });

  it('never lets a job-summary write failure change the verdict', () => {
    const prev = process.env.GITHUB_STEP_SUMMARY;
    // A directory path is unwritable as a file — the append throws and is swallowed.
    process.env.GITHUB_STEP_SUMMARY = mkdtempSync(join(tmpdir(), 'unwritable-'));
    try {
      const code = main(REPO_ROOT, {
        loadResults: () => manifest([summary()]),
        loadRegistry: () => [entry()],
        fileExists: alwaysExists,
        now: () => NOW,
      });
      expect(code).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// The committed registry must itself be valid (repo regression guard)
// ---------------------------------------------------------------------------

describe('committed registry', () => {
  it('parses and every entry satisfies the policy today', () => {
    const entries = loadRegistry(REPO_ROOT);
    expect(entries.length).toBeGreaterThan(0);

    const violations = entries.flatMap((e) =>
      validateEntry(e, {
        now: Date.now(),
        exists: (p) => existsSync(resolve(REPO_ROOT, p)),
      })
    );
    expect(violations).toEqual([]);
  });

  it('points at the expected registry path', () => {
    expect(REGISTRY_PATH).toBe('tools/scripts/infra-skip-gate.registry.json');
  });
});
