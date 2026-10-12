#!/usr/bin/env node
// Apply the Grafana Cloud Synthetic Monitoring check + alert rule described in
// infra/monitoring/grafana/cloud/synthetic-monitoring.json (IFC-032 follow-up,
// #811: alert-rules.json's span-metric rules cannot see whether the production
// API is reachable from outside; that needs an external probe).
//
// The committed JSON is the source of truth. Each run talks to two different
// APIs:
//   1. The Synthetic Monitoring API (SM_API_URL/SM_ACCESS_TOKEN) — resolves
//      each configured probe location name to its numeric id (and FAILS on any
//      name that doesn't exist, because a check bound to zero probes runs
//      silently and looks exactly like a healthy system), then creates or
//      updates the HTTP check by job name.
//   2. The same Grafana Alerting provisioning API
//      apply-grafana-alert-rules.mjs uses (GRAFANA_URL/GRAFANA_SA_TOKEN) —
//      creates or updates ONE alert rule over the probe_success metric the
//      check publishes, in the same "intelliflow-prod" folder IFC-032's
//      rules already live in, but its OWN "intelliflow-prod-synthetic" rule
//      group — never the same group name as alert-rules.json's. This
//      deliberately uses only the per-uid provisioning endpoints and NEVER
//      the folder/rule-group PUT that apply-grafana-alert-rules.mjs uses to
//      set its group's evaluation interval — that call REPLACES the named
//      group's entire rule list from that script's own config.rules alone.
//      A shared group name would mean THAT script's normal runs (triggered
//      by any push touching alert-rules.json, or by hand via
//      workflow_dispatch) silently delete this rule with no error; keeping
//      the group names distinct makes that impossible even though this
//      script never calls the endpoint itself.
// A brand-new check has not published probe_success yet, so the live-series
// check only runs when the check already existed before this run.
//
// Usage (CI: .github/workflows/synthetic-monitoring.yml):
//   SM_API_URL=https://synthetic-monitoring-api-<region>.grafana.net \
//   SM_ACCESS_TOKEN=<Synthetic Monitoring publish token> \
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=<service account token> \
//     node tools/scripts/observability/apply-synthetic-monitoring.mjs [--dry-run]
// Neither token is ever printed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'monitoring',
  'grafana',
  'cloud',
  'synthetic-monitoring.json'
);

/** Validate the config before touching either API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  const check = config.check ?? {};
  if (!check.job) problems.push('check: missing job');
  if (!check.target || !String(check.target).startsWith('https://'))
    problems.push('check: target must be an https URL');
  if (
    typeof check.frequencySeconds !== 'number' ||
    check.frequencySeconds < 60 ||
    check.frequencySeconds > 300
  )
    problems.push('check: frequencySeconds must be between 60 and 300 (1-5 minutes)');
  if (
    typeof check.timeoutSeconds !== 'number' ||
    typeof check.frequencySeconds !== 'number' ||
    check.timeoutSeconds >= check.frequencySeconds
  )
    problems.push('check: timeoutSeconds must be less than frequencySeconds');
  if (!Array.isArray(check.probeNames) || check.probeNames.length === 0)
    problems.push('check: probeNames must be a non-empty array');
  if (!check.http?.method) problems.push('check: missing http.method');
  if (!Array.isArray(check.http?.validStatusCodes) || check.http.validStatusCodes.length === 0)
    problems.push('check: http.validStatusCodes must be a non-empty array');

  const rule = config.alertRule ?? {};
  if (!['gt', 'lt'].includes(rule.operator))
    problems.push(`${rule.uid ?? '?'}: operator must be gt or lt`);
  if (typeof rule.threshold !== 'number')
    problems.push(`${rule.uid ?? '?'}: threshold must be a number`);
  for (const key of ['uid', 'title', 'expr', 'selector', 'for', 'noData', 'severity', 'summary']) {
    if (rule[key] === undefined || rule[key] === '')
      problems.push(`${rule.uid ?? '?'}: missing ${key}`);
  }
  if (rule.noData !== undefined && !['OK', 'Alerting', 'NoData'].includes(rule.noData))
    problems.push(`${rule.uid ?? '?'}: bad noData`);

  return problems;
}

/** Synthetic Monitoring API payload (check/add and check/update share this shape). */
export function buildCheckPayload(check, probeIds) {
  return {
    job: check.job,
    target: check.target,
    frequency: check.frequencySeconds * 1000,
    timeout: check.timeoutSeconds * 1000,
    enabled: true,
    probes: probeIds,
    labels: check.labels ?? [],
    settings: {
      http: {
        method: check.http.method,
        ipVersion: check.http.ipVersion,
        noFollowRedirects: check.http.noFollowRedirects,
        validStatusCodes: check.http.validStatusCodes,
      },
    },
  };
}

