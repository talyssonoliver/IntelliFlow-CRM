#!/usr/bin/env node
// Apply the production service dashboard in
// infra/monitoring/grafana/cloud/dashboard-production.json to the Grafana Cloud
// stack (ENV-008-AI, ADR-087).
//
// The committed JSON is the source of truth. The dashboard has a fixed uid and
// is saved with overwrite, so a run always replaces it with the committed copy.
// The folder is not created here: the alert-rules workflow owns it, and a
// missing folder fails the run.
//
// Usage (CI: .github/workflows/grafana-dashboard.yml):
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=<service account token> \
//     node tools/scripts/observability/apply-grafana-dashboard.mjs [--dry-run]
// The token is read from the environment only and is never printed.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGrafanaClient, loadValidConfig, redactBody } from '../lib/grafana-provisioning.mjs';

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'monitoring',
  'grafana',
  'cloud',
  'dashboard-production.json'
);
const DASHBOARD_UID = 'env008-production';
const FOLDER_UID = 'intelliflow-prod';
// The only series production has (native histograms, no _bucket), and the only
// services that emit telemetry today. Anything else would draw an empty panel.
const ALLOWED_METRICS = new Set(['traces_spanmetrics_calls_total', 'traces_spanmetrics_latency']);
const ALLOWED_SERVICES = new Set(['api', 'ai-worker']);
const PROM_UID = 'grafanacloud-prom';
// The Loki datasources a panel may read, each with the only stream it may select:
// ai-worker's logs (the combined worker logs as ai-worker), and the alert state history.
const LOKI_STREAMS = {
  'grafanacloud-logs': '{service_name="ai-worker"}',
  'grafanacloud-alert-state-history': '{from="state-history"}',
};

/** The identifier right before each `{` in a PromQL expression: its metric names. */
function metricNames(expr) {
  const names = [];
  for (let i = expr.indexOf('{'); i !== -1; i = expr.indexOf('{', i + 1)) {
    let start = i;
    while (start > 0 && /[\w:]/.test(expr[start - 1])) start -= 1;
    if (start < i) names.push(expr.slice(start, i));
  }
  return names;
}

function checkExpr(problems, label, expr) {
  if (expr.includes('_bucket')) problems.push(`${label}: uses a _bucket series`);
  for (const metric of metricNames(expr)) {
    if (!ALLOWED_METRICS.has(metric)) problems.push(`${label}: metric ${metric} is not emitted`);
  }
  // (?<!\w): a label that merely ends in `service` (peer_service) is not it.
  const matchers = [...expr.matchAll(/(?<!\w)service(=~|!~|!=|=)"([^"]*)"/g)];
  if (matchers.length === 0) problems.push(`${label}: no service matcher`);
  for (const [, op, value] of matchers) {
    if (op === '!=' || op === '!~') {
      problems.push(`${label}: service ${op} matches services that emit nothing`);
      continue;
    }
    const values = op === '=~' ? value.split('|') : [value];
    for (const v of values) {
      if (!ALLOWED_SERVICES.has(v)) problems.push(`${label}: service ${v} emits no telemetry`);
    }
  }
}

/** Every `{...}` stream selector in a LogQL expression, in order. */
function streamSelectors(expr) {
  const selectors = [];
  for (let i = expr.indexOf('{'); i !== -1; i = expr.indexOf('{', i + 1)) {
    const end = expr.indexOf('}', i);
    if (end === -1) break;
    selectors.push(expr.slice(i, end + 1));
  }
  return selectors;
}

/** A Loki target may select only the one stream its datasource is allowed (IFC-074 D8). */
function checkLokiExpr(problems, label, stream, expr) {
  const selectors = streamSelectors(expr);
  if (selectors.length === 0 || selectors.some((s) => s !== stream))
    problems.push(`${label}: Loki stream must be ${stream}`);
}

/** Validate the dashboard file before touching the API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  // Panels inside a collapsed row sit in row.panels; check those as well.
  const panels = (config.dashboard?.panels ?? []).flatMap((panel) => [
    panel,
    ...(panel.panels ?? []),
  ]);
  panels.forEach((panel, p) => {
    (panel.targets ?? []).forEach((target, t) => {
      const label = `panel ${p + 1} target ${t + 1}`;
      const uid = target.datasource?.uid ?? PROM_UID;
      if (uid === PROM_UID) checkExpr(problems, label, target.expr ?? '');
      else if (Object.hasOwn(LOKI_STREAMS, uid))
        checkLokiExpr(problems, label, LOKI_STREAMS[uid], target.expr ?? '');
      else problems.push(`${label}: datasource ${uid} is not allowed`);
    });
  });
  if (config.dashboard?.uid !== DASHBOARD_UID)
    problems.push(`dashboard.uid must be ${DASHBOARD_UID}`);
  if (config.folderUid !== FOLDER_UID) problems.push(`folderUid must be ${FOLDER_UID}`);
  return problems;
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  sleep,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const config = loadValidConfig(CONFIG_PATH, validateConfig, 'dashboard file');
  const api = createGrafanaClient(env, fetchImpl, sleep);

  const folder = await api('GET', `/api/folders/${config.folderUid}`);
  if (folder.status !== 200) throw new Error(`folder ${config.folderUid}: HTTP ${folder.status}`);

  const existing = await api('GET', `/api/dashboards/uid/${config.dashboard.uid}`);
  const existed = existing.status === 200;
  if (dryRun) {
    log(
      `${config.dashboard.uid}: ${existed ? 'present (would update)' : 'missing (would create)'}`
    );
    log('dry run: writes nothing');
    return { applied: false, existed };
  }

  const res = await api('POST', '/api/dashboards/db', {
    dashboard: config.dashboard,
    folderUid: config.folderUid,
    overwrite: true,
    message: 'ENV-008-AI dashboard as code',
  });
  if (res.status >= 300)
    throw new Error(`save dashboard: HTTP ${res.status} ${redactBody(res.text)}`);
  log(`${existed ? 'updated' : 'created'} dashboard ${config.dashboard.uid}`);
  return { applied: true, existed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(`[grafana-dashboard] ${err.message}`);
    process.exit(1);
  });
}
