#!/usr/bin/env node
/**
 * IFC-007 nightly SLO summary (issue #318).
 *
 * `.github/workflows/performance-gate.yml`'s `k6-nightly-1000vu` job runs
 * `tools/scripts/k6/load-test.js` (1000-VU ramp) with `--summary-export`,
 * then pipes that real k6 JSON through this script. The headline "1,000
 * concurrent users" claim (IFC-007) was previously backed by stub evidence
 * only (`.specify/sprints/sprint-3/attestations/IFC-007/attestation.json`,
 * kpi_results[0].actual: "1000 VU in k6 load-test.js stages" — never an
 * actual measured run). This script replaces that stub, one real nightly
 * run at a time, by extracting ONLY what k6 actually measured — every field
 * is either a real number from the summary or `null`, never guessed or
 * carried over from a previous run.
 *
 * Usage: node tools/scripts/k6/summarize-nightly-ifc007.mjs <k6-summary.json>
 * Writes: artifacts/benchmarks/ifc-007-nightly-slo.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The only directory this script may read from or write to. Set by its one
 * real caller, `.github/workflows/performance-gate.yml`'s `k6-nightly-1000vu`
 * job: `node tools/scripts/k6/summarize-nightly-ifc007.mjs
 * artifacts/benchmarks/nightly-1000vu-${{ github.run_id }}.json`. Both the
 * CLI-supplied summary path and this script's own output path must resolve
 * inside it, otherwise a crafted argument (e.g. `../../../etc/passwd`) could
 * read or overwrite a file outside the repo (jssecurity:S8707).
 */
const ALLOWED_ROOT = resolve('artifacts/benchmarks');

/**
 * Resolve `candidatePath` and refuse it unless it stays inside
 * `ALLOWED_ROOT`. Checks via `path.relative` (must not be absolute and must
 * not start with `..`) rather than a string prefix, so a sibling directory
 * that merely starts with the same name (e.g. `artifacts/benchmarks-evil`)
 * is still rejected.
 *
 * @param {string} candidatePath
 * @param {string} label - only used in the error message
 * @returns {string} absolute path, guaranteed inside ALLOWED_ROOT
 */
export function resolveWithinAllowedRoot(candidatePath, label) {
  const resolvedPath = resolve(candidatePath);
  const rel = relative(ALLOWED_ROOT, resolvedPath);
  const isInsideAllowedRoot = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (!isInsideAllowedRoot) {
    throw new Error(
      `[ifc-007] refusing ${label} path outside artifacts/benchmarks: ${candidatePath}`
    );
  }
  return resolvedPath;
}

/**
 * @param {unknown} k6Summary - parsed k6 --summary-export JSON
 * @param {{ runId?: string, generatedAt?: string }} [opts]
 */
export function buildIfc007Slo(k6Summary, opts = {}) {
  const runId = opts.runId ?? 'unknown';
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const metrics = /** @type {Record<string, { values?: Record<string, number> }>} */ (
    k6Summary?.metrics ?? {}
  );
  const httpDuration = metrics.http_req_duration?.values ?? {};
  const errorsValues = metrics.errors?.values ?? {};
  const httpReqsValues = metrics.http_reqs?.values ?? {};
  const vusMaxValues = metrics.vus_max?.values ?? {};

  const p95 = typeof httpDuration['p(95)'] === 'number' ? httpDuration['p(95)'] : null;
  const p99 = typeof httpDuration['p(99)'] === 'number' ? httpDuration['p(99)'] : null;
  const errorRate = typeof errorsValues.rate === 'number' ? errorsValues.rate : null;
  const requestsPerSecond = typeof httpReqsValues.rate === 'number' ? httpReqsValues.rate : null;
  const maxVUs = typeof vusMaxValues.value === 'number' ? vusMaxValues.value : null;

  return {
    task: 'IFC-007',
    source: 'real k6 run, tools/scripts/k6/load-test.js, nightly workflow (issue #318)',
    runId,
    generatedAt,
    concurrentUsersTarget: 1000,
    measured: {
      maxVUs,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      errorRate,
      requestsPerSecond,
    },
    slo: {
      p99Under100ms: p99 === null ? null : p99 < 100,
      errorRateUnder1Pct: errorRate === null ? null : errorRate < 0.01,
    },
  };
}

function main() {
  const summaryPath = process.argv[2];
  if (!summaryPath) {
    console.error('Usage: summarize-nightly-ifc007.mjs <k6-summary.json>');
    process.exitCode = 1;
    return;
  }

  let resolvedSummaryPath;
  try {
    resolvedSummaryPath = resolveWithinAllowedRoot(summaryPath, 'input summary');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const k6Summary = JSON.parse(readFileSync(resolvedSummaryPath, 'utf-8'));
  const runId = process.env.GITHUB_RUN_ID ?? 'local';
  const result = buildIfc007Slo(k6Summary, { runId });

  const outPath = resolveWithinAllowedRoot(
    'artifacts/benchmarks/ifc-007-nightly-slo.json',
    'output'
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`[ifc-007] wrote ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