/** Grafana alert rule (provisioning API shape) for the probe_success rule. */
export function buildAlertRule(entry, config) {
  return {
    uid: entry.uid,
    title: entry.title,
    folderUID: config.folder.uid,
    ruleGroup: config.group.name,
    condition: 'C',
    noDataState: entry.noData,
    execErrState: 'Error',
    for: entry.for,
    labels: { severity: entry.severity, team: 'owner', source: 'ifc-811' },
    annotations: { summary: entry.summary },
    isPaused: false,
    data: [
      {
        refId: 'A',
        relativeTimeRange: { from: 900, to: 0 },
        datasourceUid: config.datasourceUid,
        model: {
          refId: 'A',
          expr: entry.expr,
          instant: true,
          intervalMs: 60000,
          maxDataPoints: 43200,
        },
      },
      {
        refId: 'B',
        datasourceUid: '__expr__',
        model: { refId: 'B', type: 'reduce', expression: 'A', reducer: 'last' },
      },
      {
        refId: 'C',
        datasourceUid: '__expr__',
        model: {
          refId: 'C',
          type: 'threshold',
          expression: 'B',
          conditions: [{ evaluator: { type: entry.operator, params: [entry.threshold] } }],
        },
      },
    ],
  };
}

function client(baseUrl, token, fetchImpl) {
  return async (method, path, body) => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Keep the rule editable in the UI (no provenance lock), matching
        // apply-grafana-alert-rules.mjs.
        'X-Disable-Provenance': 'true',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text };
  };
}

