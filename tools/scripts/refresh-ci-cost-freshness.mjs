#!/usr/bin/env node
/**
 * Refreshes ONLY the freshness fields of the CI cost artifact's provenance
 * sidecar — without re-aggregating the underlying CSV. Designed to run
 * unconditionally on every scheduled governance-metrics tick so that
 * is_stale stays accurate even when the upstream CSV hasn't been
 * re-exported.
 *
 * What it does:
 *   1. Reads artifacts/reports/ci-cost/latest.provenance.json.
 *   2. Calls `gh api /repos/{owner}/{repo}/actions/runs?per_page=1` for
 *      the most recent workflow run timestamp.
 *   3. Updates latest_observed_workflow_run_at, is_stale, and stale_reason
 *      in place. Leaves every other field untouched.
 *   4. Runs a minimal required-fields shape check before writing back
 *      (every field listed in the Zod schema's required[] union). Full
 *      Zod validation runs separately as `pnpm run validate:schemas`.
 *
 * What it does NOT do:
 *   - Re-parse the CSV. Aggregation runs at full --emit-json time.
 *   - Touch latest.json.
 *
 * Exit codes:
 *   0 — refresh succeeded (or sidecar missing — treated as no-op bootstrap)
 *   1 — refresh failed (sidecar exists but shape validation failed)
 *   2 — usage error
 *
 * Usage:
 *   node tools/scripts/refresh-ci-cost-freshness.mjs <owner>/<repo>
 *
 * In CI: invoked from .github/workflows/governance-metrics.yml's
 * ci-cost-metrics job AFTER the (optional) parser run, so the freshness
 * fields reflect the latest gh-API run regardless of CSV availability.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// GitHub owner/repo segment regex. Per
// https://docs.github.com/en/rest/repos/repos: names are 1–100 chars of
// `[A-Za-z0-9._-]`. We accept exactly `<owner>/<repo>` with no leading or
// trailing whitespace and no extra slashes. This is the only allowlist
// between the CLI arg and the `gh` subprocess.
const GH_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9._-]{1,100}$/;

// Minimal required-fields validation. The full Zod schema in
// tools/scripts/lib/schemas/ci-cost-metrics.schema.ts is the source of
// truth — this list MUST stay aligned with that schema's `.object({...})`
// required keys. Drift is caught by the schema-conformance test in
// tools/scripts/__tests__/ci-cost-artifacts-schema.test.ts and by the
// repo-wide `pnpm run validate:schemas` step.
const REQUIRED_FIELDS = [
  'schema_version',
  'artifact_file',
  'artifact_sha256',
  'generated_at',
  'git_head',
  'source_csv_path',
  'source_csv_sha256',
  'source_csv_min_date',
  'source_csv_max_date',
  'source_csv_rows',
  'latest_observed_workflow_run_at',
  'collected_by',
  'collection_method',
  'confidence',
  'staleness_threshold_days',
  'is_stale',
  'stale_reason',
];

function validateShape(obj) {
  const missing = REQUIRED_FIELDS.filter((f) => !(f in obj));
  if (missing.length) {
    throw new Error(`sidecar missing required fields: ${missing.join(', ')}`);
  }
  if (typeof obj.is_stale !== 'boolean') {
    throw new Error(`is_stale must be boolean, got ${typeof obj.is_stale}`);
  }
  if (typeof obj.staleness_threshold_days !== 'number' || obj.staleness_threshold_days < 1) {
    throw new Error('staleness_threshold_days must be a positive number');
  }
}

const PROV_PATH = path.resolve('artifacts/reports/ci-cost/latest.provenance.json');

const repo = process.argv[2];
if (!repo || !GH_REPO_RE.test(repo)) {
  console.error(
    'usage: node tools/scripts/refresh-ci-cost-freshness.mjs <owner>/<repo>\n' +
      "  <owner>/<repo> must match GitHub's name rules (alphanumerics, '.', '_', '-')."
  );
  process.exit(2);
}

// Read sidecar. No existsSync probe before — a TOCTOU race window between
// existsSync and readFileSync would let a parallel writer slip in. Just
// try the read and treat ENOENT as the "bootstrap, nothing to do" case.
// (CodeQL js/file-system-race ignores this pattern.)
let provText;
try {
  provText = fs.readFileSync(PROV_PATH, 'utf8');
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log(
      `no provenance sidecar at ${PROV_PATH} — nothing to refresh. Run --emit-json first.`
    );
    process.exit(0);
  }
  console.error(`could not read provenance sidecar: ${e.message}`);
  process.exit(1);
}

let prov;
try {
  prov = JSON.parse(provText);
} catch (e) {
  console.error(`provenance sidecar is not valid JSON: ${e.message}`);
  process.exit(1);
}

/**
 * Asks gh for the most recent workflow run timestamp. Returns:
 *   string    — ISO 8601 timestamp (set the sidecar field)
 *   null      — gh returned no runs (still update field to null)
 *   undefined — gh failed (caller leaves the existing field untouched)
 *
 * spawnSync with shell:false + literal argv prevents any shell
 * interpretation of `repo` (already validated by GH_REPO_RE at startup,
 * but this is defence in depth).
 */
