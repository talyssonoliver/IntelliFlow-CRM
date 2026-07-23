/**
 * Tests for the ENG-OPS-002.R13 / QUAL-012 flaky-test skip gate.
 *
 * Coverage targets:
 *   - detection: declarative test.skip/it.skip/describe.skip/xit/xdescribe/xtest
 *     (including import-aliased identifiers) are flagged; Playwright's
 *     imperative test.skip(condition[, reason]), vitest's ctx.skip(), and the
 *     describe.skipIf/`cond ? describe : describe.skip` idioms are NOT.
 *   - reconciliation: inline `// ADR-054: <ref>` annotation, allowlist match,
 *     and the "no real reference" fallback-to-violation case.
 *   - the live repo itself passes (regression guard — mirrors DOC-016's pattern
 *     of asserting the real repo state, not just synthetic fixtures).
 *
 * @module tools/scripts/__tests__/flaky-test-skip-gate.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { findRepoRoot } from '../lib/validation-utils.js';
import {
  findSkipSitesInSource,
  findInlineAnnotation,
  findAllowlistMatch,
  reconcileSite,
  loadAllowlist,
  runFlakyTestSkipGate,
  formatReport,
  main,
  type SkipSite,
  type AllowlistEntry,
} from '../flaky-test-skip-gate.js';

// ============================================================================
// findSkipSitesInSource — detection
// ============================================================================

describe('findSkipSitesInSource', () => {
  it('flags a declarative it.skip(name, fn) call', () => {
    const src = `import { describe, it } from 'vitest';\nit.skip('name', () => { expect(1).toBe(1); });\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ api: 'it.skip', line: 2 });
  });

  it('flags a declarative test.skip(name, fn) call', () => {
    const src = `test.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0].api).toBe('test.skip');
  });

  it('flags a declarative describe.skip(name, fn) call', () => {
    const src = `describe.skip('suite', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0].api).toBe('describe.skip');
  });

  it('flags test.todo(name, fn)', () => {
    const src = `test.todo('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0].api).toBe('test.todo');
  });

  it('flags bare xit/xdescribe/xtest calls with a function argument', () => {
    const src = `xit('name', () => {});\nxdescribe('suite', () => {});\nxtest('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites.map((s) => s.api)).toEqual(['xit', 'xdescribe', 'xtest']);
  });

  it('resolves an import alias back to the canonical vitest API (test as vitestTest)', () => {
    const src = `import { test as vitestTest } from 'vitest';\nvitestTest.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0].api).toBe('vitestTest.skip');
  });

  it('recognizes @fast-check/vitest as a source module for test/it/describe', () => {
    const src = `import { test } from '@fast-check/vitest';\ntest.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
  });

  it('flags a multi-segment member chain (test.concurrent.skip)', () => {
    const src = `test.concurrent.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0].api).toBe('test.concurrent.skip');
  });

  it('does NOT flag Playwright-style imperative test.skip(condition, reason)', () => {
    const src = `test.skip(browserName === 'firefox', 'Firefox differs');\n`;
    const sites = findSkipSitesInSource('a.spec.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('does NOT flag a bare zero-arg test.skip()/ctx.skip()', () => {
    const src = `test('x', () => {\n  test.skip();\n  ctx.skip();\n});\n`;
    const sites = findSkipSitesInSource('a.spec.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('does NOT flag describe.skip referenced as a value (not called)', () => {
    const src = `const describeDb = DB_URL ? describe : describe.skip;\ndescribeDb('suite', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('does NOT flag describe.skipIf(cond)(...) (different property name)', () => {
    const src = `describe.skipIf(!REDIS_URL)('suite', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('does NOT flag an unrelated object with a .skip(fn) property', () => {
    const src = `myCustomQueue.skip(() => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('does NOT flag imports from unrelated modules that happen to export `test`', () => {
    const src = `import { test as vitestTest } from 'some-other-lib';\nvitestTest.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites).toHaveLength(0);
  });

  it('handles a .tsx test file (ScriptKind.TSX branch)', () => {
    const src = `it.skip('renders', () => { const x = <div />; });\n`;
    const sites = findSkipSitesInSource('a.test.tsx', src);
    expect(sites).toHaveLength(1);
  });

  it('captures a trimmed snippet of the call site source line', () => {
    const src = `  it.skip('name', () => {});\n`;
    const sites = findSkipSitesInSource('a.test.ts', src);
    expect(sites[0].snippet).toBe(`it.skip('name', () => {});`);
  });
});

// ============================================================================
// findInlineAnnotation
// ============================================================================

describe('findInlineAnnotation', () => {
  it('finds a reference on the line directly above the skip call', () => {
    const lines = ['// ADR-054: QUAL-006 — reason', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBe('QUAL-006');
  });

  it('finds a reference on the skip call line itself (inline style)', () => {
    const lines = ['it.skip(// ADR-054: QUAL-007 — reason', "'x', () => {});"];
    expect(findInlineAnnotation(lines, 1)).toBe('QUAL-007');
  });

  it('finds a GitHub issue reference', () => {
    const lines = ['// ADR-054: #123 — reason', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBe('#123');
  });

  it('finds a DEFERRED literal reference', () => {
    const lines = ['// ADR-054: DEFERRED — infra limitation', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBe('DEFERRED');
  });

  it('finds an ENG-OPS-002.R## task reference', () => {
    const lines = ['// ADR-054: ENG-OPS-002.R13 — reason', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBe('ENG-OPS-002.R13');
  });

  it('returns undefined when no ADR-054 marker exists nearby', () => {
    const lines = ['// just a regular comment', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBeUndefined();
  });

  it('returns undefined when the ADR-054 marker has no concrete reference', () => {
    const lines = ['// ADR-054: see slack thread', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 2)).toBeUndefined();
  });

  it('does not look further back than the window size', () => {
    const farLine = '// ADR-054: QUAL-999 — too far away';
    const lines = [
      farLine,
      ...Array.from({ length: 25 }, () => '// filler'),
      "it.skip('x', () => {});",
    ];
    expect(findInlineAnnotation(lines, lines.length, 20)).toBeUndefined();
  });

  it('finds a reference within a custom window size', () => {
    const lines = ['// ADR-054: QUAL-001 — close by', 'filler', "it.skip('x', () => {});"];
    expect(findInlineAnnotation(lines, 3, 5)).toBe('QUAL-001');
  });
});

// ============================================================================
// findAllowlistMatch
// ============================================================================

describe('findAllowlistMatch', () => {
  const entries: AllowlistEntry[] = [
    {
      file: 'tests/integration/connectors/erp.test.ts',
      match: "describe.skip('SAP",
      reason: 'ADR-054: QUAL-013 — reason',
    },
  ];

  it('matches by file + substring of the source line', () => {
    const site: SkipSite = {
      file: 'tests/integration/connectors/erp.test.ts',
      line: 24,
      api: 'describe.skip',
      snippet: "describe.skip('SAP ERP Adapter', () => {",
    };
    expect(findAllowlistMatch(entries, site)).toBe(entries[0]);
  });

  it('does not match a different file', () => {
    const site: SkipSite = {
      file: 'tests/other.test.ts',
      line: 1,
      api: 'describe.skip',
      snippet: "describe.skip('SAP ERP Adapter', () => {",
    };
    expect(findAllowlistMatch(entries, site)).toBeUndefined();
  });

  it('does not match when the substring is absent', () => {
    const site: SkipSite = {
      file: 'tests/integration/connectors/erp.test.ts',
      line: 24,
      api: 'describe.skip',
      snippet: "describe.skip('Something else', () => {",
    };
    expect(findAllowlistMatch(entries, site)).toBeUndefined();
  });
});

// ============================================================================
// reconcileSite
// ============================================================================

describe('reconcileSite', () => {
  const site: SkipSite = {
    file: 'a.test.ts',
    line: 2,
    api: 'it.skip',
    snippet: "it.skip('x', () => {});",
  };

  it('reconciles as annotated when an inline reference exists', () => {
    const lines = ['// ADR-054: QUAL-001 — reason', site.snippet];
    const result = reconcileSite(site, lines, []);
    expect(result).toMatchObject({ kind: 'annotated', reference: 'QUAL-001' });
  });

  it('reconciles as allowlisted when no inline annotation but an allowlist entry matches', () => {
    const lines = ['// unrelated comment', site.snippet];
    const allowlist: AllowlistEntry[] = [
      { file: 'a.test.ts', match: 'it.skip', reason: 'ADR-054: QUAL-002 — reason' },
    ];
    const result = reconcileSite(site, lines, allowlist);
    expect(result).toMatchObject({ kind: 'allowlisted', reference: 'QUAL-002' });
  });

  it('prefers an inline annotation over a matching allowlist entry', () => {
    const lines = ['// ADR-054: QUAL-003 — inline wins', site.snippet];
    const allowlist: AllowlistEntry[] = [
      { file: 'a.test.ts', match: 'it.skip', reason: 'ADR-054: QUAL-999 — reason' },
    ];
    const result = reconcileSite(site, lines, allowlist);
    expect(result).toMatchObject({ kind: 'annotated', reference: 'QUAL-003' });
  });

  it('treats an allowlist entry with no concrete reference in its reason as a violation', () => {
    const lines = ['// unrelated comment', site.snippet];
    const allowlist: AllowlistEntry[] = [
      { file: 'a.test.ts', match: 'it.skip', reason: 'no real reference here' },
    ];
    const result = reconcileSite(site, lines, allowlist);
    expect(result.kind).toBe('violation');
  });

  it('reconciles as a violation when neither annotation nor allowlist match', () => {
    const lines = ['// unrelated comment', site.snippet];
    const result = reconcileSite(site, lines, []);
    expect(result.kind).toBe('violation');
    expect(result.reference).toBeUndefined();
  });
});

// ============================================================================
// loadAllowlist
// ============================================================================

describe('loadAllowlist', () => {
  it('loads the real allowlist file and validates its shape', () => {
    const repoRoot = findRepoRoot();
    const entries = loadAllowlist(repoRoot);
    expect(Array.isArray(entries)).toBe(true);
    for (const e of entries) {
      expect(typeof e.file).toBe('string');
      expect(typeof e.match).toBe('string');
      expect(typeof e.reason).toBe('string');
    }
  });

  it('returns an empty array when the allowlist file does not exist', () => {
    const entries = loadAllowlist('/nonexistent/repo/root/for/testing');
    expect(entries).toEqual([]);
  });
});

// ============================================================================
// runFlakyTestSkipGate
// ============================================================================

describe('runFlakyTestSkipGate', () => {
  const files: Record<string, string> = {
    'clean.test.ts': "it.skip('x', () => {}); // no wait, this has no annotation\n",
    'annotated.test.ts': "// ADR-054: QUAL-100 — reason\nit.skip('x', () => {});\n",
  };

  function makeOpts() {
    return {
      listFiles: () => Object.keys(files),
      readFile: (absPath: string) => {
        const key = Object.keys(files).find((f) => absPath.endsWith(f));
        if (!key) throw new Error(`not found: ${absPath}`);
        return files[key];
      },
      loadAllowlist: () => [],
      now: (() => {
        let t = 1000;
        return () => (t += 1);
      })(),
    };
  }

  it('reports violations for unannotated skips and reconciles annotated ones', () => {
    const result = runFlakyTestSkipGate('/repo', makeOpts());
    expect(result.filesScanned).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('clean.test.ts');
    expect(result.annotated).toHaveLength(1);
    expect(result.annotated[0].file).toBe('annotated.test.ts');
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it('passes (ok=true) when every skip site is reconciled', () => {
    const opts = makeOpts();
    opts.listFiles = () => ['annotated.test.ts'];
    const result = runFlakyTestSkipGate('/repo', opts);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips files that fail to read without throwing', () => {
    const opts = makeOpts();
    opts.listFiles = () => ['missing.test.ts'];
    const result = runFlakyTestSkipGate('/repo', opts);
    expect(result.ok).toBe(true);
    expect(result.sites).toHaveLength(0);
  });

  it('skips files with zero skip sites without reconciling anything', () => {
    const opts = makeOpts();
    files['no-skips.test.ts'] = "it('x', () => {});\n";
    opts.listFiles = () => ['no-skips.test.ts'];
    const result = runFlakyTestSkipGate('/repo', opts);
    expect(result.sites).toHaveLength(0);
    delete files['no-skips.test.ts'];
  });

  it('runs against the real repository and passes (regression guard)', () => {
    const repoRoot = findRepoRoot();
    const result = runFlakyTestSkipGate(repoRoot);
    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    // The 15 known reconciled skips (14 inline-annotated + 1 allowlisted for the
    // R17-owned ERP suite) should still be found — a regression here means either
    // a new unannotated skip was introduced or an existing annotation was removed.
    expect(result.sites.length).toBeGreaterThanOrEqual(15);
  }, 30000);
});

// ============================================================================
// formatReport
// ============================================================================

describe('formatReport', () => {
  it('formats a PASS report listing reconciled sites', () => {
    const report = formatReport({
      sites: [
        {
          file: 'a.test.ts',
          line: 2,
          api: 'it.skip',
          snippet: 'x',
          kind: 'annotated',
          reference: 'QUAL-001',
        },
      ],
      violations: [],
      annotated: [
        {
          file: 'a.test.ts',
          line: 2,
          api: 'it.skip',
          snippet: 'x',
          kind: 'annotated',
          reference: 'QUAL-001',
        },
      ],
      allowlisted: [],
      ok: true,
      filesScanned: 10,
      elapsedMs: 5,
    });
    expect(report).toContain('PASS');
    expect(report).toContain('QUAL-001');
  });

  it('formats a PASS report with zero skip sites (no reconciled-list section)', () => {
    const report = formatReport({
      sites: [],
      violations: [],
      annotated: [],
      allowlisted: [],
      ok: true,
      filesScanned: 10,
      elapsedMs: 5,
    });
    expect(report).toContain('PASS');
    expect(report).not.toContain('Reconciled skips');
  });

  it('formats a FAIL report listing violations and remediation guidance', () => {
    const report = formatReport({
      sites: [
        {
          file: 'a.test.ts',
          line: 2,
          api: 'it.skip',
          snippet: "it.skip('x', () => {});",
          kind: 'violation',
        },
      ],
      violations: [
        {
          file: 'a.test.ts',
          line: 2,
          api: 'it.skip',
          snippet: "it.skip('x', () => {});",
          kind: 'violation',
        },
      ],
      annotated: [],
      allowlisted: [],
      ok: false,
      filesScanned: 10,
      elapsedMs: 5,
    });
    expect(report).toContain('FAIL');
    expect(report).toContain('a.test.ts:2');
    expect(report).toContain('How to fix');
  });
});

// ============================================================================
// main
// ============================================================================

describe('main', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 0 and logs a PASS report when the gate passes', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = main('/repo', {
      listFiles: () => [],
      readFile: () => '',
      loadAllowlist: () => [],
    });
    expect(exit).toBe(0);
    expect(logSpy).toHaveBeenCalled();
  });

  it('returns 1 and logs a FAIL report when violations exist', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = main('/repo', {
      listFiles: () => ['a.test.ts'],
      readFile: () => "it.skip('x', () => {});\n",
      loadAllowlist: () => [],
    });
    expect(exit).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('defaults repoRoot to findRepoRoot() and passes against the live repo', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = main();
    expect(exit).toBe(0);
    expect(logSpy).toHaveBeenCalled();
  }, 30000);
});
