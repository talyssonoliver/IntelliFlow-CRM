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
  getRuleGroup,
  grafanaHealth,
  listAlertRules,
  lokiQueryRange,
  promInstantQuery,
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

async function describeRules(get, ruleUids, repoTitles) {
  const all = (await listAlertRules(get)) ?? [];
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
  }));
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
    check('alertname', t.alertname);
    assertService(t.service);
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
  const rules = await describeRules(get, ruleUids, repo.titles);

  // The KPI is judged per error episode (first alert from any rule).
  const episodes = groupEpisodes(incidents);
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
    episodes,
    episode_aggregates: {
      n_episodes: m,
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
  return { titles, deliveryUid: config.deliveryTest?.uid };
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

    const logWindow = {
      start: opts.since
        ? Math.floor(opts.since.getTime() / 1000)
        : nowS - opts.logWindowDays * DAY_S,
      end: nowS,
    };
    const rows = [];
    for (const service of opts.services) {
      rows.push(...(await correlateService(get, service, logWindow, opts)));
    }
    const csv = renderCsv(rows, collectedAt);

    const alertWindow = { start: nowS - opts.alertWindowDays * DAY_S, end: nowS };
    const mttd = await collectMttd(get, alertWindow, repo);
    const baseline = {
      schema_version: '2.1.0',
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
