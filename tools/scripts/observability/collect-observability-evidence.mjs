#!/usr/bin/env node
// IFC-074 evidence collector — read-only, production telemetry only (ADR-086).
//
// Reads Grafana Cloud (Loki, Tempo, span-metrics Prometheus, alert state
// history, alerting provisioning API) and writes:
//   artifacts/reports/correlation-test.csv  log line -> trace -> span -> span metrics
//   artifacts/reports/mttr-baseline.json    MTTD from real Alerting transitions
//
// Nothing here is hand-written: every row and number comes from a query made
// by this run. Outputs carry only allowlisted fields (hex ids, service names,
// timestamps, numbers, rule uids/alertnames, sanitised span names) and are
// validated before anything is written; a value outside the allowlist aborts
// the run with nothing written (fail closed).
//
// Usage (local only, never in CI):
//   GRAFANA_URL=<stack url> GRAFANA_SA_TOKEN=<token, env only> \
//     node tools/scripts/observability/collect-observability-evidence.mjs \
//       [--services api,ai-worker] [--log-window-days 7] [--alert-window-days 30] \
//       [--max-traces 10] [--since <ISO>] [--out-dir artifacts/reports] [--dry-run]
//
// Exit: 0 written and complete · 2 written but ai-worker has no PASS row or no
// incident could be anchored · 1 error, nothing written.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReadOnlyClient,
  buildAlertRulePayload,
  getRuleGroup,
  grafanaHealth,
  listAlertRules,
  lokiQueryRange,
  promInstantQuery,
  promRangeQuery,
  ruleStatus,
  tempoSearch,
  tempoTrace,
} from '../lib/grafana-provisioning.mjs';

const DS = {
  logs: 'grafanacloud-logs',
  traces: 'grafanacloud-traces',
  prom: 'grafanacloud-prom',
  history: 'grafanacloud-alert-state-history',
};
const DAY_S = 86400;
const SLICE_DAYS = 7;
const INCIDENT_GAP_S = 1800;
const ERROR_LOOKBACK_S = 1800;
const EPISODE_JOIN_S = 600;
const SEARCH_PAGE = 50;
const MAX_NARROWING = 20;
const HISTORY_LINE_LIMIT = 5000;
const KPI_TARGET_S = 120;
// How a committed rule is checked against its own query: over at most this
// much of the alert window at 60 s steps, and once per episode at this offset
// after the first error (span metrics land about 60 s after the span).
const CONDITION_LOOKBACK_MAX_S = 3 * DAY_S;
const CONDITION_STEP_S = 60;
const CONDITION_PROBE_S = 120;
const TIMELINE_S = 600;
const TIMELINE_STEP_S = 15;
// Error-level log lines counted around each episode's first error span.
const LOG_COVERAGE_WINDOW_S = 60;
const LOG_COVERAGE_LIMIT = 100;
const ERROR_LEVEL_FILTER =
  'detected_level=~"(?i)error|fatal|critical" or severity_text=~"(?i)error|fatal|critical"';
// The source label apply-grafana-alert-rules.mjs gives the repo's rules.
const REPO_RULE_SOURCE = 'ifc-032';
const COMPARATORS = {
  gt: { promql: '>', holds: (value, threshold) => value > threshold },
  lt: { promql: '<', holds: (value, threshold) => value < threshold },
};
const STATE_WORDS = new Set(['Normal', 'Pending', 'Alerting', 'Recovering', 'NoData', 'Error']);
const LIVE_HEALTH = new Set(['ok', 'error', 'nodata', 'unknown']);
const LIVE_STATE = new Set(['inactive', 'pending', 'firing', 'recovering', 'normal', 'alerting']);
const REQUIRED_SERVICE = 'ai-worker';
const REPO_RULES_FILE = 'infra/monitoring/grafana/cloud/alert-rules.json';

const CSV_COLUMNS = [
  'test_id',
  'service',
  'trace_id',
  'span_id',
  'log_ts',
  'span_name',
  'trace_found',
  'span_found',
  'service_match',
  'metric_series',
  'status',
  'passed',
  'query_window_start',
  'query_window_end',
  'collected_at',
];

const RE = {
  service: /^[a-z0-9-]{1,40}$/,
  trace: /^[0-9a-f]{32}$/,
  span: /^[0-9a-f]{16}$/,
  ts: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?Z$/,
  num: /^\d{1,12}(\.\d{1,3})?$/,
  signedNum: /^-?\d{1,12}(\.\d{1,3})?$/,
  bool: /^(true|false)$/,
  status: /^(PASS|FAIL|NOT_OBSERVED)$/,
  testId: /^\d{3}$/,
  uid: /^[A-Za-z0-9_-]{1,64}$/,
  alertname: /^[A-Za-z][A-Za-z0-9_:]{0,63}$/,
  spanName: /^[A-Za-z0-9_.:/ -]{1,80}$/,
  duration: /^(?:\d{1,6}(?:ms|s|m|h|d)){1,4}$|^0$/,
};

const HOST_TLDS = new Set([
  'com',
  'net',
  'org',
  'io',
  'dev',
  'co',
  'uk',
  'app',
  'cloud',
  'internal',
  'local',
  'invalid',
  'ai',
  'sh',
  'xyz',
]);
/** A token of three or more dot-separated labels ending in a known TLD, e.g. a pooler host. */
function looksLikeHost(text) {
  return text.split(/[\s/:@]/).some((token) => {
    const labels = token.toLowerCase().split('.');
    return (
      labels.length >= 3 &&
      labels.every((label) => /^[a-z0-9-]{1,63}$/.test(label)) &&
      HOST_TLDS.has(labels.at(-1))
    );
  });
}
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-/i;
const HEX_RUN = /[0-9a-f]{8,}/;
const DIGIT_RUN = /\d{6,}/;

