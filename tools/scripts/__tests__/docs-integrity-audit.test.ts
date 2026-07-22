/**
 * Tests for the DOC-016 docs-integrity audit gate.
 *
 * Coverage targets the AC directly:
 *   - detection rate = 100% for injected mismatches (drift on every check),
 *   - false positives <= 1% (decoy lines must NOT trigger findings),
 *   - missing canonical line / missing doc handling,
 *   - the live-repo audit passes (regression guard mirroring DOC-015).
 *
 * @module tools/scripts/__tests__/docs-integrity-audit.test
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { findRepoRoot } from '../lib/validation-utils.js';
import type { AuditData } from '../content-audit.js';
import {
  deriveCanonical,
  auditDocText,
  runDocsIntegrityAudit,
  formatReport,
  main,
  CHECKS,
  TARGET_DOCS,
  type CanonicalTotals,
} from '../docs-integrity-audit.js';

const CANONICAL: CanonicalTotals = { total: 211, public: 32, developer: 14, protected: 165 };

/** Build a fake AuditData whose summary yields the given canonical aggregates. */
function fakeAudit(c: CanonicalTotals): AuditData {
  return {
    generated_at: '2026-07-21T00:00:00.000Z',
    tool_version: 'test',
    routes: [],
    summary: {
      total_routes: c.total,
      public_routes: c.public,
      auth_gated_routes: c.protected,
      developer_routes: c.developer,
      routes_with_seo_score: 0,
      routes_pending_runtime_measurement: c.total,
      average_seo_score_public: 0,
      legal_pages_missing: [],
      ghost_link_count: 0,
    },
    findings: { critical: [], high: [], medium: [], low: [], ghost_links: [] },
  };
}

/**
 * Produce a line that satisfies a given check's `locate` regex with a chosen
 * number, by reverse-engineering the reconciled line shapes. Keeps the test
 * declarative: one synthetic canonical line per check.
 */
function lineForCheck(label: string, n: number): string {
  switch (label) {
    case 'Total Pages':
      // Works for both `**Total Pages**: N`, `| Total Pages | N |`, `Total Pages: N`.
      return `| Total Pages | ${n} |\n**Total Pages**: ${n}\nTotal Pages: ${n}`;
    case 'Total Pages (filesystem total)':
      return `**Total Pages (filesystem total): ${n}**`;
    case 'Public Pages':
      return `| Public Pages | ${n} |`;
    case 'Developer Pages':
      return `| Developer Pages | ${n} |`;
    case 'Protected Pages':
      return `| Protected Pages | ${n} |`;
    case 'auth-gated entries':
      return `- **${n} auth-gated entries** outside (public)/ and (developer)/`;
    default:
      throw new Error(`no synthetic line for label ${label}`);
  }
}

describe('deriveCanonical', () => {
  it('maps the audit summary onto the doc aggregate names', () => {
    expect(deriveCanonical(fakeAudit(CANONICAL).summary)).toEqual(CANONICAL);
  });
});

describe('CHECKS spec integrity', () => {
  it('every check locate captures a numeric group', () => {
    for (const c of CHECKS) {
      const sample = lineForCheck(c.label, 7);
      const m = c.locate.exec(sample);
      expect(m, `${c.doc} / ${c.label} failed to match its own synthetic line`).not.toBeNull();
      expect(Number.parseInt(m![1], 10)).toBe(7);
    }
  });

  it('targets the seven reconciled design docs', () => {
    expect([...TARGET_DOCS].sort()).toEqual(
      [
        'docs/design/PAGE_MAP_AND_FLOWS.md',
        'docs/design/content-audit.md',
        'docs/design/information-architecture.md',
        'docs/design/navigation-reachability-audit.md',
        'docs/design/page-registry.md',
        'docs/design/sitemap.md',
        'docs/design/ui-flow-mapping.md',
      ].sort()
    );
  });
});

describe('auditDocText — clean pass', () => {
  it('reports no drift when the canonical line cites the correct number', () => {
    for (const doc of TARGET_DOCS) {
      const docChecks = CHECKS.filter((c) => c.doc === doc);
      const text = docChecks.map((c) => lineForCheck(c.label, CANONICAL[c.key])).join('\n');
      expect(auditDocText(doc, text, CANONICAL)).toEqual([]);
    }
  });
});

describe('auditDocText — drift detection (AC: 100% of injected mismatches)', () => {
  it('flags a drift finding for every check when the cited number is wrong', () => {
    for (const check of CHECKS) {
      const wrong = CANONICAL[check.key] + 1;
      const text = lineForCheck(check.label, wrong);
      const findings = auditDocText(check.doc, text, CANONICAL, [check]);
      expect(findings, `${check.doc}/${check.label} not detected`).toHaveLength(1);
      expect(findings[0].kind).toBe('drift');
      expect(findings[0].found).toBe(wrong);
      expect(findings[0].expected).toBe(CANONICAL[check.key]);
      expect(findings[0].message).toContain(String(wrong));
    }
  });
});

describe('auditDocText — missing canonical line', () => {
  it('flags missing-line when the doc has no canonical line', () => {
    const findings = auditDocText(
      'docs/design/sitemap.md',
      'this doc has prose but no total-pages declaration at all',
      CANONICAL
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.kind === 'missing-line')).toBe(true);
    expect(findings[0].found).toBeNull();
  });
});

