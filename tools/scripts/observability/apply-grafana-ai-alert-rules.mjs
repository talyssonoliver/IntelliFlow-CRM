#!/usr/bin/env node
// Apply the AI-model alert rules in infra/monitoring/grafana/cloud/ai-alert-rules.json to the
// Grafana Cloud stack through the alerting provisioning API (IFC-117, ADR-088).
//
// A sibling of apply-grafana-alert-rules.mjs (IFC-032), not an extension of it: that script and
// its workflow are being changed by another lane (ENV-008-AI), and it PUTs its whole
// `intelliflow-prod` rule group, which would delete any rule it does not own. So these rules
// live in their own folder AND group (`intelliflow-ai`), every uid carries the `ifc117-` prefix,
// and this script rejects the IFC-032 folder/group outright. The shared HTTP client and payload
// shape come from ../lib/grafana-provisioning.mjs (read-only reuse).
//
// Each run:
//   1. validates the rules file (path segments, uid prefix, reserved names, metric names);
//   2. --dry-run: checks each selector's live series AND instant-queries each rule `expr`,
//      failing on a query Grafana rejects (a PromQL typo would otherwise page the owner through
//      execErrState=Error); writes nothing;
//   3. otherwise ensures the folder exists, creates or updates each rule by uid and PUTs only the
//      `intelliflow-ai` group. Nothing is ever deleted; there is no delivery-test rule.
//
// Until ai-worker is promoted every rule is requireSeries:false + noData:OK, so a merge before
// the metrics exist neither fails this job nor pages anyone.
//
// Usage (CI: .github/workflows/grafana-ai-alert-rules.yml):
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=<service account token> \
//     node tools/scripts/observability/apply-grafana-ai-alert-rules.mjs [--dry-run]
// The token is read from the environment only and is never printed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAlertRulePayload,
  createApiClient,
  querySeriesCount,
} from '../lib/grafana-provisioning.mjs';

export const RULES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'monitoring',
  'grafana',
  'cloud',
  'ai-alert-rules.json'
);

/** The IFC-032 folder and group (alert-rules.json); never reuse them. */
const RESERVED_FOLDER = 'intelliflow-prod';
const RESERVED_GROUP = 'intelliflow-prod';
const UID_PREFIX = 'ifc117-';
/** The one non-AI metric a rule may query: the LLM-span gate. */
const ALLOWED_FOREIGN_METRICS = new Set(['traces_spanmetrics_calls_total']);
const MAX_ERROR_TEXT = 200;

// Copied from apply-grafana-alert-rules.mjs (not imported: that file is being rewritten by
// another lane). The tests assert the two regexes stay identical. Every uid/name is
// interpolated into a URL path segment, so this charset keeps one segment from becoming two.
export const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

const PROMQL_WORDS = new Set([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'rate',
  'irate',
  'increase',
  'delta',
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'and',
  'or',
  'unless',
  'bool',
  'offset',
  'vector',
  'clamp_min',
  'clamp_max',
  'histogram_quantile',
  'time',
  'max_over_time',
  'min_over_time',
  'last_over_time',
  'absent',
  'absent_over_time',
  'abs',
  'scalar',
  'topk',
  'bottomk',
  'label_replace',
]);
const GROUPING_WORDS = new Set(['by', 'without', 'on', 'ignoring', 'group_left', 'group_right']);
const WORD = /[A-Za-z_:][A-Za-z0-9_:]*/g;

// Character scanners rather than regexes: PromQL is small and regular enough, and the scanners
// cannot backtrack (sonarjs/slow-regex).

/** `expr` with each string literal's content removed (`"…"` becomes `""`). */
function blankStrings(expr) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of String(expr)) {
    if (!inString) {
      if (ch === '"') inString = true;
      else out += ch;
    } else if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') {
      inString = false;
      out += '""';
    }
  }
  return out;
}

/** Splits `text` into what lies outside and inside `open…close` spans (PromQL never nests them). */
function splitSpans(text, open, close) {
  let outside = '';
  const inside = [];
  let current = null;
  for (const ch of text) {
    if (current === null) {
      if (ch === open) {
        current = '';
        outside += ' ';
      } else outside += ch;
    } else if (ch === close) {
      inside.push(current);
      current = null;
    } else current += ch;
  }
  return { outside, inside };
}