export const EXCLUSION_REASONS = {
  deliveryTest: 'IFC-032 delivery test rule (vector(1)); proves alert delivery, not detection',
  assertsUp: 'asserts_up detects missing telemetry, not errors',
};
const EXCLUDED_ALERTNAMES = { asserts_up: EXCLUSION_REASONS.assertsUp };

const CAUSES = {
  pendingPeriod:
    'Rule pending period (for) and evaluation interval delay the Alerting transition after errors start',
  detectionLatency: 'Errors started before the rule condition crossed its threshold',
};

const LIMITATIONS = [
  'Span sampling can make the first recorded error later than the true onset, so MTTD can be understated.',
  'Span start times use the service clock and alert transitions the Grafana ruler clock; a negative difference is marked unanchored.',
  'Grafana-managed (App Observability) rules are read live from the provisioning API; their settings are not in the repo.',
  'Auto-resolve time is the Alerting to Normal transition of the rule, not a human resolution time.',
  'Incidents are runs of Alerting transitions per rule and service split by a gap of 30 minutes or more.',
  "The KPI is judged per error episode: anchored incidents of one service whose first error spans start within 10 minutes of the episode's first error are one episode, detected by the earliest alert from any rule.",
  'Only episodes whose first error is inside the alert window count; with --since the window starts at --since.',
  'Log coverage counts error-level Loki lines (by detected level or severity text) of the same service within 60 s of the first error span, at most 100 per episode; it does not prove a line describes the same error.',
  "The repo rule checks re-evaluate each committed rule's query in Prometheus at 60 s steps; it shows whether the condition held, not how Grafana evaluated it.",
];
const TRUNCATION_LIMITATION =
  'An alert-history slice returned the Loki line limit; some transitions may be missing.';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function positiveInt(flag, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
  return n;
}

