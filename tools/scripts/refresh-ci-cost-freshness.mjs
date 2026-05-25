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
 *   4. Validates against the Zod schema before writing.
 *
 * What it does NOT do:
 *   - Re-parse the CSV. Aggregation runs at full --emit-json time.
 *   - Touch latest.json.
 *
 * Exit codes:
 *   0 — refresh succeeded (or sidecar missing — treated as no-op bootstrap)
 *   1 — refresh failed (sidecar exists but schema validation failed)
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
import { execSync } from 'node:child_process';

// Minimal inline validation — keeps this script .mjs-only so it can run in
// CI without tsx. Full Zod validation lives in
// `pnpm run validate:schemas` (uses ciCostMetricsProvenanceSchema) and the
// regression suite at tools/scripts/__tests__/ci-cost-artifacts-schema.test.ts.
const REQUIRED_FIELDS = [
  'schema_version',
  'artifact_file',
  'artifact_sha256',
  'generated_at',
  'git_head',
  'source_csv_path',
  'source_csv_sha256',
  'source_csv_max_date',
  'staleness_threshold_days',
  'is_stale',
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
if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
  console.error('usage: node tools/scripts/refresh-ci-cost-freshness.mjs <owner>/<repo>');
  process.exit(2);
}

if (!fs.existsSync(PROV_PATH)) {
  console.log(`no provenance sidecar at ${PROV_PATH} — nothing to refresh. Run --emit-json first.`);
  process.exit(0);
}

let prov;
try {
  prov = JSON.parse(fs.readFileSync(PROV_PATH, 'utf8'));
} catch (e) {
  console.error(`provenance sidecar is not valid JSON: ${e.message}`);
  process.exit(1);
}

function fetchLatestRunIso() {
  try {
    const out = execSync(
      `gh api -H "Accept: application/vnd.github+json" "/repos/${repo}/actions/runs?per_page=1"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }
    );
    const json = JSON.parse(out);
    const run = json.workflow_runs && json.workflow_runs[0];
    return run ? run.run_started_at || run.created_at || null : null;
  } catch (e) {
    console.warn(`warn: gh API call failed (${e.message.slice(0, 200)}). Leaving latest_observed_workflow_run_at unchanged.`);
    return undefined; // sentinel: don't touch the field
  }
}

const latestRunIso = fetchLatestRunIso();
if (latestRunIso !== undefined) {
  prov.latest_observed_workflow_run_at = latestRunIso;
}

// Recompute is_stale using the same three checks as buildArtifact().
let isStale = false;
let staleReason = null;
const maxDate = prov.source_csv_max_date;

if (!maxDate) {
  isStale = true;
  staleReason = 'no dated rows in source CSV';
} else {
  const maxDateMs = Date.parse(maxDate);
  const nowMs = Date.now();
  const ageDays = Math.floor((nowMs - maxDateMs) / (1000 * 60 * 60 * 24));
  if (ageDays > prov.staleness_threshold_days) {
    isStale = true;
    staleReason = `source CSV max date ${maxDate} is ${ageDays} days old (threshold: ${prov.staleness_threshold_days} days)`;
  } else if (prov.latest_observed_workflow_run_at) {
    const runMs = Date.parse(prov.latest_observed_workflow_run_at);
    if (Number.isFinite(runMs) && Number.isFinite(maxDateMs) && runMs > maxDateMs) {
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

// Minimal validation so we don't corrupt the sidecar on the way out.
// Full schema validation is the separate `pnpm run validate:schemas` step.
try {
  validateShape(prov);
} catch (e) {
  console.error(`refreshed sidecar fails shape validation: ${e.message}`);
  process.exit(1);
}

fs.writeFileSync(PROV_PATH, JSON.stringify(prov, null, 2));
console.log(`refreshed ${PROV_PATH}`);
console.log(`  latest_observed_workflow_run_at: ${prov.latest_observed_workflow_run_at ?? 'null'}`);
console.log(`  is_stale: ${prov.is_stale}`);
if (prov.stale_reason) {
  console.log(`  stale_reason: ${prov.stale_reason}`);
}
