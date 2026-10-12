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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  const k6Summary = JSON.parse(readFileSync(resolve(summaryPath), 'utf-8'));
  const runId = process.env.GITHUB_RUN_ID ?? 'local';
  const result = buildIfc007Slo(k6Summary, { runId });

  const outPath = resolve('artifacts/benchmarks/ifc-007-nightly-slo.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`[ifc-007] wrote ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
