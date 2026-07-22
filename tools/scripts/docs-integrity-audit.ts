/**
 * Docs Integrity Audit — cross-document route-total + summary-aggregate drift
 * detector and CI/pre-ship gate (DOC-016).
 *
 * DOC-015 reconciled seven design docs to a single canonical filesystem route
 * total (currently 211) and shipped a regression *test*
 * (`route-total-consistency.test.ts`). DOC-016 promotes that guarantee into a
 * standalone **CLI gate** that CI and the pre-ship gate run on every PR that
 * touches app routes or design docs — so cross-document drift fails the PR
 * instead of silently rotting.
 *
 * What it validates, against the LIVE filesystem audit (never hardcoded):
 *   1. The canonical route total is cited on the designated "Total Pages"
 *      declaration line of every target design doc.
 *   2. The key summary aggregates (Public / Developer / Protected page counts)
 *      cited in the canonical summary tables match the live audit.
 *
 * Design principles:
 *   - Oracle is `runAudit(REPO_ROOT).summary` (live `page.tsx` scan). When
 *     routes are added, the expected numbers self-update and any doc that still
 *     quotes the old number fails — exactly the drift we want to catch.
 *   - Each check is anchored to a *specific* line shape (e.g. a Markdown table
 *     row, or the `**Total Pages**:` header) so coincidental numbers elsewhere
 *     — a `### Public Pages (27 routes)` section header, a changelog
 *     "Updated to 102 pages" — are NOT mistaken for the canonical figure
 *     (false-positive guardrail).
 *   - Pure functions (`deriveCanonical`, `auditDocText`, `formatReport`) hold
 *     the logic; I/O lives only in `runDocsIntegrityAudit` / `main`, so the
 *     detection and guardrail behaviour is unit-testable without the
 *     filesystem scan.
 *
 * Sibling references: `tools/scripts/content-audit.ts` (the audit oracle),
 * `tools/scripts/route-total-consistency.test.ts` (DOC-015 regression test).
 *
 * Verify: `npx tsx tools/scripts/docs-integrity-audit.ts`
 *
 * @module tools/scripts/docs-integrity-audit
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAudit, type AuditData } from './content-audit.js';
import { findRepoRoot } from './lib/validation-utils.js';

// ============================================================================
// Canonical totals — derived live, never hardcoded
// ============================================================================

/** The four canonical aggregates the design docs quote. */
export interface CanonicalTotals {
  /** All `page.tsx` routes on the filesystem — the headline "Total Pages". */
  total: number;
  /** Routes under `(public)/`. */
  public: number;
  /** Routes under `(developer)/`. */
  developer: number;
  /** Auth-gated ("Protected") routes — everything not public or developer. */
  protected: number;
}

/** Map the live audit summary onto the aggregate names the docs use. */
export function deriveCanonical(summary: AuditData['summary']): CanonicalTotals {
  return {
    total: summary.total_routes,
    public: summary.public_routes,
    developer: summary.developer_routes,
    protected: summary.auth_gated_routes,
  };
}

// ============================================================================
// Check specification
// ============================================================================

/**
 * A single doc-integrity assertion: locate one canonical figure in one doc and
 * compare it to the live aggregate. `locate` MUST capture the cited number in
 * group 1 and be anchored tightly enough that only the canonical line matches.
 */
export interface DocCheckSpec {
  /** Repo-relative doc path. */
  doc: string;
  /** Which live aggregate this figure must equal. */
  key: keyof CanonicalTotals;
  /** Human label for the report (e.g. "Total Pages", "Protected Pages"). */
  label: string;
  /** Regex capturing the cited integer in group 1, anchored to the canonical line. */
  locate: RegExp;
}

/**
 * The canonical checks. Kept declarative so the guardrail behaviour is obvious
 * and testable. Patterns are pinned to the reconciled DOC-015 line shapes.
 */
