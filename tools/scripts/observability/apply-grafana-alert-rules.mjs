#!/usr/bin/env node
// Apply the production alert rules in infra/monitoring/grafana/cloud/alert-rules.json
// to the Grafana Cloud stack through the alerting provisioning API (IFC-032).
//
// The committed JSON is the source of truth. Each run:
//   1. ensures the folder exists;
//   2. checks that every rule's metric selector has live series, and FAILS
//      on any rule that would watch nothing (a rule over a wrong metric name
//      never fires and looks exactly like a healthy system);
//   3. creates or updates each rule by uid;
//   4. deletes the delivery-test rule, unless --send-test asks for it.
//
// Usage (CI: .github/workflows/grafana-alert-rules.yml):
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=<service account token> \
//     node tools/scripts/observability/apply-grafana-alert-rules.mjs [--dry-run] [--send-test]
// The token is read from the environment only and is never printed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAlertRulePayload,
  createApiClient,
  querySeriesCount,
} from '../lib/grafana-provisioning.mjs';

const RULES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'monitoring',
  'grafana',
  'cloud',
  'alert-rules.json'
);

/** Grafana alert rule (provisioning API shape) for one entry of the rules file. */
export function buildRule(entry, config) {
  return buildAlertRulePayload(entry, config, 'ifc-032');
}

/** Validate the rules file before touching the API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  const seen = new Set();
  for (const entry of config.rules) {
    for (const key of [
      'uid',
      'title',
      'expr',
      'selector',
      'operator',
      'for',
      'noData',
      'severity',
      'summary',
    ]) {
      if (entry[key] === undefined || entry[key] === '')
        problems.push(`${entry.uid ?? '?'}: missing ${key}`);
    }
    if (!['gt', 'lt'].includes(entry.operator))
      problems.push(`${entry.uid}: operator must be gt or lt`);
    if (typeof entry.threshold !== 'number')
      problems.push(`${entry.uid}: threshold must be a number`);
    if (!['OK', 'Alerting', 'NoData'].includes(entry.noData))
      problems.push(`${entry.uid}: bad noData`);
    if (seen.has(entry.uid)) problems.push(`${entry.uid}: duplicate uid`);
    seen.add(entry.uid);
  }
  return problems;
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const sendTest = argv.includes('--send-test');
  const config = JSON.parse(readFileSync(RULES_PATH, 'utf8'));

  const problems = validateConfig(config);
  if (problems.length) throw new Error(`rules file invalid:\n  ${problems.join('\n  ')}`);
  if (!env.GRAFANA_URL || !env.GRAFANA_SA_TOKEN) {
    throw new Error('GRAFANA_URL and GRAFANA_SA_TOKEN are required');
  }
  const api = createApiClient(env.GRAFANA_URL, env.GRAFANA_SA_TOKEN, fetchImpl);

  // Every rule must watch metrics that exist, or it silently never fires.
  const empty = [];
  for (const entry of config.rules) {
    const n = await querySeriesCount(api, config.datasourceUid, entry.selector);
    log(`series ${String(n).padStart(4)}  ${entry.uid}  ${entry.selector}`);
    if (n === 0 && entry.requireSeries !== false) empty.push(entry.uid);
  }

  if (dryRun) {
    log(`dry run: ${config.rules.length} rule(s) valid; ${empty.length} without live series`);
    return { applied: 0, empty };
  }

  const folder = await api('GET', `/api/folders/${config.folder.uid}`);
  if (folder.status === 404) {
    const made = await api('POST', '/api/folders', {
      uid: config.folder.uid,
      title: config.folder.title,
    });
    if (made.status >= 300) throw new Error(`create folder: HTTP ${made.status} ${made.text}`);
    log(`created folder ${config.folder.uid}`);
  } else if (folder.status !== 200) {
    throw new Error(`read folder: HTTP ${folder.status}`);
  }

  const entries = sendTest ? [...config.rules, config.deliveryTest] : config.rules;
  for (const entry of entries) {
    const rule = buildRule(entry, config);
    const existing = await api('GET', `/api/v1/provisioning/alert-rules/${entry.uid}`);
    const res =
      existing.status === 200
        ? await api('PUT', `/api/v1/provisioning/alert-rules/${entry.uid}`, rule)
        : await api('POST', '/api/v1/provisioning/alert-rules', rule);
    if (res.status >= 300) throw new Error(`${entry.uid}: HTTP ${res.status} ${res.text}`);
    log(`${existing.status === 200 ? 'updated' : 'created'} ${entry.uid}`);
  }

  const group = await api(
    'PUT',
    `/api/v1/provisioning/folder/${config.folder.uid}/rule-groups/${config.group.name}`,
    {
      title: config.group.name,
      interval: config.group.intervalSeconds,
      rules: entries.map((entry) => buildRule(entry, config)),
    }
  );
  if (group.status >= 300)
    throw new Error(`rule group interval: HTTP ${group.status} ${group.text}`);

  if (!sendTest) {
    const del = await api('DELETE', `/api/v1/provisioning/alert-rules/${config.deliveryTest.uid}`);
    if (del.status === 204) log(`deleted ${config.deliveryTest.uid}`);
  }

  if (empty.length) {
    throw new Error(
      `applied, but these rules match no live series (check metric names): ${empty.join(', ')}`
    );
  }
  return { applied: entries.length, empty };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(`[grafana-alert-rules] ${err.message}`);
    process.exit(1);
  });
}
