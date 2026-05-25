/**
 * GitHub Actions usage CSV parser.
 *
 * Input: path to a usage report CSV exported from
 * https://github.com/settings/billing/usage (org-level export uses the same
 * shape). Parses with `csv-parse/sync` so quoted commas, embedded quotes,
 * and trailing newlines are handled correctly.
 *
 * Output (stdout): totals, top-20 workflows by minutes, by user/bot,
 * daily burn, and a Dependabot drill-down. Numbers are aggregated from
 * `sku === 'actions_linux'` rows; `actions_storage` rows are summed into
 * a single storage line.
 *
 * Usage:
 *   node tools/scripts/parse-actions-usage.mjs <usage.csv>
 *
 * Exported for tests:
 *   parseCsv(raw) → row objects keyed by normalised header
 *   aggregate(rows) → { totals, byWorkflow, byUser, byDay, byUserWorkflow }
 *   formatReport(agg) → string
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

// columns: header => header.toLowerCase().replace(/[^a-z0-9]+/g, '_') so
// that "SKU", "Gross Amount", "Workflow Path", "Actor" all collapse to the
// canonical lowercase_underscore keys we read below. csv-parse calls this
// function once per header cell.
export const normaliseHeader = (h) =>
  String(h).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Accepts common GitHub-export header variants. If your CSV uses a header
// not in this table, add it here rather than silently falling back to zero.
export const ALIASES = {
  sku: ['sku'],
  quantity: ['quantity', 'qty'],
  gross_amount: ['gross_amount', 'gross', 'amount', 'cost'],
  username: ['username', 'actor', 'user', 'login'],
  workflow_path: ['workflow_path', 'workflow', 'workflow_name'],
  date: ['date', 'day', 'usage_date'],
};

export function parseCsv(raw) {
  // bom: true strips the UTF-8 BOM (EF BB BF) that GitHub's exporter writes,
  // otherwise the first header would be keyed as "[BOM]date" and date
  // lookups would miss. Do not put a literal BOM in this file — eslint
  // blocks it with no-irregular-whitespace.
  return parse(raw, {
    bom: true,
    columns: (headers) => headers.map(normaliseHeader),
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  });
}

export function resolveColumns(rows) {
  const headerKeys = rows.length ? Object.keys(rows[0]) : [];
  const resolved = {};
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    const hit = aliases.find((a) => headerKeys.includes(a));
    if (!hit) {
      const err = new Error(
        `required column not found. Expected one of [${aliases.join(', ')}] in headers [${headerKeys.join(', ')}].`
      );
      err.code = 'MISSING_COLUMN';
      err.missing = canon;
      err.headers = headerKeys;
      throw err;
    }
    resolved[canon] = hit;
  }
  return resolved;
}

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function aggregate(rows) {
  // Empty CSV is valid (storage-only export, no Linux minutes). Return a
  // zeroed shape so the formatter doesn't divide by zero.
  if (rows.length === 0) {
    return {
      totals: { minutes: 0, cost: 0, storage: 0, days: 0 },
      byWorkflow: {},
      byUser: {},
      byDay: {},
      byUserWorkflow: {},
    };
  }

  const cols = resolveColumns(rows);
  const get = (row, canon) => row[cols[canon]];

  const byWorkflow = {};
  const byUser = {};
  const byDay = {};
  const byUserWorkflow = {};
  let minutes = 0;
  let cost = 0;
  let storage = 0;

  for (const row of rows) {
    const sku = get(row, 'sku');
    const qty = toNum(get(row, 'quantity'));
    const g = toNum(get(row, 'gross_amount'));
    const user = get(row, 'username') || '(none)';
    const date = get(row, 'date') || '(unknown)';
    const workflow = get(row, 'workflow_path') || '(dynamic)';

    if (sku === 'actions_linux') {
      minutes += qty;
      cost += g;

      if (!byWorkflow[workflow]) byWorkflow[workflow] = { minutes: 0, cost: 0, runs: 0 };
      byWorkflow[workflow].minutes += qty;
      byWorkflow[workflow].cost += g;
      byWorkflow[workflow].runs += 1;

      if (!byUser[user]) byUser[user] = { minutes: 0, cost: 0 };
      byUser[user].minutes += qty;
      byUser[user].cost += g;

      if (!byDay[date]) byDay[date] = { minutes: 0, cost: 0 };
      byDay[date].minutes += qty;
      byDay[date].cost += g;

      const key = `${user}||${workflow}`;
      if (!byUserWorkflow[key]) byUserWorkflow[key] = { minutes: 0, cost: 0, runs: 0 };
      byUserWorkflow[key].minutes += qty;
      byUserWorkflow[key].cost += g;
      byUserWorkflow[key].runs += 1;
    } else if (sku === 'actions_storage') {
      storage += g;
    }
  }

  return {
    totals: { minutes, cost, storage, days: Object.keys(byDay).length },
    byWorkflow,
    byUser,
    byDay,
    byUserWorkflow,
  };
}

export const pct = (part, whole) => {
  if (!whole) return 'n/a ';
  return `${((part / whole) * 100).toFixed(1)}%`;
};

export function formatReport(agg) {
  const { totals, byWorkflow, byUser, byDay, byUserWorkflow } = agg;
  const out = [];

  out.push('=== TOTALS ===');
  out.push(`Total compute minutes: ${totals.minutes.toFixed(0)}`);
  out.push(`Total actions cost (Linux): $${totals.cost.toFixed(2)}`);
  out.push(`Total storage cost: $${totals.storage.toFixed(2)}`);
  out.push(`Grand total: $${(totals.cost + totals.storage).toFixed(2)}`);
  out.push(`Days covered: ${totals.days}`);

  out.push('');
  out.push('=== TOP 20 WORKFLOWS BY MINUTES ===');
  const sortedWf = Object.entries(byWorkflow).sort((a, b) => b[1].minutes - a[1].minutes);
  for (const [wf, stats] of sortedWf.slice(0, 20)) {
    const share = pct(stats.minutes, totals.minutes).padStart(6);
    const avg = stats.runs ? (stats.minutes / stats.runs).toFixed(1) : '0.0';
    out.push(
      `${share}  ${String(stats.minutes).padStart(6)}m  $${stats.cost.toFixed(2).padStart(7)}  runs:${String(stats.runs).padStart(4)}  avg:${avg.padStart(5)}m  ${wf.replace('.github/workflows/', '')}`
    );
  }

  out.push('');
  out.push('=== BY USER/BOT ===');
  const sortedUser = Object.entries(byUser).sort((a, b) => b[1].minutes - a[1].minutes);
  for (const [u, stats] of sortedUser) {
    const share = pct(stats.minutes, totals.minutes).padStart(6);
    out.push(`${share}  ${String(stats.minutes).padStart(6)}m  $${stats.cost.toFixed(2).padStart(7)}  ${u}`);
  }

  out.push('');
  out.push('=== DAILY BURN ===');
  const sortedDay = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [d, stats] of sortedDay) {
    out.push(`${d}  ${String(stats.minutes).padStart(5)}m  $${stats.cost.toFixed(2)}`);
  }

  out.push('');
  out.push('=== DEPENDABOT TOP COSTS ===');
  const depEntries = Object.entries(byUserWorkflow)
    .filter(([k]) => k.startsWith('dependabot[bot]||'))
    .sort((a, b) => b[1].minutes - a[1].minutes);
  for (const [k, stats] of depEntries.slice(0, 10)) {
    const wf = k.split('||')[1].replace('.github/workflows/', '');
    out.push(
      `  ${String(stats.minutes).padStart(5)}m  $${stats.cost.toFixed(2).padStart(6)}  runs:${String(stats.runs).padStart(3)}  ${wf}`
    );
  }
  const depTotal = depEntries.reduce((acc, [, s]) => acc + s.minutes, 0);
  out.push(`  DEPENDABOT TOTAL: ${depTotal}m (${pct(depTotal, totals.minutes)} of all minutes)`);

  return out.join('\n');
}

/**
 * Builds the structured artifact + provenance sidecar consumed by the
 * platform-health dashboard. Pure function — tests pass mocked clock/git.
 *
 * @param {Object}   args
 * @param {Object}   args.agg          - aggregate() output
 * @param {Object[]} args.rows         - raw parsed rows (for min/max date)
 * @param {string}   args.sourcePath   - path to the CSV that was parsed
 * @param {string}   args.sourceSha256 - sha256 of the source CSV bytes
 * @param {string}   args.gitHead      - git rev-parse HEAD (or "unknown")
 * @param {string}   args.generatedAt  - ISO 8601 timestamp
 * @param {number}   args.stalenessThresholdDays - default 30
 * @param {string=}  args.latestWorkflowRunAt - ISO timestamp of the most
 *                       recent workflow run observed via gh API. When given,
 *                       triggers a second staleness check: "runs have
 *                       happened since the CSV was exported".
 * @returns {{ artifact: object, provenance: object }}
 */