/** Number of live series the alert's selector matches over the last hour. */
async function seriesCount(api, datasourceUid, selector) {
  const query = encodeURIComponent(`count(last_over_time(${selector}[1h]))`);
  const res = await api(
    'GET',
    `/api/datasources/proxy/uid/${datasourceUid}/api/v1/query?query=${query}`
  );
  if (res.status !== 200) throw new Error(`series check for ${selector}: HTTP ${res.status}`);
  const value = res.json?.data?.result?.[0]?.value?.[1];
  return value === undefined ? 0 : Number(value);
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const problems = validateConfig(config);
  if (problems.length) throw new Error(`config invalid:\n  ${problems.join('\n  ')}`);
  if (!env.SM_API_URL || !env.SM_ACCESS_TOKEN) {
    throw new Error('SM_API_URL and SM_ACCESS_TOKEN are required');
  }
  if (!env.GRAFANA_URL || !env.GRAFANA_SA_TOKEN) {
    throw new Error('GRAFANA_URL and GRAFANA_SA_TOKEN are required');
  }

  const sm = client(env.SM_API_URL, env.SM_ACCESS_TOKEN, fetchImpl);
  const grafana = client(env.GRAFANA_URL, env.GRAFANA_SA_TOKEN, fetchImpl);

  // Resolve probe location names to ids. Fail loud rather than silently
  // creating a check that watches from nowhere.
  const probesRes = await sm('GET', '/api/v1/probe/list');
  if (probesRes.status !== 200) throw new Error(`list probes: HTTP ${probesRes.status}`);
  const byName = new Map((probesRes.json ?? []).map((p) => [p.name, p.id]));
  const probeIds = [];
  const missing = [];
  for (const name of config.check.probeNames) {
    if (byName.has(name)) probeIds.push(byName.get(name));
    else missing.push(name);
  }
  if (missing.length) throw new Error(`unknown probe name(s): ${missing.join(', ')}`);

  const checksRes = await sm('GET', '/api/v1/check/list');
  if (checksRes.status !== 200) throw new Error(`list checks: HTTP ${checksRes.status}`);
  const existingCheck = (checksRes.json ?? []).find((c) => c.job === config.check.job);
  const checkPayload = buildCheckPayload(config.check, probeIds);

  if (dryRun) {
    log(`probes resolved: ${probeIds.join(', ')}`);
    log(`check: would ${existingCheck ? 'update' : 'create'} ${config.check.job}`);
    log('dry run: writes nothing');
    return {
      check: existingCheck ? 'updated' : 'created',
      alertRule: 'created',
      probeIds,
      seriesChecked: false,
      empty: [],
    };
  }

  // 1. The check itself.
  const checkRes = existingCheck
    ? await sm('POST', '/api/v1/check/update', { id: existingCheck.id, ...checkPayload })
    : await sm('POST', '/api/v1/check/add', checkPayload);
  if (checkRes.status >= 300)
    throw new Error(`apply check: HTTP ${checkRes.status} ${checkRes.text}`);
  log(`${existingCheck ? 'updated' : 'created'} check ${config.check.job}`);

  // 2. The alert rule. See the module comment: never touches the
  // folder/rule-group PUT endpoint, only create/update by uid.
  const folder = await grafana('GET', `/api/folders/${config.folder.uid}`);
  if (folder.status === 404) {
    const made = await grafana('POST', '/api/folders', {
      uid: config.folder.uid,
      title: config.folder.title,
    });
    if (made.status >= 300) throw new Error(`create folder: HTTP ${made.status} ${made.text}`);
    log(`created folder ${config.folder.uid}`);
  } else if (folder.status !== 200) {
    throw new Error(`read folder: HTTP ${folder.status}`);
  }

  const rule = buildAlertRule(config.alertRule, config);
  const existingRule = await grafana(
    'GET',
    `/api/v1/provisioning/alert-rules/${config.alertRule.uid}`
  );
  const ruleRes =
    existingRule.status === 200
      ? await grafana('PUT', `/api/v1/provisioning/alert-rules/${config.alertRule.uid}`, rule)
      : await grafana('POST', '/api/v1/provisioning/alert-rules', rule);
  if (ruleRes.status >= 300)
    throw new Error(`${config.alertRule.uid}: HTTP ${ruleRes.status} ${ruleRes.text}`);
  log(`${existingRule.status === 200 ? 'updated' : 'created'} ${config.alertRule.uid}`);

  // 3. Only prove the alert watches a metric that exists when the check was
  // already running before this call — a brand-new check hasn't published
  // probe_success yet, so checking here would always fail.
  let seriesChecked = false;
  const empty = [];
  if (existingCheck) {
    seriesChecked = true;
    const n = await seriesCount(grafana, config.datasourceUid, config.alertRule.selector);
    log(`series ${n}  ${config.alertRule.uid}  ${config.alertRule.selector}`);
    if (n === 0) empty.push(config.alertRule.uid);
  }

  if (empty.length) {
    throw new Error(
      `alert rule watches no live series (check that the probe is running): ${empty.join(', ')}`
    );
  }

  return {
    check: existingCheck ? 'updated' : 'created',
    alertRule: existingRule.status === 200 ? 'updated' : 'created',
    probeIds,
    seriesChecked,
    empty,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(`[synthetic-monitoring] ${err.message}`);
    process.exit(1);
  });
}