describe('auditDocText — false-positive guardrails (AC: <=1% false positives)', () => {
  it('does NOT flag a coincidental section header with a different number', () => {
    // The canonical Public Pages row says 32; a decoy section header says 27.
    const text = [
      '## Section 1: Public Pages (27 routes)',
      '### 1. Public Pages (27 — No Authentication Required)',
      '| Public Pages | 32 |',
    ].join('\n');
    const check = CHECKS.find(
      (c) => c.doc === 'docs/design/PAGE_MAP_AND_FLOWS.md' && c.key === 'public'
    )!;
    expect(auditDocText('docs/design/PAGE_MAP_AND_FLOWS.md', text, CANONICAL, [check])).toEqual([]);
  });

  it('does NOT flag changelog / prose numbers as the canonical total', () => {
    const text = [
      '> 3.0 | 2026-02-23 | Updated to 102 pages. Added 34 missing pages.',
      'Historically we had 68 routes, then 101, then 103.',
      '**Total Pages**: 211',
    ].join('\n');
    const check = CHECKS.find((c) => c.doc === 'docs/design/sitemap.md' && c.key === 'total')!;
    expect(auditDocText('docs/design/sitemap.md', text, CANONICAL, [check])).toEqual([]);
  });

  it('does NOT flag a "Public Pages | 32 |" style row for the Protected check', () => {
    // Cross-label bleed guard: the Protected locator must not match a Public row.
    const text = '| Public Pages | 999 |';
    const check = CHECKS.find(
      (c) => c.doc === 'docs/design/information-architecture.md' && c.key === 'protected'
    )!;
    // No Protected line present -> missing-line, NOT a spurious drift off 999.
    const findings = auditDocText('docs/design/information-architecture.md', text, CANONICAL, [
      check,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('missing-line');
  });
});

describe('runDocsIntegrityAudit — live repo (regression guard)', () => {
  const repoRoot = findRepoRoot();

  it('passes against the reconciled design docs', () => {
    const result = runDocsIntegrityAudit(repoRoot);
    expect(result.findings, JSON.stringify(result.findings, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checkedDocs).toHaveLength(TARGET_DOCS.length);
    expect(result.canonical.total).toBeGreaterThan(0);
  });

  it('completes well under the 30s budget', () => {
    const result = runDocsIntegrityAudit(repoRoot);
    expect(result.elapsedMs).toBeLessThan(30_000);
  });

  it('detects drift when the live audit disagrees with the docs (injected oracle)', () => {
    // Force the oracle to claim a different total than the docs cite -> drift.
    const result = runDocsIntegrityAudit(repoRoot, {
      auditFn: () => fakeAudit({ ...CANONICAL, total: CANONICAL.total + 500 }),
    });
    expect(result.ok).toBe(false);
    expect(
      result.findings.some((f) => f.kind === 'drift' && f.label.startsWith('Total Pages'))
    ).toBe(true);
  });

  it('uses the injected clock for timing', () => {
    let t = 1000;
    const result = runDocsIntegrityAudit(repoRoot, {
      auditFn: () => fakeAudit(CANONICAL),
      now: () => (t += 5),
    });
    expect(result.elapsedMs).toBe(5);
  });
});

describe('runDocsIntegrityAudit — missing doc handling', () => {
  it('flags missing-doc for absent design docs', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'docs-integrity-'));
    try {
      // Create only ONE of the target docs; the rest are absent.
      const present = TARGET_DOCS[0];
      const abs = resolve(tmp, present);
      mkdirSync(dirname(abs), { recursive: true });
      const checksForPresent = CHECKS.filter((c) => c.doc === present);
      writeFileSync(
        abs,
        checksForPresent.map((c) => lineForCheck(c.label, CANONICAL[c.key])).join('\n'),
        'utf-8'
      );

      const result = runDocsIntegrityAudit(tmp, { auditFn: () => fakeAudit(CANONICAL) });
      expect(result.ok).toBe(false);
      expect(result.findings.some((f) => f.kind === 'missing-doc')).toBe(true);
      // The present doc must NOT contribute a missing-doc finding.
      expect(result.findings.some((f) => f.doc === present && f.kind === 'missing-doc')).toBe(
        false
      );
      expect(result.checkedDocs).toContain(present);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('formatReport', () => {
  it('renders a PASS report with the canonical line', () => {
    const report = formatReport({
      canonical: CANONICAL,
      findings: [],
      checkedDocs: [...TARGET_DOCS],
      ok: true,
      elapsedMs: 12,
    });
    expect(report).toContain('✓ PASS');
    expect(report).toContain('total=211');
    expect(report).toContain('Completed in 12ms');
  });

  it('renders a FAIL report listing findings and the fix procedure', () => {
    const report = formatReport({
      canonical: CANONICAL,
      findings: [
        {
          doc: 'docs/design/sitemap.md',
          label: 'Total Pages',
          key: 'total',
          kind: 'drift',
          expected: 211,
          found: 210,
          message: 'docs/design/sitemap.md: "Total Pages" cites 210 but the live audit says 211.',
        },
      ],
      checkedDocs: [...TARGET_DOCS],
      ok: false,
      elapsedMs: 9,
    });
    expect(report).toContain('✗ FAIL');
    expect(report).toContain('cites 210');
    expect(report).toContain('docs/runbooks/docs-integrity-gate.md');
  });
});

describe('main', () => {
  it('returns exit code 0 against the live reconciled repo', () => {
    expect(main(findRepoRoot())).toBe(0);
  });

  it('returns exit code 1 when a target doc is missing', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'docs-integrity-empty-'));
    try {
      expect(main(tmp, { auditFn: () => fakeAudit(CANONICAL) })).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
