/**
 * Regression suite for tools/scripts/parse-actions-usage.mjs.
 *
 * Covers the specific shapes we hit by hand during the 2026-05-25 CI cost
 * audit: BOM-prefixed exports, quoted commas in workflow paths, header
 * casing/spacing variants, missing columns, NaN guards, and the
 * storage-only export shape.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Module is .mjs ESM; vitest resolves it via Node's ESM loader.
import {
  normaliseHeader,
  parseCsv,
  resolveColumns,
  aggregate,
  formatReport,
  pct,
  buildArtifact,
  writeArtifact,
} from '../parse-actions-usage.mjs';

type ParsedRow = Record<string, string>;
type ColumnMap = Record<string, string>;

// Canonical header row matching GitHub's current export format.
const CANONICAL_HEADERS =
  '"date","product","sku","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","username","organization","repository","workflow_path","cost_center_name"';

describe('normaliseHeader', () => {
  it('lowercases and collapses non-alnum runs to underscores', () => {
    expect(normaliseHeader('Gross Amount')).toBe('gross_amount');
    expect(normaliseHeader('Workflow-Path')).toBe('workflow_path');
    expect(normaliseHeader('SKU')).toBe('sku');
  });

  it('strips leading and trailing underscores from punctuation', () => {
    expect(normaliseHeader('  Date  ')).toBe('date');
    expect(normaliseHeader('(actor)')).toBe('actor');
  });
});

describe('parseCsv', () => {
  it('strips a UTF-8 BOM from the first header cell', () => {
    // BOM constructed via String.fromCharCode — repo policy
    // (no-irregular-whitespace) forbids literal BOM in source. Using a
    // numeric escape keeps the file byte-clean while producing the same
    // U+FEFF runtime value GitHub's exporter prepends to the first byte
    // of the CSV.
    const BOM = String.fromCharCode(0xfeff);
    const csv =
      BOM +
      CANONICAL_HEADERS +
      '\n' +
      '"2026-05-01","actions","actions_linux","60","minutes","0.006","0.36","0.36","0","alice","","Repo","ci.yml",""';
    const rows = parseCsv(csv) as ParsedRow[];
    expect(rows).toHaveLength(1);
    // Without BOM stripping the key would be "<BOM>date" and .date would
    // be undefined.
    expect(rows[0].date).toBe('2026-05-01');
    expect(rows[0].sku).toBe('actions_linux');
  });

  it('preserves commas inside quoted cells (workflow path with embedded comma)', () => {
    const csv =
      CANONICAL_HEADERS +
      '\n' +
      '"2026-05-01","actions","actions_linux","42","minutes","0.006","0.25","0.25","0","alice","","Repo",".github/workflows/ci, special.yml",""';
    const rows = parseCsv(csv) as ParsedRow[];
    expect(rows[0].workflow_path).toBe('.github/workflows/ci, special.yml');
    // A naive split(',') would have shifted columns, parking the dollar
    // amount in workflow_path and breaking everything downstream.
    expect(rows[0].quantity).toBe('42');
  });

  it('normalises uppercase / space-separated headers to the canonical keys', () => {
    const csv =
      '"Date","Product","SKU","Quantity","Unit Type","Cost","Gross Amount","Discount","Net","Actor","Org","Repository","Workflow","Cost Center"\n' +
      '"2026-05-01","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""';
    const rows = parseCsv(csv) as ParsedRow[];
    expect(rows[0].sku).toBe('actions_linux');
    expect(rows[0].gross_amount).toBe('0.36');
    // Header 'Actor' → 'actor', not 'username'. resolveColumns() resolves
    // the alias at aggregation time.
    expect(rows[0].actor).toBe('alice');
    expect(rows[0].workflow).toBe('ci.yml');
  });
});

describe('resolveColumns', () => {
  it('returns the alias hit for each canonical key', () => {
    const rows = [{ actor: 'a', sku: 's', quantity: '1', gross: '0', workflow: 'w', date: 'd' }];
    const cols = resolveColumns(rows) as ColumnMap;
    expect(cols.username).toBe('actor');
    expect(cols.gross_amount).toBe('gross');
    expect(cols.workflow_path).toBe('workflow');
  });

  it('throws MISSING_COLUMN when no alias matches a required canonical key', () => {
    const rows = [{ date: 'd', product: 'p', quantity: '1', gross_amount: '0' }];
    expect(() => resolveColumns(rows)).toThrowError(/required column not found/);
    try {
      resolveColumns(rows);
      throw new Error('expected resolveColumns to throw');
    } catch (e) {
      const err = e as { code?: string; missing?: string };
      expect(err.code).toBe('MISSING_COLUMN');
      expect(err.missing).toBe('sku');
    }
  });
});

describe('aggregate', () => {
  const mkRows = (lines: string[]): ParsedRow[] =>
    parseCsv(CANONICAL_HEADERS + '\n' + lines.join('\n')) as ParsedRow[];

  it('sums actions_linux rows by workflow, user, and day', () => {
    const rows = mkRows([
      '"2026-05-01","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
      '"2026-05-01","actions","actions_linux","30","minutes","0.006","0.18","0","0","dependabot[bot]","","Repo","security.yml",""',
      '"2026-05-02","actions","actions_linux","15","minutes","0.006","0.09","0","0","alice","","Repo","ci.yml",""',
    ]);
    const agg = aggregate(rows);
    expect(agg.totals.minutes).toBe(105);
    expect(agg.totals.cost).toBeCloseTo(0.63, 5);
    expect(agg.totals.days).toBe(2);
    expect(agg.byWorkflow['ci.yml'].minutes).toBe(75);
    expect(agg.byWorkflow['ci.yml'].runs).toBe(2);
    expect(agg.byUser['dependabot[bot]'].minutes).toBe(30);
    expect(agg.byDay['2026-05-01'].minutes).toBe(90);
    expect(agg.byUserWorkflow['dependabot[bot]||security.yml'].minutes).toBe(30);
  });

  it('treats actions_storage rows as storage-only, not compute minutes', () => {
    const rows = mkRows([
      '"2026-05-01","actions","actions_storage","16.28","gigabyte-hours","0.00033602","0.005","0","0","","","Repo","",""',
    ]);
    const agg = aggregate(rows);
    expect(agg.totals.minutes).toBe(0);
    expect(agg.totals.cost).toBe(0);
    expect(agg.totals.storage).toBeCloseTo(0.005, 5);
  });

  it('returns a zeroed shape for empty input without throwing', () => {
    expect(aggregate([])).toEqual({
      totals: { minutes: 0, cost: 0, storage: 0, days: 0 },
      byWorkflow: {},
      byUser: {},
      byDay: {},
      byUserWorkflow: {},
    });
  });

  it('coerces NaN-shaped quantity/gross to 0 rather than poisoning totals', () => {
    const rows = mkRows([
      '"2026-05-01","actions","actions_linux","not-a-number","minutes","","not-a-number","0","0","alice","","Repo","ci.yml",""',
    ]);
    const agg = aggregate(rows);
    expect(agg.totals.minutes).toBe(0);
    expect(agg.totals.cost).toBe(0);
    // A workflow entry is still created — the row was a real run, just with
    // unparseable numbers — but the numeric stats are zero.
    expect(agg.byWorkflow['ci.yml'].runs).toBe(1);
  });
});

describe('pct', () => {
  it('returns a percent string when whole > 0', () => {
    expect(pct(25, 100)).toBe('25.0%');
    expect(pct(1, 3)).toBe('33.3%');
  });

  it('returns "n/a " (not "NaN%") when whole is 0', () => {
    expect(pct(0, 0)).toBe('n/a ');
    expect(pct(5, 0)).toBe('n/a ');
  });
});

describe('formatReport', () => {
  it('does not emit NaN anywhere when input is storage-only', () => {
    const rows = parseCsv(
      CANONICAL_HEADERS +
        '\n' +
        '"2026-05-01","actions","actions_storage","16.28","gigabyte-hours","0.00033602","0.005","0","0","","","Repo","",""'
    ) as ParsedRow[];
    const report = formatReport(aggregate(rows));
    expect(report).not.toMatch(/NaN/);
    expect(report).toContain('Total compute minutes: 0');
    expect(report).toContain('Total storage cost: $0.01');
  });

  it('does not emit NaN on a fully empty input', () => {
    const report = formatReport(aggregate([]));
    expect(report).not.toMatch(/NaN/);
    expect(report).toContain('Total compute minutes: 0');
    expect(report).toContain('DEPENDABOT TOTAL: 0m (n/a  of all minutes)');
  });
});

describe('buildArtifact', () => {
  const mkRows = (lines: string[]): ParsedRow[] =>
    parseCsv(CANONICAL_HEADERS + '\n' + lines.join('\n')) as ParsedRow[];

  it('separates compute cost from storage cost in totals (no conflation)', () => {
    const rows = mkRows([
      '"2026-05-01","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
      '"2026-05-01","actions","actions_storage","16.28","gigabyte-hours","0.00033602","0.005","0","0","","","Repo","",""',
    ]);
    const { artifact } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'a'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
    });
    expect(artifact.totals.compute_cost_usd).toBeCloseTo(0.36, 4);
    expect(artifact.totals.storage_cost_usd).toBeCloseTo(0.005, 4);
    expect(artifact.totals.grand_total_usd).toBeCloseTo(0.365, 4);
    expect(artifact.totals.compute_minutes).toBe(60);
  });

  it('records source CSV min/max dates and sha256 in the artifact', () => {
    const rows = mkRows([
      '"2026-05-01","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
      '"2026-05-10","actions","actions_linux","30","minutes","0.006","0.18","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { artifact } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'b'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
    });
    expect(artifact.source.min_date).toBe('2026-05-01');
    expect(artifact.source.max_date).toBe('2026-05-10');
    expect(artifact.source.sha256).toBe('b'.repeat(64));
    expect(artifact.source.rows).toBe(2);
  });

  it('flags is_stale when source CSV max date is older than the threshold', () => {
    const rows = mkRows([
      '"2026-01-01","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { provenance } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'c'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z', // ~144 days after the only row
      stalenessThresholdDays: 30,
    });
    expect(provenance.is_stale).toBe(true);
    expect(provenance.stale_reason).toMatch(/144 days old/);
  });

  it('does not flag is_stale when within the threshold', () => {
    const rows = mkRows([
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { provenance } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'd'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
      stalenessThresholdDays: 30,
    });
    expect(provenance.is_stale).toBe(false);
    expect(provenance.stale_reason).toBeNull();
  });

  it('flips is_stale when gh API reports a workflow run more recent than the CSV max date', () => {
    // CSV covers up to 2026-05-20. A run happened on 2026-05-24 (4 days
    // after the export). 30-day age check still passes, but the gh
    // freshness check catches that "CI has run since CSV export".
    const rows = mkRows([
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { provenance } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'd'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
      stalenessThresholdDays: 30,
      latestWorkflowRunAt: '2026-05-24T18:00:00.000Z',
    });
    expect(provenance.is_stale).toBe(true);
    expect(provenance.stale_reason).toMatch(/CI has run since CSV export/);
    expect(provenance.latest_observed_workflow_run_at).toBe('2026-05-24T18:00:00.000Z');
  });

  it('absorbs <24h slack between gh run timestamp and CSV max date (timezone alignment)', () => {
    // GitHub billing dates are UTC-day-boundaries; run timestamps are
    // millisecond-precise. A run a few hours after midnight on the CSV's
    // max date should NOT flip stale.
    const rows = mkRows([
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { provenance } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'd'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-21T00:00:00.000Z',
      stalenessThresholdDays: 30,
      latestWorkflowRunAt: '2026-05-20T18:00:00.000Z', // 18h after CSV max date
    });
    expect(provenance.is_stale).toBe(false);
  });

  it('records null latest_observed_workflow_run_at when the gh check is skipped', () => {
    const rows = mkRows([
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const { provenance } = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'd'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
      stalenessThresholdDays: 30,
      // latestWorkflowRunAt omitted → null
    });
    expect(provenance.latest_observed_workflow_run_at).toBeNull();
  });

  it('includes a stable sha256 of the artifact body in the provenance sidecar', () => {
    const rows = mkRows([
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""',
    ]);
    const built1 = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'e'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
    });
    const built2 = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'e'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T00:00:00.000Z',
    });
    expect(built1.provenance.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(built1.provenance.artifact_sha256).toBe(built2.provenance.artifact_sha256);
  });
});

describe('writeArtifact', () => {
  it('writes latest.json + latest.provenance.json + a history snapshot', () => {
    const rows = parseCsv(
      CANONICAL_HEADERS +
        '\n' +
        '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""'
    ) as ParsedRow[];
    const built = buildArtifact({
      agg: aggregate(rows),
      rows,
      sourcePath: 'usage.csv',
      sourceSha256: 'f'.repeat(64),
      gitHead: 'abc123',
      generatedAt: '2026-05-25T12:34:56.789Z',
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cost-artifact-'));
    try {
      writeArtifact(tmp, built);
      expect(fs.existsSync(path.join(tmp, 'latest.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmp, 'latest.provenance.json'))).toBe(true);
      const historyFiles = fs.readdirSync(path.join(tmp, 'history'));
      expect(historyFiles).toHaveLength(1);
      // History filename derived from generated_at, ':'/'.' replaced with '-'.
      expect(historyFiles[0]).toBe('2026-05-25T12-34-56-789Z.json');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