/** Metric names referenced by a PromQL expression (functions, keywords and labels excluded). */
export function metricNames(expr) {
  const noMatchers = splitSpans(blankStrings(expr), '{', '}').outside;
  const stripped = splitSpans(noMatchers, '[', ']').outside;
  const names = new Set();
  let skipUntil = -1;
  for (const m of stripped.matchAll(WORD)) {
    if (m.index < skipUntil) continue;
    const end = m.index + m[0].length;
    const after = stripped.slice(end).trimStart();
    if (GROUPING_WORDS.has(m[0]) && after.startsWith('(')) {
      skipUntil = stripped.indexOf(')', end);
      continue;
    }
    if (!after.startsWith('(') && !PROMQL_WORDS.has(m[0])) names.add(m[0]);
  }
  return [...names];
}

/** Label names used in the label matchers of a PromQL expression. */
export function labelNames(expr) {
  const out = new Set();
  for (const block of splitSpans(blankStrings(expr), '{', '}').inside) {
    for (const matcher of block.split(',')) {
      const name = matcher.trim().match(/^[A-Za-z_]\w*/)?.[0];
      if (name) out.add(name);
    }
  }
  return [...out];
}

/** Read `const NAME = /…/flags;` from source text; throws when absent (parity tests). */
export function extractConstRegexSource(sourceText, name) {
  const line = sourceText.split('\n').find((l) => l.trim().startsWith(`const ${name} = /`));
  if (!line) throw new Error(`parity source not found: const ${name}`);
  const literal = line.slice(line.indexOf('/'), line.lastIndexOf('/') + 1);
  return literal.slice(1, -1);
}

/** Strip anything bearer-shaped and the token itself, then truncate. */
export function redactText(text, token) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  out = out.replaceAll(/authorization\s*:\s*bearer\s+\S+/gi, '[redacted]');
  out = out.replaceAll(/\bbearer\s+\S+/gi, '[redacted]');
  out = out.replaceAll(/authorization/gi, '[redacted]');
  return out.slice(0, MAX_ERROR_TEXT);
}

/** Grafana alert rule (provisioning API shape) for one entry of the rules file. */
export function buildRule(entry, config) {
  return buildAlertRulePayload(entry, config, 'ifc-117');
}

function requireSegment(problems, label, value) {
  if (typeof value !== 'string' || !SAFE_PATH_SEGMENT.test(value))
    problems.push(`${label}: must match ${SAFE_PATH_SEGMENT} (got ${JSON.stringify(value)})`);
}

