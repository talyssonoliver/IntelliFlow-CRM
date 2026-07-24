#!/usr/bin/env node
/**
 * IFC-033 load-test runner (`pnpm test:load`).
 *
 * Thin, cross-platform wrapper around k6 that runs the Sprint-19 critical-path
 * load test (tools/scripts/k6/ifc-033-critical-path.js) against a LOCAL, prod-safe
 * target and exports the real HTML report to artifacts/reports/load-test-report.html.
 *
 * Prerequisites (see docs/operations/runbooks/load-testing-local.md):
 *   - k6 installed (on PATH, or set K6_BIN)
 *   - apps/api running with ALLOW_DEV_AUTH_FALLBACK=true against the local test DB
 *   - a QUALIFIED-lead pool exported to tools/scripts/k6/.data/qualified-leads.json
 *
 * Env overrides: BASE_URL, INGEST_RPS, CONVERT_RPS, DURATION, K6_BIN,
 * K6_PROMETHEUS_RW_SERVER_URL (enables Grafana remote-write when set).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const script = resolve(here, 'ifc-033-critical-path.js');

function resolveK6() {
  if (process.env.K6_BIN && existsSync(process.env.K6_BIN)) return process.env.K6_BIN;
  // Rely on PATH by default; k6 resolves the platform binary.
  return 'k6';
}

const env = {
  ...process.env,
  BASE_URL: process.env.BASE_URL || 'http://localhost:4000',
  K6_WEB_DASHBOARD: process.env.K6_WEB_DASHBOARD || 'true',
  K6_WEB_DASHBOARD_EXPORT:
    process.env.K6_WEB_DASHBOARD_EXPORT || 'artifacts/reports/load-test-report.html',
  INGEST_RPS: process.env.INGEST_RPS || '6',
  CONVERT_RPS: process.env.CONVERT_RPS || '1',
  DURATION: process.env.DURATION || '3m',
};

// Enable Prometheus remote-write output only when a server URL is configured,
// so `pnpm test:load` also works without the monitoring stack up.
const args = ['run', '--no-color'];
if (process.env.K6_PROMETHEUS_RW_SERVER_URL) {
  args.push('--out', 'experimental-prometheus-rw');
  env.K6_PROMETHEUS_RW_TREND_STATS = env.K6_PROMETHEUS_RW_TREND_STATS || 'p(95),p(99),avg,min,max';
}
args.push(script);

const k6 = resolveK6();
console.log(`[test:load] ${k6} ${args.join(' ')}  (target ${env.BASE_URL})`);
const result = spawnSync(k6, args, { cwd: repoRoot, env, stdio: 'inherit', shell: false });

if (result.error) {
  console.error(`[test:load] failed to launch k6 (${result.error.message}).`);
  console.error('[test:load] Install k6 (winget/choco/brew) or set K6_BIN. See the runbook.');
  process.exit(127);
}
process.exit(result.status ?? 1);