export const CHECKS: readonly DocCheckSpec[] = [
  // --- Canonical route total (all seven docs) ---
  {
    doc: 'docs/design/sitemap.md',
    key: 'total',
    label: 'Total Pages',
    locate: /\*\*Total Pages\*\*:\s*(\d+)/,
  },
  {
    doc: 'docs/design/page-registry.md',
    key: 'total',
    label: 'Total Pages',
    locate: /\*\*Total Pages\*\*:\s*(\d+)/,
  },
  {
    doc: 'docs/design/PAGE_MAP_AND_FLOWS.md',
    key: 'total',
    label: 'Total Pages',
    locate: /\|\s*Total Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/ui-flow-mapping.md',
    key: 'total',
    label: 'Total Pages',
    locate: /\*\*Total Pages\*\*:\s*(\d+)/,
  },
  {
    doc: 'docs/design/navigation-reachability-audit.md',
    key: 'total',
    label: 'Total Pages',
    locate: /Total Pages:\s*(\d+)/,
  },
  {
    doc: 'docs/design/information-architecture.md',
    key: 'total',
    label: 'Total Pages',
    locate: /\*\*Total Pages\*\*:\s*(\d+)/,
  },
  {
    doc: 'docs/design/content-audit.md',
    key: 'total',
    label: 'Total Pages (filesystem total)',
    locate: /Total Pages \(filesystem total\):\s*(\d+)/,
  },

  // --- Summary aggregates (the canonical summary tables + content-audit prose) ---
  {
    doc: 'docs/design/PAGE_MAP_AND_FLOWS.md',
    key: 'public',
    label: 'Public Pages',
    locate: /\|\s*Public Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/PAGE_MAP_AND_FLOWS.md',
    key: 'developer',
    label: 'Developer Pages',
    locate: /\|\s*Developer Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/PAGE_MAP_AND_FLOWS.md',
    key: 'protected',
    label: 'Protected Pages',
    locate: /\|\s*Protected Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/information-architecture.md',
    key: 'public',
    label: 'Public Pages',
    locate: /\|\s*Public Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/information-architecture.md',
    key: 'developer',
    label: 'Developer Pages',
    locate: /\|\s*Developer Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/information-architecture.md',
    key: 'protected',
    label: 'Protected Pages',
    locate: /\|\s*Protected Pages\s*\|\s*(\d+)\s*\|/,
  },
  {
    doc: 'docs/design/content-audit.md',
    key: 'protected',
    label: 'auth-gated entries',
    // Bounded digit count (route totals are <=6 digits) keeps the leading
    // quantifier linear and clear of the sonarjs/slow-regex heuristic.
    locate: /(\d{1,6}) auth-gated entries/,
  },
] as const;

/** The distinct set of docs any check targets. */
export const TARGET_DOCS: readonly string[] = [...new Set(CHECKS.map((c) => c.doc))];

// ============================================================================
// Findings
// ============================================================================

export type FindingKind =
  | 'drift' // canonical line found but cites the wrong number
  | 'missing-line' // required canonical line not found in the doc
  | 'missing-doc'; // doc file itself is absent

export interface DriftFinding {
  doc: string;
  label: string;
  key: keyof CanonicalTotals;
  kind: FindingKind;
  expected: number;
  /** The number actually cited, or null when the line/doc is missing. */
  found: number | null;
  message: string;
}

// ============================================================================
// Pure audit logic
// ============================================================================

/**
 * Audit a single doc's text against every check that targets it. Pure — no
 * filesystem access — so both drift detection and the false-positive guardrail
 * are unit-testable with synthetic inputs.
 */
export function auditDocText(
  doc: string,
  text: string,
  canonical: CanonicalTotals,
  checks: readonly DocCheckSpec[] = CHECKS
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const check of checks) {
    if (check.doc !== doc) continue;
    const expected = canonical[check.key];
    const match = check.locate.exec(text);
    if (!match) {
      findings.push({
        doc,
        label: check.label,
        key: check.key,
        kind: 'missing-line',
        expected,
        found: null,
        message: `${doc}: no canonical "${check.label}" line found (expected ${expected}). Doc format may have drifted from the reconciled shape.`,
      });
      continue;
    }
    const found = Number.parseInt(match[1], 10);
    if (found !== expected) {
      findings.push({
        doc,
        label: check.label,
        key: check.key,
        kind: 'drift',
        expected,
        found,
        message: `${doc}: "${check.label}" cites ${found} but the live filesystem audit says ${expected}.`,
      });
    }
  }
  return findings;
}