/** Parse CLI flags (argv without node + script). */
export function parseArgs(argv) {
  const opts = {
    services: ['api', 'ai-worker'],
    logWindowDays: 7,
    alertWindowDays: 30,
    maxTraces: 10,
    since: undefined,
    outDir: 'artifacts/reports',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--services':
        opts.services = String(value).split(',');
        if (!opts.services.every((s) => RE.service.test(s))) throw new Error('invalid --services');
        i++;
        break;
      case '--log-window-days':
        opts.logWindowDays = positiveInt(flag, value);
        i++;
        break;
      case '--alert-window-days':
        opts.alertWindowDays = positiveInt(flag, value);
        i++;
        break;
      case '--max-traces':
        opts.maxTraces = positiveInt(flag, value);
        i++;
        break;
      case '--since':
        if (!RE.ts.test(String(value)))
          throw new Error('--since must be an ISO-8601 UTC timestamp');
        opts.since = new Date(value);
        i++;
        break;
      case '--out-dir':
        opts.outDir = String(value);
        i++;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const iso = (seconds) => new Date(Math.round(seconds * 1000)).toISOString();
const ns = (seconds) => `${BigInt(Math.floor(seconds)) * 1000000000n}`;
const nsToSeconds = (value) => Number(BigInt(String(value)) / 1000000n) / 1000;
const round3 = (n) => Math.round(n * 1000) / 1000;

/** Tempo v2 JSON carries base64 ids; some setups return hex. Normalise to lowercase hex. */
function toHexId(value, bytes) {
  const s = String(value ?? '');
  if (new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(s)) return s.toLowerCase();
  return Buffer.from(s, 'base64').toString('hex');
}

/** Tempo search strips leading zeros from trace ids. */
const padTraceId = (id) =>
  String(id ?? '')
    .toLowerCase()
    .padStart(32, '0');

/** Span names may embed hosts or identifiers; replace those with "redacted". */
export function sanitizeSpanName(name) {
  const s = String(name ?? '');
  if (looksLikeHost(s) || UUID_LIKE.test(s) || HEX_RUN.test(s) || DIGIT_RUN.test(s)) {
    return 'redacted';
  }
  return s;
}

function check(kind, value, { allowEmpty = false } = {}) {
  const s = String(value);
  if (allowEmpty && s === '') return value;
  if (!RE[kind].test(s)) throw new Error(`output validation failed: ${kind}`);
  return value;
}

function assertService(service) {
  if (!RE.service.test(service)) throw new Error('output validation failed: service');
  return service;
}

/** Split transitions (sorted by t) into incidents at gaps of >= 30 minutes. */
export function splitIncidents(transitions) {
  const incidents = [];
  for (const t of transitions) {
    const current = incidents.at(-1);
    if (current && t.t - current.at(-1).t < INCIDENT_GAP_S) current.push(t);
    else incidents.push([t]);
  }
  return incidents;
}

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nearestRank(sorted, p) {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function flattenTraceSpans(trace) {
  const spans = [];
  for (const rs of trace?.trace?.resourceSpans ?? trace?.resourceSpans ?? []) {
    const service = (rs.resource?.attributes ?? []).find((a) => a.key === 'service.name')?.value
      ?.stringValue;
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        spans.push({ spanId: toHexId(span.spanId, 8), name: span.name, service });
      }
    }
  }
  return spans;
}

// ---------------------------------------------------------------------------
// Correlation: log line -> trace -> span -> span metrics
// ---------------------------------------------------------------------------

async function correlateService(get, service, window, opts) {
  const res = await lokiQueryRange(get, DS.logs, {
    query: `{service_name="${service}"} | trace_id!=""`,
    start: ns(window.start),
    end: ns(window.end),
    limit: opts.maxTraces * 5,
    direction: 'backward',
  });
  const seen = new Set();
  const entries = [];
  for (const stream of res?.data?.result ?? []) {
    const traceId = String(stream.stream?.trace_id ?? '').toLowerCase();
    const spanId = String(stream.stream?.span_id ?? '').toLowerCase();
    if (!RE.trace.test(traceId) || !RE.span.test(spanId) || seen.has(traceId)) continue;
    seen.add(traceId);
    entries.push({ traceId, spanId, t: nsToSeconds(stream.values?.[0]?.[0] ?? 0) });
  }
  entries.sort((a, b) => b.t - a.t);

  const base = {
    service,
    query_window_start: iso(window.start),
    query_window_end: iso(window.end),
  };
  if (entries.length === 0) {
    return [
      {
        ...base,
        trace_id: '',
        span_id: '',
        log_ts: '',
        span_name: '',
        trace_found: false,
        span_found: false,
        service_match: false,
        metric_series: false,
        status: 'NOT_OBSERVED',
        passed: false,
      },
    ];
  }

  const rows = [];
  for (const entry of entries.slice(0, opts.maxTraces)) {
    const trace = await tempoTrace(get, DS.traces, entry.traceId);
    const spans = trace ? flattenTraceSpans(trace) : [];
    const span = spans.find((s) => s.spanId === entry.spanId);
    const spanName = span ? sanitizeSpanName(span.name) : '';
    let metricSeries = false;
    if (span) {
      const escaped = String(span.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const metric = await promInstantQuery(
        get,
        DS.prom,
        `count(count_over_time(traces_spanmetrics_calls_total{service="${service}",span_name="${escaped}"}[10m]))`,
        Math.floor(entry.t) + 300
      );
      metricSeries = Number(metric?.data?.result?.[0]?.value?.[1] ?? 0) > 0;
    }
    const traceFound = trace !== null && trace !== undefined;
    const spanFound = Boolean(span);
    const serviceMatch = span?.service === service;
    const passed = traceFound && spanFound && serviceMatch && metricSeries;
    rows.push({
      ...base,
      trace_id: entry.traceId,
      span_id: entry.spanId,
      log_ts: iso(entry.t),
      span_name: spanName,
      trace_found: traceFound,
      span_found: spanFound,
      service_match: serviceMatch,
      metric_series: metricSeries,
      status: passed ? 'PASS' : 'FAIL',
      passed,
    });
  }
  return rows;
}

function renderCsv(rows, collectedAt) {
  const lines = [CSV_COLUMNS.map((c) => `"${c}"`).join(',')];
  rows.forEach((row, i) => {
    const full = { ...row, test_id: String(i + 1).padStart(3, '0'), collected_at: collectedAt };
    const empty = full.status === 'NOT_OBSERVED';
    check('testId', full.test_id);
    assertService(full.service);
    check('trace', full.trace_id, { allowEmpty: empty });
    check('span', full.span_id, { allowEmpty: empty });
    check('ts', full.log_ts, { allowEmpty: empty });
    check('spanName', full.span_name, { allowEmpty: true });
    for (const b of ['trace_found', 'span_found', 'service_match', 'metric_series', 'passed']) {
      check('bool', full[b]);
    }
    check('status', full.status);
    for (const t of ['query_window_start', 'query_window_end', 'collected_at'])
      check('ts', full[t]);
    lines.push(CSV_COLUMNS.map((c) => `"${String(full[c])}"`).join(','));
  });
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// MTTD from real alert transitions
// ---------------------------------------------------------------------------

async function fetchTransitions(get, window) {
  const transitions = [];
  let truncated = false;
  for (let start = window.start; start < window.end; start += SLICE_DAYS * DAY_S) {
    const end = Math.min(start + SLICE_DAYS * DAY_S, window.end);
    const res = await lokiQueryRange(get, DS.history, {
      query: '{from="state-history"} | json',
      start: ns(start),
      end: ns(end),
      limit: HISTORY_LINE_LIMIT,
      direction: 'forward',
    });
    let count = 0;
    for (const stream of res?.data?.result ?? []) {
      for (const [tsNs, line] of stream.values ?? []) {
        count++;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        transitions.push({
          t: nsToSeconds(tsNs),
          ruleUID: String(parsed.ruleUID ?? ''),
          alertname: String(parsed.labels?.alertname ?? ''),
          service: parsed.labels?.service === undefined ? 'unknown' : String(parsed.labels.service),
          fingerprint: String(parsed.fingerprint ?? ''),
          previous: String(parsed.previous ?? ''),
          current: String(parsed.current ?? ''),
        });
      }
    }
    if (count >= HISTORY_LINE_LIMIT) truncated = true;
  }
  transitions.sort((a, b) => a.t - b.t);
  return { transitions, truncated };
}

async function earliestErrorSpan(get, service, lo, hi) {
  let end = Math.floor(hi);
  let earliest;
  for (let i = 0; i < MAX_NARROWING && end >= lo; i++) {
    const res = await tempoSearch(get, DS.traces, {
      q: `{resource.service.name="${service}" && status=error}`,
      start: Math.floor(lo),
      end,
      limit: SEARCH_PAGE,
    });
    const traces = res?.traces ?? [];
    for (const trace of traces) {
      for (const set of trace.spanSets ?? (trace.spanSet ? [trace.spanSet] : [])) {
        for (const span of set.spans ?? []) {
          const start = nsToSeconds(span.startTimeUnixNano ?? trace.startTimeUnixNano);
          if (start >= lo && start <= hi && (!earliest || start < earliest.start)) {
            earliest = { start, traceId: padTraceId(trace.traceID), spanId: String(span.spanID) };
          }
        }
      }
    }
    if (traces.length < SEARCH_PAGE || !earliest) break;
    end = Math.floor(earliest.start);
  }
  return earliest;
}

/**
 * Group anchored incidents into error episodes. Several rules can alert on the
 * same burst of errors (Asserts' ErrorRatioBreach and the repo's direct rule);
 * counting each alert separately would score the slow rule against the KPI
 * even when the fast one already fired. An incident joins the episode of its
 * service whose first error is at most EPISODE_JOIN_S earlier; the episode is
 * detected by the earliest alert among its incidents.
 */
export function groupEpisodes(incidents) {
  const sorted = incidents
    .filter((i) => i.anchored)
    .map((i) => ({
      ...i,
      e: Date.parse(i.t_first_error) / 1000,
      a: Date.parse(i.t_alerting) / 1000,
    }))
    .sort((x, y) => x.e - y.e || x.a - y.a);
  const open = new Map();
  const episodes = [];
  for (const i of sorted) {
    const current = open.get(i.service);
    if (current && i.e - current.e <= EPISODE_JOIN_S) {
      current.members.push(i);
      continue;
    }
    const episode = { service: i.service, e: i.e, members: [i] };
    open.set(i.service, episode);
    episodes.push(episode);
  }
  return episodes.map(({ service, e, members }) => {
    const first = members.reduce((x, y) => (y.a < x.a ? y : x));
    const origin = members.find((m) => m.e === e);
    return {
      service,
      t_first_error: iso(e),
      first_error_trace_id: origin.first_error_trace_id,
      t_detected: iso(first.a),
      detected_by: first.rule_uid,
      mttd_s: round3(first.a - e),
      incidents: members.length,
      rule_uids: [...new Set(members.map((m) => m.rule_uid))],
    };
  });
}

const REF_ID = /^[A-Za-z0-9]{1,8}$/;
const REDUCERS = new Set(['last', 'mean', 'max', 'min', 'sum', 'count']);
const EVALUATORS = new Set(['gt', 'lt', 'within_range', 'outside_range']);
const numOrNull = (v) => (Number.isFinite(v) ? v : null);

/**
 * The parts of a Grafana alert rule that decide when it can fire, as numbers
 * and enums only: pause flag, condition refId, and per query its time range,
 * instant flag, reducer and threshold. Same shape for a stored rule and for
 * the payload the repo would send, so the two can be compared.
 */
export function queryShape(rule) {
  const ref = (id) => (REF_ID.test(String(id)) ? String(id) : 'other');
  return {
    is_paused: Boolean(rule.isPaused),
    condition: ref(rule.condition),
    queries: (rule.data ?? []).map((d) => {
      const model = d.model ?? {};
      const evaluator = model.conditions?.[0]?.evaluator;
      return {
        ref_id: ref(d.refId),
        relative_from_s: numOrNull(d.relativeTimeRange?.from),
        relative_to_s: numOrNull(d.relativeTimeRange?.to),
        instant: typeof model.instant === 'boolean' ? model.instant : null,
        reducer: model.reducer === undefined ? null : enumOr(REDUCERS, model.reducer),
        evaluator: evaluator
          ? {
              type: enumOr(EVALUATORS, evaluator.type),
              threshold: numOrNull(evaluator.params?.[0]),
            }
          : null,
      };
    }),
  };
}

/**
 * Field names where a stored rule differs from the payload the repo builds.
 * Compares the query shape plus, per refId, the expression text and data
 * source (as equal/not equal, never the values themselves).
 */
const RULE_FIELDS = ['isPaused', 'condition', 'for', 'noDataState', 'execErrState'];
const SHAPE_FIELDS = ['relative_from_s', 'relative_to_s', 'instant', 'reducer', 'evaluator'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function queryDifferences(want, got, wantData, gotData) {
  const fields = SHAPE_FIELDS.filter((field) => !same(want[field], got[field]));
  if (!same(wantData.model?.expr, gotData.model?.expr)) fields.push('expr');
  if (!same(wantData.datasourceUid, gotData.datasourceUid)) fields.push('datasourceUid');
  return fields.map((field) => `${want.ref_id}.${field}`);
}

export function storedRuleDifferences(stored, expected) {
  const differences = RULE_FIELDS.filter((key) => !same(stored[key], expected[key]));
  const storedData = new Map((stored.data ?? []).map((d) => [String(d.refId), d]));
  const have = new Map(queryShape(stored).queries.map((q) => [q.ref_id, q]));
  for (const want of queryShape(expected).queries) {
    const got = have.get(want.ref_id);
    if (!got) {
      differences.push(`${want.ref_id}.missing`);
      continue;
    }
    const wantData = expected.data.find((d) => d.refId === want.ref_id);
    differences.push(...queryDifferences(want, got, wantData, storedData.get(want.ref_id)));
  }
  return differences;
}

async function describeRules(get, all, ruleUids, repoTitles) {
  const rules = [];
  for (const uid of ruleUids) {
    const rule = all.find((r) => r.uid === uid);
    const group = rule ? await getRuleGroup(get, rule.folderUID, rule.ruleGroup) : undefined;
    rules.push({ uid, rule, intervalS: group?.interval });
  }
  return rules.map(({ uid, rule, intervalS }) => ({
    uid: check('uid', uid),
    ...(repoTitles.has(uid) ? { title: repoTitles.get(uid) } : {}),
    for: rule ? check('duration', rule.for) : null,
    interval_s: intervalS === undefined ? null : check('num', intervalS),
    query_shape: rule ? queryShape(rule) : null,
  }));
}

const stateWord = (state) => {
  const word = /^[A-Za-z]+/.exec(state)?.[0];
  return STATE_WORDS.has(word) ? word : 'Other';
};
const enumOr = (allowed, value) =>
  allowed.has(String(value).toLowerCase()) ? String(value).toLowerCase() : 'other';
const seriesService = (series) => assertService(series.metric?.service ?? 'unknown');

const conditionExpr = (rule) =>
  `(${rule.expr}) ${COMPARATORS[rule.operator].promql} ${rule.threshold}`;
const sameService = (series, service) =>
  series.metric?.service === undefined || series.metric.service === service;

function transitionsByState(transitions, uid) {
  const byState = {};
  for (const t of transitions) {
    if (t.ruleUID !== uid) continue;
    const word = stateWord(t.current);
    byState[word] = (byState[word] ?? 0) + 1;
  }
  return byState;
}

function liveStatus(status) {
  if (!status) return null;
  return {
    health: enumOr(LIVE_HEALTH, status.health),
    state: enumOr(LIVE_STATE, status.state),
    has_last_error: Boolean(status.lastError),
  };
}

/** The rule as Grafana stores it, compared with the payload the repo builds. */
function storedCheck(all, repo, rule) {
  const stored = all.find((r) => r.uid === rule.uid);
  if (!stored) return { found: false, differences: [], query_shape: null };
  const expected = buildAlertRulePayload(rule.entry, repo.config, REPO_RULE_SOURCE);
  return {
    found: true,
    differences: storedRuleDifferences(stored, expected),
    query_shape: queryShape(stored),
  };
}

async function conditionHeld(get, window, rule) {
  const lookback = Math.min(window.end - window.start, CONDITION_LOOKBACK_MAX_S);
  const held = await promInstantQuery(
    get,
    DS.prom,
    `count_over_time((${conditionExpr(rule)})[${lookback}s:${CONDITION_STEP_S}s])`,
    window.end
  );
  return {
    lookback_s: lookback,
    steps_true_by_service: (held?.data?.result ?? []).map((series) => ({
      service: seriesService(series),
      steps: check('num', Number(series.value?.[1] ?? 0)),
    })),
  };
}

/**
 * When, after an episode's first error, the rule's condition held in
 * Prometheus: one range query at 15 s steps over the next 10 minutes. A
 * comparison drops the samples where it is false, so every returned sample
 * is a step where the condition held.
 */
async function conditionTimeline(get, episode, rule) {
  const t0 = Math.ceil(Date.parse(episode.t_first_error) / 1000);
  const res = await promRangeQuery(
    get,
    DS.prom,
    conditionExpr(rule),
    t0,
    t0 + TIMELINE_S,
    TIMELINE_STEP_S
  );
  const offsets = (res?.data?.result ?? [])
    .filter((series) => sameService(series, episode.service))
    .flatMap((series) => (series.values ?? []).map(([t]) => Number(t) - t0))
    .sort((a, b) => a - b);
  return {
    uid: rule.uid,
    first_true_s: offsets.length ? check('num', offsets[0]) : null,
    last_true_s: offsets.length ? check('num', offsets.at(-1)) : null,
    n_true_steps: new Set(offsets).size,
  };
}

async function trueAtProbe(get, episode, rule) {
  const at = Math.floor(Date.parse(episode.t_first_error) / 1000 + CONDITION_PROBE_S);
  const res = await promInstantQuery(get, DS.prom, rule.expr, at);
  return (res?.data?.result ?? []).some(
    (series) =>
      sameService(series, episode.service) &&
      COMPARATORS[rule.operator].holds(Number(series.value?.[1]), rule.threshold)
  );
}

/**
 * Check each committed rule that has a query, so a rule that never alerts can
 * be told apart from one that cannot: its state-history transitions by state,
 * its live health from the ruler, how it is stored against the payload the
 * repo builds, and how many 60 s steps its condition held. Each episode also
 * records, per committed rule, whether it was true 120 s after the first
 * error and when in the next 10 minutes its condition held. Only enums,
 * numbers and uids are kept; Grafana's free-text lastError becomes a boolean.
 */
async function checkRepoRules(get, window, repo, all, transitions, episodes) {
  if (repo.rules.length === 0) return [];
  const status = await ruleStatus(get);
  const live = new Map(
    (status?.data?.groups ?? []).flatMap((g) => (g.rules ?? []).map((r) => [r.uid, r]))
  );
  const checks = [];
  for (const rule of repo.rules) {
    checks.push({
      uid: check('uid', rule.uid),
      transitions_by_state: transitionsByState(transitions, rule.uid),
      live: liveStatus(live.get(rule.uid)),
      stored: storedCheck(all, repo, rule),
      condition: await conditionHeld(get, window, rule),
    });
  }
  for (const episode of episodes) {
    const trueRules = [];
    const timeline = [];
    for (const rule of repo.rules) {
      if (await trueAtProbe(get, episode, rule)) trueRules.push(rule.uid);
      timeline.push(await conditionTimeline(get, episode, rule));
    }
    episode.repo_rules_true_at_120s = trueRules;
    episode.repo_rule_timeline = timeline;
  }
  return checks;
}

const LABEL_KEY = /^[a-z_][a-z0-9_]{0,40}$/;
const LEVEL_VALUE = /^[A-Za-z0-9_-]{1,20}$/;
const levelValue = (v) =>
  v === undefined ? null : LEVEL_VALUE.test(String(v)) ? String(v) : 'other';
const PROBE_TRACE_WINDOW_S = 120;
const PROBE_LIMIT = 200;

async function lokiStreams(get, query, from, to) {
  const res = await lokiQueryRange(get, DS.logs, {
    query,
    start: ns(from),
    end: ns(to),
    limit: PROBE_LIMIT,
    direction: 'forward',
  });
  return res?.data?.result ?? [];
}

/** Line counts per (detected_level, severity_text) pair across streams. */
function levelCounts(streams) {
  const counts = new Map();
  for (const s of streams) {
    const level = levelValue(s.stream?.detected_level);
    const severity = levelValue(s.stream?.severity_text);
    const key = `${level}|${severity}`;
    const n = (s.values ?? []).length;
    counts.set(key, {
      detected_level: level,
      severity_text: severity,
      count: (counts.get(key)?.count ?? 0) + n,
    });
  }
  return [...counts.values()].sort((a, b) =>
    `${a.detected_level}|${a.severity_text}`.localeCompare(`${b.detected_level}|${b.severity_text}`)
  );
}

const lineCount = (streams) => streams.reduce((n, s) => n + (s.values ?? []).length, 0);

/**
 * Why an episode has no error-level line: the same service's lines at any
 * level around the first error span, and every line carrying the episode's
 * first error trace id, whatever service it was logged under. Keeps label
 * keys, level values and service names only, never text or other values.
 */
async function probeMissingErrorLog(get, episode, t0) {
  const sameService = await lokiStreams(
    get,
    `{service_name="${assertService(episode.service)}"}`,
    t0 - LOG_COVERAGE_WINDOW_S,
    t0 + LOG_COVERAGE_WINDOW_S
  );
  const byTrace = await lokiStreams(
    get,
    `{service_name=~".+"} | trace_id="${check('trace', episode.first_error_trace_id)}"`,
    t0 - PROBE_TRACE_WINDOW_S,
    t0 + PROBE_TRACE_WINDOW_S
  );
  const keys = new Set(
    sameService.flatMap((s) => Object.keys(s.stream ?? {})).filter((k) => LABEL_KEY.test(k))
  );
  const services = new Set(
    byTrace
      .map((s) => String(s.stream?.service_name ?? 'unknown'))
      .map((v) => (RE.service.test(v) ? v : 'other'))
  );
  return {
    same_service: {
      lines: lineCount(sameService),
      levels: levelCounts(sameService),
      label_names: [...keys].sort(),
    },
    by_trace: {
      lines: lineCount(byTrace),
      services: [...services].sort(),
      levels: levelCounts(byTrace),
    },
  };
}

/**
 * Would a log-based rule see each episode? Counts error-level Loki lines of
 * the episode's service within ±60 s of its first error span, and the offset
 * of the earliest one (negative = the log came before the span). Only counts
 * and offsets are kept; no log text.
 */
async function checkLogCoverage(get, episodes) {
  let withErrorLog = 0;
  for (const episode of episodes) {
    const t0 = Date.parse(episode.t_first_error) / 1000;
    const res = await lokiQueryRange(get, DS.logs, {
      query: `{service_name="${assertService(episode.service)}"} | ${ERROR_LEVEL_FILTER}`,
      start: ns(t0 - LOG_COVERAGE_WINDOW_S),
      end: ns(t0 + LOG_COVERAGE_WINDOW_S),
      limit: LOG_COVERAGE_LIMIT,
      direction: 'forward',
    });
    const times = (res?.data?.result ?? [])
      .flatMap((stream) => (stream.values ?? []).map(([tsNs]) => nsToSeconds(tsNs)))
      .sort((a, b) => a - b);
    if (times.length) withErrorLog++;
    episode.error_log = {
      lines: times.length,
      first_offset_s: times.length ? check('signedNum', round3(times[0] - t0)) : null,
      ...(times.length ? {} : { probe: await probeMissingErrorLog(get, episode, t0) }),
    };
  }
  const n = episodes.length;
  return {
    window_s: LOG_COVERAGE_WINDOW_S,
    n_episodes: n,
    with_error_log: withErrorLog,
    share: n ? round3(withErrorLog / n) : null,
  };
}

async function collectMttd(get, window, repo) {
  const { transitions, truncated } = await fetchTransitions(get, window);
  const intoAlerting = transitions.filter(
    (t) => t.current.startsWith('Alerting') && !t.previous.startsWith('Alerting')
  );

  const exclusions = new Map();
  const considered = [];
  for (const t of intoAlerting) {
    const reason =
      t.ruleUID === repo.deliveryUid
        ? EXCLUSION_REASONS.deliveryTest
        : EXCLUDED_ALERTNAMES[t.alertname];
    if (reason) {
      const key = `${t.ruleUID}|${reason}`;
      exclusions.set(key, {
        rule_uid: check('uid', t.ruleUID),
        reason,
        count: (exclusions.get(key)?.count ?? 0) + 1,
      });
      continue;
    }
    check('uid', t.ruleUID);
    assertService(t.service);
    // Repo rule titles are free text ("API error rate above 5%"), so a
    // committed rule is named by its uid; its title comes from the repo.
    if (repo.titles.has(t.ruleUID)) {
      considered.push({ ...t, alertname: t.ruleUID });
      continue;
    }
    check('alertname', t.alertname);
    considered.push(t);
  }

  const groups = new Map();
  for (const t of considered) {
    const key = `${t.ruleUID}|${t.service}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const incidents = [];
  for (const group of groups.values()) {
    const runs = splitIncidents(group);
    let previousEnd = -Infinity;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const first = run[0];
      const last = run.at(-1);
      const nextStart = runs[i + 1]?.[0].t ?? Infinity;
      const lo = Math.max(first.t - ERROR_LOOKBACK_S, previousEnd);
      previousEnd = last.t;

      const pending = first.previous.startsWith('Pending')
        ? transitions
            .filter(
              (t) =>
                t.ruleUID === first.ruleUID &&
                t.fingerprint === first.fingerprint &&
                t.current.startsWith('Pending') &&
                t.t <= first.t
            )
            .at(-1)
        : undefined;
      const resolved = transitions.find(
        (t) =>
          t.ruleUID === first.ruleUID &&
          t.service === first.service &&
          t.current.startsWith('Normal') &&
          t.previous.startsWith('Alerting') &&
          t.t > last.t &&
          t.t < nextStart
      );

      const errorSpan = await earliestErrorSpan(get, first.service, lo, first.t);
      const mttd = errorSpan ? round3(first.t - errorSpan.start) : undefined;
      const anchored = mttd !== undefined && mttd >= 0;

      const incident = {
        rule_uid: first.ruleUID,
        alertname: first.alertname,
        service: first.service,
        t_alerting: iso(first.t),
        transitions: run.length,
        anchored,
        ...(pending ? { pending_s: check('num', round3(first.t - pending.t)) } : {}),
        auto_resolve_s: resolved ? check('num', round3(resolved.t - first.t)) : null,
      };
      if (anchored) {
        check('trace', errorSpan.traceId);
        const trace = await tempoTrace(get, DS.traces, errorSpan.traceId);
        const spans = trace ? flattenTraceSpans(trace) : [];
        const span = spans.find((s) => s.spanId === errorSpan.spanId) ?? spans[0];
        Object.assign(incident, {
          t_first_error: iso(errorSpan.start),
          mttd_s: check('num', mttd),
          first_error_trace_id: errorSpan.traceId,
          first_error_span_name: check('spanName', span ? sanitizeSpanName(span.name) : '', {
            allowEmpty: true,
          }),
          first_error_service: first.service,
          trace_resolves: Boolean(trace),
        });
      }
      incidents.push(incident);
    }
  }
  incidents.sort((a, b) => a.t_alerting.localeCompare(b.t_alerting));

  const anchoredValues = incidents
    .filter((i) => i.anchored)
    .map((i) => i.mttd_s)
    .sort((a, b) => a - b);
  const n = anchoredValues.length;
  const mean = n ? round3(anchoredValues.reduce((a, b) => a + b, 0) / n) : null;
  const ruleUids = [...new Set(incidents.map((i) => i.rule_uid))];
  const all = (await listAlertRules(get)) ?? [];
  const rules = await describeRules(get, all, ruleUids, repo.titles);

  // The KPI is judged per error episode (first alert from any rule), counting
  // only episodes whose errors began inside the window.
  const allEpisodes = groupEpisodes(incidents);
  const episodes = allEpisodes.filter((e) => Date.parse(e.t_first_error) / 1000 >= window.start);
  const repoRuleChecks = await checkRepoRules(get, window, repo, all, transitions, episodes);
  const logCoverage = await checkLogCoverage(get, episodes);
  const episodeValues = episodes.map((e) => e.mttd_s).sort((a, b) => a - b);
  const m = episodeValues.length;
  const episodeMean = m ? round3(episodeValues.reduce((a, b) => a + b, 0) / m) : null;
  const met = m ? episodeMean < KPI_TARGET_S : null;
  // The cause follows the rule that detected most episodes: a pending
  // period (`for` > 0) or the condition itself taking time to cross.
  const hasPendingPeriod = (uid) => {
    const rule = rules.find((r) => r.uid === uid);
    return Boolean(rule?.for) && rule.for !== '0s' && rule.for !== '0';
  };
  const pendingShare = m ? episodes.filter((e) => hasPendingPeriod(e.detected_by)).length / m : 0;
  const anyPending = pendingShare > 0.5;

  return {
    rules,
    incidents,
    exclusions: [...exclusions.values()],
    aggregates: {
      n_transitions: considered.length,
      n_incidents: incidents.length,
      n_anchored: n,
      n_unanchored: incidents.length - n,
      mean_s: mean,
      median_s: n ? round3(median(anchoredValues)) : null,
      p90_s: n ? round3(nearestRank(anchoredValues, 0.9)) : null,
      share_lt_120s: n ? round3(anchoredValues.filter((v) => v < KPI_TARGET_S).length / n) : null,
    },
    repo_rule_checks: repoRuleChecks,
    log_coverage: logCoverage,
    episodes,
    episode_aggregates: {
      n_episodes: m,
      n_before_window: allEpisodes.length - m,
      mean_s: episodeMean,
      median_s: m ? round3(median(episodeValues)) : null,
      p90_s: m ? round3(nearestRank(episodeValues, 0.9)) : null,
      share_lt_120s: m ? round3(episodeValues.filter((v) => v < KPI_TARGET_S).length / m) : null,
    },
    kpi: {
      target_s: KPI_TARGET_S,
      statistic: 'mean',
      basis: 'error_episode',
      met,
      cause_if_not_met:
        met === false ? (anyPending ? CAUSES.pendingPeriod : CAUSES.detectionLatency) : null,
    },
    limitations: truncated ? [...LIMITATIONS, TRUNCATION_LIMITATION] : LIMITATIONS,
  };
}

function assertSafeKeys(value) {
  const text = JSON.stringify(value);
  for (const match of text.matchAll(/"([^"]+)":/g)) {
    if (/key|token|auth|secret|api/i.test(match[1])) {
      throw new Error('output validation failed: key name');
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadRepoRules(readFile) {
  const config = JSON.parse(await readFile(REPO_RULES_FILE, 'utf8'));
  const titles = new Map((config.rules ?? []).map((r) => [r.uid, r.title]));
  const rules = (config.rules ?? [])
    .filter((r) => typeof r.expr === 'string' && r.expr !== '')
    .map((r) => {
      // The condition is the rule's own comparison; checking every rule
      // with "> 0" would invert an `lt` rule such as telemetry-silent.
      if (!Object.hasOwn(COMPARATORS, r.operator) || !Number.isFinite(r.threshold)) {
        throw new Error(`repo rule ${r.uid}: unreadable operator or threshold`);
      }
      return { uid: r.uid, expr: r.expr, operator: r.operator, threshold: r.threshold, entry: r };
    });
  return { titles, rules, config, deliveryUid: config.deliveryTest?.uid };
}

async function writeAtomically(outputs, { writeFile, rename, unlink }) {
  const temps = outputs.map(({ file }) => `${file}.tmp-${process.pid}`);
  try {
    for (let i = 0; i < outputs.length; i++) await writeFile(temps[i], outputs[i].data);
    for (let i = 0; i < outputs.length; i++) {
      await rename(temps[i], outputs[i].file);
      temps[i] = undefined;
    }
  } catch (err) {
    for (const temp of temps) {
      if (temp) await unlink(temp).catch(() => {});
    }
    throw err;
  }
}

/**
 * Collect the evidence. Returns the exit code instead of exiting so tests can
 * drive every branch; only the main guard below calls process.exit.
 */
export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  now = () => new Date(),
  sleep,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  rename = fs.rename,
  unlink = fs.unlink,
} = {}) {
  const token = env.GRAFANA_SA_TOKEN;
  const scrub = (message) =>
    token ? String(message).split(token).join('[REDACTED]') : String(message);
  try {
    if (!env.GRAFANA_URL || !token) {
      log('GRAFANA_URL and GRAFANA_SA_TOKEN are required (environment only)');
      return 1;
    }
    const opts = parseArgs(argv.slice(2));
    const get = createReadOnlyClient(env.GRAFANA_URL, token, { fetchImpl, sleep });
    const nowS = Math.floor(now().getTime() / 1000);
    const collectedAt = iso(nowS);

    await grafanaHealth(get);
    const repo = await loadRepoRules(readFile);

    const sinceS = opts.since ? Math.floor(opts.since.getTime() / 1000) : undefined;
    const logWindow = {
      start: sinceS ?? nowS - opts.logWindowDays * DAY_S,
      end: nowS,
    };
    const rows = [];
    for (const service of opts.services) {
      rows.push(...(await correlateService(get, service, logWindow, opts)));
    }
    const csv = renderCsv(rows, collectedAt);

    // --since bounds the alert window too: a re-measure after a rule change
    // must not mix in episodes from before the change.
    const alertWindow = { start: sinceS ?? nowS - opts.alertWindowDays * DAY_S, end: nowS };
    const mttd = await collectMttd(get, alertWindow, repo);
    const baseline = {
      schema_version: '2.2.0',
      task_id: 'IFC-074',
      generated_at: collectedAt,
      measurement_method: 'grafana-cloud-readonly-collector',
      windows: {
        log_window_start: iso(logWindow.start),
        log_window_end: iso(logWindow.end),
        alert_window_start: iso(alertWindow.start),
        alert_window_end: iso(alertWindow.end),
      },
      ...mttd,
    };
    assertSafeKeys(baseline);
    const json = `${JSON.stringify(baseline, null, 2)}\n`;

    const aiPass = rows.some((r) => r.service === REQUIRED_SERVICE && r.status === 'PASS');
    const code = aiPass && mttd.aggregates.n_anchored > 0 ? 0 : 2;
    const summary =
      `correlation rows ${rows.length} (PASS ${rows.filter((r) => r.status === 'PASS').length}); ` +
      `incidents ${mttd.aggregates.n_incidents}, anchored ${mttd.aggregates.n_anchored}, ` +
      `episodes ${mttd.episode_aggregates.n_episodes}, ` +
      `mean MTTD ${mttd.episode_aggregates.mean_s ?? 'n/a'} s, KPI met ${mttd.kpi.met}`;

    if (opts.dryRun) {
      log(`dry run: ${summary}`);
      return code;
    }
    const outputs = [
      { file: path.join(opts.outDir, 'correlation-test.csv'), data: csv },
      { file: path.join(opts.outDir, 'mttr-baseline.json'), data: json },
    ];
    await writeAtomically(outputs, { writeFile, rename, unlink });
    for (const { file, data } of outputs) {
      log(`wrote ${file} sha256 ${createHash('sha256').update(data).digest('hex')}`);
    }
    log(summary);
    if (code === 2)
      log(`incomplete evidence: ${REQUIRED_SERVICE} PASS row or anchored incident missing`);
    return code;
  } catch (err) {
    log(`error: ${scrub(err?.message ?? err)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().then((code) => process.exit(code));
}
