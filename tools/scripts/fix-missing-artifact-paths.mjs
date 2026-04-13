#!/usr/bin/env node
/**
 * One-shot CSV repair for 47 missing-artifact references flagged in
 * Sprint_plan.csv. Findings sourced from 6 parallel audit agents (2026-04-13).
 *
 * Edits columns `Artifacts To Track` and `Pre-requisites` only. File
 * restoration is NOT performed: every missing path in the audit was traced
 * to a deliberate refactor, cleanup commit, or fake-green attestation —
 * the code is already where it should be; the CSV references are stale.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const CSV_PATH = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';
const COLS = ['Artifacts To Track', 'Pre-requisites'];

/**
 * Per-task edits. Each entry is a list of ops against one row:
 *   { replace: [oldSegment, newSegment] }   — exact-string swap, prefix-stripped
 *   { drop:    oldSegment }                  — remove the entry + its leading/trailing `;`
 *   { add:     newSegment }                  — append (for backfill)
 * Segments are written without the `ARTIFACT:`/`FILE:`/`EVIDENCE:` prefix; we
 * rewrite within the full column text which already carries prefixes.
 */
const EDITS = {
  // ── Agent A: runtime artifacts (paths moved to artifacts/old/) ─────────
  'IFC-017': [
    { replace: ['artifacts/benchmarks/query-performance.csv', 'artifacts/old/benchmarks/query-performance.csv'] },
  ],
  'IFC-021': [
    { replace: ['artifacts/logs/agent-interaction-logs.json', 'artifacts/old/agent-interaction-logs.json'] },
  ],
  'IFC-027': [
    { replace: ['artifacts/reports/ai-roi-report.md', 'artifacts/old/ai-roi-report.md'] },
  ],
  'IFC-044': [
    // .log is gitignored — drop the tracker entry; keep mutation-test.json but move to old/.
    { drop: 'ARTIFACT:artifacts/logs/test-execution-time.log' },
    { replace: ['artifacts/reports/mutation-test.json', 'artifacts/old/mutation-test.json'] },
  ],
  'IFC-057': [
    { drop: 'ARTIFACT:artifacts/logs/portability-test.log' },
  ],
  'IFC-075': [
    { drop: 'ARTIFACT:artifacts/logs/destroy-rebuild-test.log' },
  ],
  'IFC-090': [
    { replace: ['artifacts/lighthouse/lighthouse-360-report.html', 'artifacts/lighthouse/lighthouse-report.html'] },
  ],
  'IFC-094': [
    { replace: ['artifacts/lighthouse/lighthouse-360-report.html', 'artifacts/lighthouse/lighthouse-report.html'] },
  ],
  'IFC-095': [
    { replace: ['artifacts/lighthouse/lighthouse-360-report.html', 'artifacts/lighthouse/lighthouse-report.html'] },
  ],
  'IFC-143': [
    { replace: ['artifacts/logs/mitigation-backlog.csv', 'artifacts/old/mitigation-backlog.csv'] },
  ],
  'IFC-146': [
    { replace: ['artifacts/logs/backlog-updates-log.csv', 'artifacts/old/backlog-updates-log.csv'] },
  ],
  'IFC-154': [
    { replace: ['artifacts/benchmarks/ocr-quality-benchmarks.csv', 'artifacts/old/benchmarks/ocr-quality-benchmarks.csv'] },
  ],
  'IFC-155': [
    { replace: ['artifacts/benchmarks/ocr-quality-benchmarks.csv', 'artifacts/old/benchmarks/ocr-quality-benchmarks.csv'] },
  ],
  'IFC-160': [
    // Migration map was intentionally deleted post-migration; replace with the surviving summary report.
    { replace: ['scripts/migration/artifact-move-map.csv', 'artifacts/reports/artifact-containment-analysis.md'] },
  ],
  'IFC-174': [
    { replace: ['artifacts/reports/ollama-real-benchmark-report.json', 'artifacts/old/ollama-real-benchmark-report.json'] },
  ],
  'DOC-007': [
    { replace: ['artifacts/reports/accessibility-audit-results.json', 'artifacts/old/accessibility-audit-results.json'] },
  ],

  // ── Agent B: `(public)/page.tsx` restructure (commit 103b6642) ─────────
  'PG-001': [
    { replace: ['apps/web/src/app/(public)/page.tsx', 'apps/web/src/app/(public)/(home)/page.tsx'] },
  ],
  'PG-129': [
    { replace: ['apps/web/src/app/(public)/page.tsx', 'apps/web/src/app/(public)/(home)/page.tsx'] },
  ],
  // PG-002..PG-014: boilerplate entry — DROP (each row already has its own correct sub-page).
  'PG-002': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-003': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-004': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-005': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-006': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-007': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-008': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-011': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-013': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],
  'PG-014': [{ drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' }],

  // PG-009: drop boilerplate home-page entry + drop nonexistent blog-categories log.
  'PG-009': [
    { drop: 'ARTIFACT:apps/web/src/app/(public)/page.tsx' },
    { drop: 'ARTIFACT:artifacts/logs/blog-categories.json' },
  ],

  // ── Agent C: legal + system pages ──────────────────────────────────────
  'PG-051': [
    { replace: ['apps/web/src/app/(legal)/privacy/page.tsx', 'apps/web/src/app/(public)/privacy/page.tsx'] },
  ],
  'PG-052': [
    { replace: ['apps/web/src/app/(legal)/privacy/page.tsx', 'apps/web/src/app/(public)/privacy/page.tsx'] },
    { replace: ['apps/web/src/app/(public)/cookie-policy/page.tsx', 'apps/web/src/app/(public)/cookies/page.tsx'] },
    { drop: 'ARTIFACT:apps/web/src/components/legal/cookie-banner.tsx' },
  ],
  'PG-056': [
    { replace: ['apps/web/src/app/(system)/404/page.tsx', 'apps/web/src/app/404/page.tsx'] },
  ],

  // ── Agent D: PG-128 AI Settings relocation (commit 3c8e6b6d) ───────────
  'PG-128': [
    { replace: ['apps/web/src/app/settings/ai/page.tsx', 'apps/web/src/app/agent-approvals/ai-settings/page.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/ChainVersionsDashboard.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/ChainVersionsDashboard.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/ChainVersionsTable.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/ChainVersionsTable.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/ChainVersionEditor.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/ChainVersionEditor.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/VersionComparisonView.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/VersionComparisonView.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/ZepBudgetGauge.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/ZepBudgetGauge.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/components/VersionAuditLog.tsx', 'apps/web/src/components/ai-agents/ai-settings/components/VersionAuditLog.tsx'] },
    { replace: ['apps/web/src/app/settings/ai/hooks/useChainVersions.ts', 'apps/web/src/components/ai-agents/ai-settings/hooks/useChainVersions.ts'] },
  ],

  // ── Agent E: calendar / contacts / analytics ───────────────────────────
  'IFC-089': [
    // Fake-green: attestation has 0 artifact hashes, files never existed. Drop the phantom entries.
    { drop: 'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarAdapter.test.ts' },
    { drop: 'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarIntegration.test.ts' },
  ],
  'PG-133': [
    { replace: ['apps/web/src/components/contacts/ContactDetail.tsx', 'apps/web/src/app/contacts/[id]/page.tsx'] },
  ],
  'IFC-253': [
    { replace: ['apps/web/src/components/contacts/ContactDetail.tsx', 'apps/web/src/app/contacts/[id]/page.tsx'] },
  ],
  'PG-139': [
    { replace: ['apps/web/src/app/calendar/[id]/page.tsx', 'apps/web/src/app/appointments/[id]/page.tsx'] },
  ],
  'PG-177': [
    { replace: ['apps/web/src/app/analytics/saved/weekly/page.tsx', 'apps/web/src/app/analytics/(list)/saved/weekly/page.tsx'] },
    { replace: ['apps/web/src/app/analytics/saved/monthly/page.tsx', 'apps/web/src/app/analytics/(list)/saved/monthly/page.tsx'] },
    { replace: ['apps/web/src/app/analytics/saved/quarterly/page.tsx', 'apps/web/src/app/analytics/(list)/saved/quarterly/page.tsx'] },
  ],

  // ── Agent F: Prisma migrations archive + misc ──────────────────────────
  'IFC-127': [
    { replace: ['packages/db/prisma/migrations/add-multi-tenancy-diff.sql', 'packages/db/prisma/_archived_migrations/add-multi-tenancy-diff.sql'] },
    { replace: ['packages/db/prisma/migrations/add_multi_tenancy_manual.sql', 'packages/db/prisma/_archived_migrations/add_multi_tenancy_manual.sql'] },
    { replace: ['packages/db/prisma/migrations/tenant-rls.sql', 'packages/db/prisma/_archived_migrations/tenant-rls.sql'] },
  ],
  'IFC-159': [
    { replace: ['packages/db/prisma/migrations/20260131000000_init/migration.sql', 'packages/db/prisma/_archived_migrations/20260131000000_init/migration.sql'] },
  ],
  'PG-178': [
    { replace: ['packages/db/prisma/migrations/20260311_lead_settings/migration.sql', 'packages/db/prisma/_archived_migrations/20260311_lead_settings/migration.sql'] },
  ],
  'IFC-298': [
    { replace: ['packages/db/prisma/migrations/20260311000000_add_help_article_models/migration.sql', 'packages/db/prisma/_archived_migrations/20260311000000_add_help_article_models/migration.sql'] },
  ],
  'IFC-101': [
    // No Guard.ts source exists — test was never written. Fake-green.
    { drop: 'ARTIFACT:packages/domain/src/shared/__tests__/Guard.test.ts' },
  ],
  'PG-193': [
    // Generated file under gitignored packages/db/generated/; replace with real source.
    { replace: ['packages/db/generated/prisma/models/WorkflowExecution.ts', 'packages/db/prisma/schema.prisma'] },
  ],
};

function applyOps(text, ops) {
  if (!text) return { text, changed: 0 };
  let changed = 0;
  for (const op of ops) {
    if (op.replace) {
      const [from, to] = op.replace;
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed++;
      } else {
        console.warn(`  ! replace miss: "${from}" not found`);
      }
    } else if (op.drop) {
      // Remove the entry plus a single leading OR trailing semicolon (whichever exists).
      const target = op.drop;
      const patterns = [`;${target}`, `${target};`, target];
      let dropped = false;
      for (const p of patterns) {
        if (text.includes(p)) {
          text = text.replace(p, '');
          dropped = true;
          changed++;
          break;
        }
      }
      if (!dropped) console.warn(`  ! drop miss: "${target}" not found`);
    }
  }
  return { text, changed };
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    console.error('Papa parse errors:', parsed.errors.slice(0, 3));
  }
  const taskIds = Object.keys(EDITS);
  const stats = { rowsTouched: 0, opsApplied: 0 };
  for (const row of parsed.data) {
    const id = row['Task ID'];
    if (!EDITS[id]) continue;
    console.log(`\n[${id}]`);
    let rowChanged = 0;
    for (const col of COLS) {
      const before = row[col] ?? '';
      const { text, changed } = applyOps(before, EDITS[id]);
      if (changed > 0) {
        row[col] = text;
        rowChanged += changed;
        console.log(`  ${col}: ${changed} op(s)`);
      }
    }
    if (rowChanged > 0) stats.rowsTouched++;
    stats.opsApplied += rowChanged;
  }
  const out = Papa.unparse(parsed.data, { columns: parsed.meta.fields, newline: '\n' });
  // Single trailing newline, no blank trailing record.
  fs.writeFileSync(CSV_PATH, out.replace(/\r?\n*$/, '\n'), 'utf8');
  console.log(`\n✓ Wrote ${CSV_PATH}`);
  console.log(`  Task rows touched: ${stats.rowsTouched}`);
  console.log(`  Total ops applied: ${stats.opsApplied}`);
  console.log(`  Tasks in EDITS map: ${taskIds.length}`);
}

main();