export function buildArtifact({
  agg,
  rows,
  sourcePath,
  sourceSha256,
  gitHead,
  generatedAt,
  stalenessThresholdDays = 30,
  latestWorkflowRunAt = null,
}) {
  const dates = rows
    .map((r) => r[resolveColumns(rows).date])
    .filter((d) => d && d !== '(unknown)')
    .sort();
  const minDate = dates[0] || null;
  const maxDate = dates[dates.length - 1] || null;

  const artifact = {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    source: {
      path: sourcePath,
      sha256: sourceSha256,
      min_date: minDate,
      max_date: maxDate,
      rows: rows.length,
    },
    totals: {
      compute_minutes: agg.totals.minutes,
      compute_cost_usd: Number(agg.totals.cost.toFixed(4)),
      storage_cost_usd: Number(agg.totals.storage.toFixed(4)),
      grand_total_usd: Number((agg.totals.cost + agg.totals.storage).toFixed(4)),
      days_covered: agg.totals.days,
    },
    by_workflow: agg.byWorkflow,
    by_user: agg.byUser,
    by_day: agg.byDay,
    by_user_workflow: agg.byUserWorkflow,
  };

  // Staleness has THREE checks, any one of which flips is_stale=true:
  //
  //   (a) No dated rows in the source CSV → can't reason about freshness.
  //   (b) Source CSV max date older than the threshold (default 30 days).
  //   (c) gh API reports workflow runs more recent than the source CSV's max
  //       date (means "CI has run since this CSV was exported"). Requires
  //       the caller to pass `latestWorkflowRunAt` — without it, this check
  //       is skipped and (a)+(b) still apply.
  //
  // The third check directly answers "is this artifact stale because new CI
  // runs happened after the CSV was exported?" which the date-only check
  // cannot.
  let isStale = false;
  let staleReason = null;
  if (!maxDate) {
    isStale = true;
    staleReason = 'no dated rows in source CSV';
  } else {
    const maxDateMs = Date.parse(maxDate);
    const nowMs = Date.parse(generatedAt);
    if (Number.isFinite(maxDateMs) && Number.isFinite(nowMs)) {
      const ageDays = Math.floor((nowMs - maxDateMs) / (1000 * 60 * 60 * 24));
      if (ageDays > stalenessThresholdDays) {
        isStale = true;
        staleReason = `source CSV max date ${maxDate} is ${ageDays} days old (threshold: ${stalenessThresholdDays} days)`;
      }
    }
    if (!isStale && latestWorkflowRunAt) {
      const runMs = Date.parse(latestWorkflowRunAt);
      if (Number.isFinite(runMs) && Number.isFinite(maxDateMs) && runMs > maxDateMs) {
        const gapHours = Math.floor((runMs - maxDateMs) / (1000 * 60 * 60));
        // 24h slack to absorb timezone alignment between GitHub billing
        // dates (UTC-day-boundary) and ISO 8601 run timestamps.
        if (gapHours > 24) {
          isStale = true;
          staleReason = `CI has run since CSV export: most recent run ${latestWorkflowRunAt} is ${gapHours}h after CSV max date ${maxDate}. Re-export the usage CSV.`;
        }
      }
    }
  }

  const artifactBytes = Buffer.from(JSON.stringify(artifact, null, 2), 'utf8');
  const artifactSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');

  const provenance = {
    schema_version: '1.0.0',
    artifact_file: 'latest.json',
    artifact_sha256: artifactSha256,
    generated_at: generatedAt,
    git_head: gitHead,
    source_csv_path: sourcePath,
    source_csv_sha256: sourceSha256,
    source_csv_min_date: minDate,
    source_csv_max_date: maxDate,
    source_csv_rows: rows.length,
    latest_observed_workflow_run_at: latestWorkflowRunAt,
    collected_by: 'tools/scripts/parse-actions-usage.mjs',
    collection_method: 'manual_csv_export',
    confidence: maxDate ? 'high' : 'low',
    staleness_threshold_days: stalenessThresholdDays,
    is_stale: isStale,
    stale_reason: staleReason,
  };

  return { artifact, provenance };
}