// ============================================================================
// Filesystem runner
// ============================================================================

export interface AuditResult {
  canonical: CanonicalTotals;
  findings: DriftFinding[];
  /** Docs that were read and checked. */
  checkedDocs: string[];
  ok: boolean;
  /** Wall-clock milliseconds for the run. */
  elapsedMs: number;
}

export interface RunOptions {
  /** Injectable audit fn for tests (defaults to the real filesystem scan). */
  auditFn?: (repoRoot: string) => AuditData;
  /** Injectable clock for deterministic timing in tests. */
  now?: () => number;
}

/**
 * Run the full docs-integrity audit against the repo: scan routes for the
 * canonical aggregates, then check every target doc for drift.
 */
export function runDocsIntegrityAudit(repoRoot: string, opts: RunOptions = {}): AuditResult {
  const auditFn = opts.auditFn ?? runAudit;
  const now = opts.now ?? (() => Date.now());
  const start = now();

  const canonical = deriveCanonical(auditFn(repoRoot).summary);
  const findings: DriftFinding[] = [];
  const checkedDocs: string[] = [];

  for (const doc of TARGET_DOCS) {
    const abs = resolve(repoRoot, doc);
    if (!existsSync(abs)) {
      // Every check targeting this doc becomes one missing-doc finding.
      for (const check of CHECKS.filter((c) => c.doc === doc)) {
        findings.push({
          doc,
          label: check.label,
          key: check.key,
          kind: 'missing-doc',
          expected: canonical[check.key],
          found: null,
          message: `${doc}: target design doc is missing from the repository.`,
        });
      }
      continue;
    }
    checkedDocs.push(doc);
    const text = readFileSync(abs, 'utf-8');
    findings.push(...auditDocText(doc, text, canonical));
  }

  return {
    canonical,
    findings,
    checkedDocs,
    ok: findings.length === 0,
    elapsedMs: now() - start,
  };
}

// ============================================================================
// Reporting
// ============================================================================

export function formatReport(result: AuditResult): string {
  const { canonical, findings, checkedDocs, ok, elapsedMs } = result;
  const lines: string[] = [];
  lines.push('Docs Integrity Audit (DOC-016)');
  lines.push('─'.repeat(60));
  lines.push(
    `Canonical (live filesystem): total=${canonical.total} public=${canonical.public} developer=${canonical.developer} protected=${canonical.protected}`
  );
  lines.push(`Docs checked: ${checkedDocs.length}/${TARGET_DOCS.length}`);
  lines.push(`Checks run: ${CHECKS.length}`);
  lines.push('');

  if (ok) {
    lines.push('✓ PASS — every target doc cites the canonical totals and aggregates.');
  } else {
    lines.push(`✗ FAIL — ${findings.length} drift finding(s):`);
    for (const f of findings) {
      lines.push(`  • ${f.message}`);
    }
    lines.push('');
    lines.push('How to fix: regenerate the canonical audit and reconcile the docs, then');
    lines.push('re-run this gate:');
    lines.push('  pnpm tsx tools/scripts/content-audit.ts   # refresh canonical numbers');
    lines.push('  # update the flagged "Total Pages"/summary-table lines in each doc');
    lines.push('  pnpm tsx tools/scripts/docs-integrity-audit.ts');
    lines.push('See docs/runbooks/docs-integrity-gate.md for the full procedure.');
  }
  lines.push('');
  lines.push(`Completed in ${elapsedMs}ms.`);
  return lines.join('\n');
}

// ============================================================================
// CLI
// ============================================================================

/** Runs the audit and returns a process exit code (0 pass / 1 drift). Testable. */
export function main(repoRoot: string = findRepoRoot(), opts: RunOptions = {}): number {
  const result = runDocsIntegrityAudit(repoRoot, opts);
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    return 0;
  }
  console.error(report);
  return 1;
}

// CLI entry-point guard (mirrors content-audit.ts).
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('docs-integrity-audit.ts')
) {
  process.exit(main());
}