const REQUIRED_KEYS = [
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

function validateRule(entry, seen, problems) {
  const id = entry.uid ?? '?';
  for (const key of REQUIRED_KEYS) {
    if (entry[key] === undefined || entry[key] === '') problems.push(`${id}: missing ${key}`);
  }
  if (typeof entry.uid === 'string' && entry.uid !== '') {
    requireSegment(problems, `${id}: uid`, entry.uid);
    if (!entry.uid.startsWith(UID_PREFIX))
      problems.push(`${id}: uid must start with ${UID_PREFIX}`);
  }
  if (!['gt', 'lt'].includes(entry.operator)) problems.push(`${id}: operator must be gt or lt`);
  if (typeof entry.threshold !== 'number') problems.push(`${id}: threshold must be a number`);
  if (!['OK', 'Alerting', 'NoData'].includes(entry.noData)) problems.push(`${id}: bad noData`);
  if (seen.has(entry.uid)) problems.push(`${id}: duplicate uid`);
  seen.add(entry.uid);
  for (const field of ['expr', 'selector']) {
    for (const name of metricNames(entry[field] ?? '')) {
      if (!name.startsWith('intelliflow_ai_') && !ALLOWED_FOREIGN_METRICS.has(name))
        problems.push(`${id}: ${field} uses ${name}, which is not an intelliflow_ai_* metric`);
    }
  }
}

/** Validate the rules file before touching the API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  requireSegment(problems, 'folder.uid', config.folder?.uid);
  requireSegment(problems, 'group.name', config.group?.name);
  requireSegment(problems, 'datasourceUid', config.datasourceUid);
  if (config.folder?.uid === RESERVED_FOLDER)
    problems.push(
      `folder.uid: ${RESERVED_FOLDER} belongs to the IFC-032 rules; use your own folder`
    );
  if (config.group?.name === RESERVED_GROUP)
    problems.push(
      `group.name: ${RESERVED_GROUP} belongs to the IFC-032 rules; its PUT would delete these`
    );
  if (config.deliveryTest)
    problems.push('deliveryTest: not supported for the AI rules (IFC-032 owns delivery tests)');
  const seen = new Set();
  for (const entry of config.rules ?? []) validateRule(entry, seen, problems);
  return problems;
}

/** Instant-query a rule expression; returns null when Grafana accepts it, else a reason. */
async function exprProblem(api, datasourceUid, expr, token) {
  const query = encodeURIComponent(expr);
  const res = await api(
    'GET',
    `/api/datasources/proxy/uid/${datasourceUid}/api/v1/query?query=${query}`
  );
  if (res.status === 200 && res.json?.status === 'success') return null;
  return `HTTP ${res.status} ${redactText(res.json?.error ?? res.text, token)}`;
}

async function ensureFolder(api, config, token, log) {
  const folder = await api('GET', `/api/folders/${config.folder.uid}`);
  if (folder.status === 404) {
    const made = await api('POST', '/api/folders', {
      uid: config.folder.uid,
      title: config.folder.title,
    });
    if (made.status >= 300)
      throw new Error(`create folder: HTTP ${made.status} ${redactText(made.text, token)}`);
    log(`created folder ${config.folder.uid}`);
  } else if (folder.status !== 200) {
    throw new Error(`read folder: HTTP ${folder.status} ${redactText(folder.text, token)}`);
  }
}

async function upsertRules(api, config, token, log) {
  for (const entry of config.rules) {
    const rule = buildRule(entry, config);
    const existing = await api('GET', `/api/v1/provisioning/alert-rules/${entry.uid}`);
    const res =
      existing.status === 200
        ? await api('PUT', `/api/v1/provisioning/alert-rules/${entry.uid}`, rule)
        : await api('POST', '/api/v1/provisioning/alert-rules', rule);
    if (res.status >= 300)
      throw new Error(`${entry.uid}: HTTP ${res.status} ${redactText(res.text, token)}`);
    log(`${existing.status === 200 ? 'updated' : 'created'} ${entry.uid}`);
  }
  const group = await api(
    'PUT',
    `/api/v1/provisioning/folder/${config.folder.uid}/rule-groups/${config.group.name}`,
    {
      title: config.group.name,
      interval: config.group.intervalSeconds,
      rules: config.rules.map((entry) => buildRule(entry, config)),
    }
  );
  if (group.status >= 300)
    throw new Error(`rule group: HTTP ${group.status} ${redactText(group.text, token)}`);
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  rulesPath = RULES_PATH,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const config = JSON.parse(readFileSync(rulesPath, 'utf8'));

  const problems = validateConfig(config);
  if (problems.length) throw new Error(`rules file invalid:\n  ${problems.join('\n  ')}`);
  if (!env.GRAFANA_URL || !env.GRAFANA_SA_TOKEN) {
    throw new Error('GRAFANA_URL and GRAFANA_SA_TOKEN are required');
  }
  const token = env.GRAFANA_SA_TOKEN;
  const api = createApiClient(env.GRAFANA_URL, token, fetchImpl);

  const empty = [];
  for (const entry of config.rules) {
    const n = await querySeriesCount(api, config.datasourceUid, entry.selector);
    log(`series ${String(n).padStart(4)}  ${entry.uid}  ${entry.selector}`);
    if (n === 0 && entry.requireSeries !== false) empty.push(entry.uid);
  }

  if (dryRun) {
    const rejected = [];
    for (const entry of config.rules) {
      const problem = await exprProblem(api, config.datasourceUid, entry.expr, token);
      if (problem) rejected.push(`${entry.uid}: ${problem}`);
    }
    if (rejected.length)
      throw new Error(`Grafana rejected these rule expressions:\n  ${rejected.join('\n  ')}`);
    log(
      `dry run: ${config.rules.length} rule(s) valid and queryable; ${empty.length} without live series`
    );
    return { applied: 0, empty };
  }

  await ensureFolder(api, config, token, log);
  await upsertRules(api, config, token, log);

  if (empty.length) {
    throw new Error(
      `applied, but these rules match no live series (check metric names): ${empty.join(', ')}`
    );
  }
  return { applied: config.rules.length, empty };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(
      `[grafana-ai-alert-rules] ${redactText(err.message, process.env.GRAFANA_SA_TOKEN)}`
    );
    process.exit(1);
  });
}