/**
 * Writes the artifact + provenance to disk under `outDir/`:
 *   outDir/latest.json
 *   outDir/latest.provenance.json
 *   outDir/history/<ISO8601>.json   (immutable snapshot, easy to trend)
 */
export function writeArtifact(outDir, { artifact, provenance }) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'history'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(artifact, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'latest.provenance.json'),
    JSON.stringify(provenance, null, 2)
  );
  const historyName = artifact.generated_at.replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(path.join(outDir, 'history', historyName), JSON.stringify(artifact, null, 2));
}

function safeGitHead() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// CLI entry — only runs when invoked directly. Tests import the module and
// call the pure functions above; they never trigger this branch.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${fileURLToPath(import.meta.url)}`).href
      && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

/**
 * Asks gh for the ISO timestamp of the most recent workflow run. Returns
 * null when `gh` is missing, unauthenticated, or rate-limited — the
 * caller treats null as "freshness check skipped" rather than failing.
 */
function fetchLatestWorkflowRunAt(repo) {
  try {
    const out = execSync(
      `gh api -H "Accept: application/vnd.github+json" "/repos/${repo}/actions/runs?per_page=1"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }
    );
    const json = JSON.parse(out);
    const run = json.workflow_runs && json.workflow_runs[0];
    return run ? run.run_started_at || run.created_at || null : null;
  } catch (e) {
    process.stderr.write(`warn: gh freshness check skipped (${e.message.slice(0, 120)})\n`);
    return null;
  }
}

if (isMain) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(
    args.filter((a) => a.startsWith('--')).map((a) => {
      const [k, v] = a.split('=');
      return [k.replace(/^--/, ''), v ?? true];
    })
  );
  const csvPath = positional[0];
  if (!csvPath) {
    console.error(
      'usage: node tools/scripts/parse-actions-usage.mjs <usage.csv>\n' +
        '       [--emit-json=<out-dir>]\n' +
        '       [--staleness-days=30]\n' +
        '       [--gh-freshness=<owner>/<repo>]   # adds "runs since CSV" staleness check via gh api'
    );
    process.exit(2);
  }
  const rawBytes = fs.readFileSync(csvPath);
  const raw = rawBytes.toString('utf8');
  const rows = parseCsv(raw);
  try {
    const agg = aggregate(rows);
    console.log(formatReport(agg));

    if (flags['emit-json']) {
      const outDir = flags['emit-json'];
      const sourceSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
      const stalenessDays = Number(flags['staleness-days'] ?? 30);
      const latestWorkflowRunAt = flags['gh-freshness']
        ? fetchLatestWorkflowRunAt(flags['gh-freshness'])
        : null;
      const { artifact, provenance } = buildArtifact({
        agg,
        rows,
        sourcePath: path.relative(process.cwd(), csvPath).replace(/\\/g, '/'),
        sourceSha256,
        gitHead: safeGitHead(),
        generatedAt: new Date().toISOString(),
        stalenessThresholdDays: stalenessDays,
        latestWorkflowRunAt,
      });
      writeArtifact(outDir, { artifact, provenance });
      console.log(`\nwrote ${path.join(outDir, 'latest.json')}`);
      console.log(`wrote ${path.join(outDir, 'latest.provenance.json')}`);
      if (provenance.is_stale) {
        console.warn(`warn: artifact marked stale: ${provenance.stale_reason}`);
      }
    }
  } catch (e) {
    if (e.code === 'MISSING_COLUMN') {
      console.error(`error: ${e.message}`);
      process.exit(3);
    }
    throw e;
  }
}
