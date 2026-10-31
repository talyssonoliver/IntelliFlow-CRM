#!/usr/bin/env node
// Apply the production alert rules in infra/monitoring/grafana/cloud/alert-rules.json
// to the Grafana Cloud stack through the alerting provisioning API (IFC-032).
//
// The committed JSON is the source of truth. Each run:
//   1. ensures the folder exists;
//   2. checks that every rule's metric selector has had series in the last
//      7 days, and FAILS on any rule that would watch nothing (a rule over a
//      wrong metric name never fires and looks exactly like a healthy system).
//      The window is days, not minutes, because a quiet night (the api asleep,
//      the worker idle) is not a wrong name. An error-only matcher is left out
//      for the same reason: no errors is not a wrong name. A rule that alerts
//      on silence opts out with liveSeriesCheck:false. A rule on the logs
//      datasource (datasourceUid grafanacloud-logs) is checked through Loki's
//      series route instead, which proves its stream selector matches logs;
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
  DATASOURCE_KINDS,
  queryLokiSeriesCount,
  querySeriesCount,
  redactBody,
  requireEnv,
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

// Every uid/name below is interpolated straight into a URL path segment of a
// provisioning API call (see run()), so validateConfig restricts them to this
// charset first: no slash, question mark, hash, dot-dot or whitespace can turn
// one path segment into two, redirect the request to another endpoint, or
// smuggle a query string. The committed alert-rules.json is reviewed source,
// not runtime input, but the check costs nothing and holds if that changes.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function checkPathSegment(problems, label, value) {
  if (value !== undefined && value !== '' && !SAFE_PATH_SEGMENT.test(value))
    problems.push(`${label}: must match ${SAFE_PATH_SEGMENT} (got ${JSON.stringify(value)})`);
}

const REQUIRED_RULE_KEYS = [
  'uid',
  'title',
  'expr',
  'selector',
  'operator',
  'for',
  'noData',
  'severity',
  'summary',
];

// Must stay inside the query's 900 s relative range, with room for its window.
function isValidQueryOffset(offset) {
  return offset === undefined || (Number.isInteger(offset) && offset >= 0 && offset <= 600);
}

function validateRuleEntry(entry, seen, problems) {
  for (const key of REQUIRED_RULE_KEYS) {
    if (entry[key] === undefined || entry[key] === '')
      problems.push(`${entry.uid ?? '?'}: missing ${key}`);
  }
  checkPathSegment(problems, `${entry.uid ?? '?'}: uid`, entry.uid);
  if (!['gt', 'lt'].includes(entry.operator))
    problems.push(`${entry.uid}: operator must be gt or lt`);
  if (typeof entry.threshold !== 'number')
    problems.push(`${entry.uid}: threshold must be a number`);
  if (!['OK', 'Alerting', 'NoData'].includes(entry.noData))
    problems.push(`${entry.uid}: bad noData`);
  if (!isValidQueryOffset(entry.queryOffsetSeconds))
    problems.push(`${entry.uid}: queryOffsetSeconds must be a whole number from 0 to 600`);
  if (entry.datasourceUid !== undefined && !(entry.datasourceUid in DATASOURCE_KINDS))
    problems.push(
      `${entry.uid}: datasourceUid must be one of ${Object.keys(DATASOURCE_KINDS).join(', ')}`
    );
  for (const key of ['requireSeries', 'liveSeriesCheck']) {
    if (entry[key] !== undefined && typeof entry[key] !== 'boolean')
      problems.push(`${entry.uid}: ${key} must be true or false`);
  }
  if (seen.has(entry.uid)) problems.push(`${entry.uid}: duplicate uid`);
  seen.add(entry.uid);
}

// How far back the series check looks. Long enough to cover a night or a
// weekend with no traffic; a misspelled metric has no series at any range.
const SERIES_LOOKBACK = '7d';
const SERIES_LOOKBACK_SECONDS = 7 * 86400;
const METRIC_NAME = /^[A-Za-z_:][\w:]*$/;
const ERROR_ONLY_MATCHER = 'status_code="STATUS_CODE_ERROR"';

/** The matchers inside a selector's braces, split on commas outside quoted values. */
function splitMatchers(body) {
  const matchers = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted && ch === '\\') {
      current += ch + (body[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      matchers.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) matchers.push(current.trim());
  return matchers;
}

/**
 * The selector the live-series check queries. An error-only matcher
 * (status_code="STATUS_CODE_ERROR") matches nothing while there are no errors,
 * which is the healthy state, so it is dropped: the check then proves the base
 * metric exists for the same services, which is what catches a wrong name.
 */
export function liveSeriesSelector(selector) {
  const open = selector.indexOf('{');
  const name = selector.slice(0, open);
  if (open === -1 || !selector.endsWith('}') || !METRIC_NAME.test(name)) return selector;
  const kept = splitMatchers(selector.slice(open + 1, -1)).filter(
    (matcher) => matcher.replaceAll(' ', '') !== ERROR_ONLY_MATCHER
  );
  return kept.length ? `${name}{${kept.join(', ')}}` : name;
}

/**
 * Series a rule's selector has had over the lookback, asked of the rule's own
 * datasource: a Loki rule through the Loki series route (its selector is a
 * stream selector, not PromQL), every other rule through a PromQL count.
 */
function ruleSeriesCount(api, entry, config, nowMs) {
  const datasourceUid = entry.datasourceUid ?? config.datasourceUid;
  if (DATASOURCE_KINDS[datasourceUid] === 'loki')
    return queryLokiSeriesCount(api, datasourceUid, entry.selector, SERIES_LOOKBACK_SECONDS, nowMs);
  return querySeriesCount(api, datasourceUid, liveSeriesSelector(entry.selector), SERIES_LOOKBACK);
}

/** Validate the rules file before touching the API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  const seen = new Set();
  checkPathSegment(problems, 'folder.uid', config.folder?.uid);
  checkPathSegment(problems, 'group.name', config.group?.name);
  if (config.deliveryTest) checkPathSegment(problems, 'deliveryTest.uid', config.deliveryTest.uid);
  for (const entry of config.rules) validateRuleEntry(entry, seen, problems);
  return problems;
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  sleep,
  now = Date.now,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const sendTest = argv.includes('--send-test');
  const config = JSON.parse(readFileSync(RULES_PATH, 'utf8'));

  const problems = validateConfig(config);
  if (problems.length) throw new Error(`rules file invalid:\n  ${problems.join('\n  ')}`);
  requireEnv(env, ['GRAFANA_URL', 'GRAFANA_SA_TOKEN']);
  const api = createApiClient(env.GRAFANA_URL, env.GRAFANA_SA_TOKEN, fetchImpl, { sleep });

  // Every rule must watch metrics that exist, or it silently never fires.
  // A silence rule is skipped: it alerts when its series are absent, so a
  // wrong name there fires at once rather than hiding.
  const empty = [];
  for (const entry of config.rules) {
    if (entry.liveSeriesCheck === false) {
      log(`series skip  ${entry.uid}  (liveSeriesCheck: false)`);
      continue;
    }
    const n = await ruleSeriesCount(api, entry, config, now());
    log(`series ${String(n).padStart(4)}  ${entry.uid}  ${liveSeriesSelector(entry.selector)}`);
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
    if (made.status >= 300)
      throw new Error(`create folder: HTTP ${made.status} ${redactBody(made.text)}`);
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
    if (res.status >= 300)
      throw new Error(`${entry.uid}: HTTP ${res.status} ${redactBody(res.text)}`);
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
    throw new Error(`rule group interval: HTTP ${group.status} ${redactBody(group.text)}`);

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