function fetchLatestRunIso() {
  const r = spawnSync(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github+json', `/repos/${repo}/actions/runs?per_page=1`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, shell: false }
  );
  if (r.status !== 0) {
    const reason = (r.stderr || r.error?.message || `exit ${r.status}`).toString().slice(0, 200);
    console.warn(
      `warn: gh API call failed (${reason}). Leaving latest_observed_workflow_run_at unchanged.`
    );
    return undefined;
  }
  try {
    const json = JSON.parse(r.stdout);
    const run = json.workflow_runs && json.workflow_runs[0];
    return run ? run.run_started_at || run.created_at || null : null;
  } catch (e) {
    console.warn(
      `warn: gh response unparseable (${e.message.slice(0, 80)}). Leaving latest_observed_workflow_run_at unchanged.`
    );
    return undefined;
  }
}

const latestRunIso = fetchLatestRunIso();
if (latestRunIso !== undefined) {
  prov.latest_observed_workflow_run_at = latestRunIso;
}

// Recompute is_stale using the same three checks as buildArtifact() in
// parse-actions-usage.mjs. Both implementations are exercised by the
// suite at tools/scripts/__tests__/parse-actions-usage.test.ts.
let isStale = false;
let staleReason = null;
const maxDate = prov.source_csv_max_date;
const maxDateMs = maxDate ? Date.parse(maxDate) : NaN;

if (!maxDate) {
  isStale = true;
  staleReason = 'no dated rows in source CSV';
} else if (!Number.isFinite(maxDateMs)) {
  // Sidecar carries a non-empty source_csv_max_date that does not parse —
  // treat as stale rather than silently passing (the previous shape
  // produced NaN ageDays which compared as false everywhere).
  isStale = true;
  staleReason = `source CSV max date '${maxDate}' is not parseable as a date`;
} else {
  const nowMs = Date.now();
  const ageDays = Math.floor((nowMs - maxDateMs) / (1000 * 60 * 60 * 24));
  if (ageDays > prov.staleness_threshold_days) {
    isStale = true;
    staleReason = `source CSV max date ${maxDate} is ${ageDays} days old (threshold: ${prov.staleness_threshold_days} days)`;
  } else if (prov.latest_observed_workflow_run_at) {
    const runMs = Date.parse(prov.latest_observed_workflow_run_at);
    if (Number.isFinite(runMs) && runMs > maxDateMs) {
      const gapHours = Math.floor((runMs - maxDateMs) / (1000 * 60 * 60));
      if (gapHours > 24) {
        isStale = true;
        staleReason = `CI has run since CSV export: most recent run ${prov.latest_observed_workflow_run_at} is ${gapHours}h after CSV max date ${maxDate}. Re-export the usage CSV.`;
      }
    }
  }
}

prov.is_stale = isStale;
prov.stale_reason = staleReason;
prov.generated_at = new Date().toISOString(); // freshness check time

try {
  validateShape(prov);
} catch (e) {
  console.error(`refreshed sidecar fails shape validation: ${e.message}`);
  process.exit(1);
}

// Write atomically: write to a sibling temp path, then rename. Avoids the
// reader-sees-partial-write race that plain writeFileSync can produce
// when another process is reading the sidecar concurrently. (CodeQL
// js/file-system-race is satisfied by rename; the read window is now
// constant-time on the underlying fs.)
const tmpPath = `${PROV_PATH}.tmp`;
fs.writeFileSync(tmpPath, JSON.stringify(prov, null, 2));
fs.renameSync(tmpPath, PROV_PATH);

console.log(`refreshed ${PROV_PATH}`);
console.log(`  latest_observed_workflow_run_at: ${prov.latest_observed_workflow_run_at ?? 'null'}`);
console.log(`  is_stale: ${prov.is_stale}`);
if (prov.stale_reason) {
  console.log(`  stale_reason: ${prov.stale_reason}`);
}
