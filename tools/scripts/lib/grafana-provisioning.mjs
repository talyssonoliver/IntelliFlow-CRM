// Shared plumbing for talking to the Grafana Cloud APIs, used by four scripts
// in tools/scripts/observability/: apply-grafana-alert-rules.mjs (IFC-032
// span-metric rules, #804), apply-synthetic-monitoring.mjs (the /health/ready
// uptime probe's alert rule, #811), apply-grafana-slos.mjs and
// apply-grafana-dashboard.mjs (the production SLOs and service dashboard,
// ENV-008-AI). Extracted so their HTTP client, 503 retry, error redaction and
// alert-rule payload shape live in one place instead of drifting apart.
import { readFileSync } from 'node:fs';

/**
 * Waits between attempts when Grafana answers 503 (ENV-008-AI AC-001). A
 * Grafana Cloud instance that has gone to sleep answers 503 until it wakes,
 * which took long enough to keep grafana-alert-rules.yml red from 2026-10-06.
 * 8 attempts over 255 s; any other status is returned at once.
 */
export const RETRY_DELAYS_MS = [5000, 10000, 20000, 40000, 60000, 60000, 60000];

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Throws `<A> and <B> are required` unless every named variable is set, so
 * each apply script refuses to start, before any request, in the same words.
 */
export function requireEnv(env, names) {
  if (names.some((name) => !env[name])) throw new Error(`${names.join(' and ')} are required`);
}

/**
 * Reads a committed JSON config and validates it before any request, throwing
 * `<label> invalid:` with one problem per line when validateConfig finds any.
 */
export function loadValidConfig(path, validateConfig, label) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`${label} invalid:\n  ${problems.join('\n  ')}`);
  return config;
}

/** The Grafana stack client from GRAFANA_URL and GRAFANA_SA_TOKEN, refusing to start without them. */
export function createGrafanaClient(env, fetchImpl, sleep) {
  requireEnv(env, ['GRAFANA_URL', 'GRAFANA_SA_TOKEN']);
  return createApiClient(env.GRAFANA_URL, env.GRAFANA_SA_TOKEN, fetchImpl, { sleep });
}

/** Minimal bearer-token JSON client shared by every Grafana-shaped API this repo talks to. */
export function createApiClient(baseUrl, token, fetchImpl = fetch, { sleep = defaultSleep } = {}) {
  const send = (method, path, body) =>
    fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Keep the rule editable in the UI (no provenance lock).
        'X-Disable-Provenance': 'true',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return async (method, path, body) => {
    let res = await send(method, path, body);
    for (const delay of RETRY_DELAYS_MS) {
      if (res.status !== 503) break;
      await sleep(delay);
      res = await send(method, path, body);
    }
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

const REDACTION_PATTERNS = [
  /Bearer\s+\S+/gi,
  /Basic\s+\S+/gi,
  /glsa_\w+/g,
  // Prefixed API tokens shorter than the long-run rule below (sk_live_…, ghp_…).
  /\b[A-Za-z]{2,10}_(?:[A-Za-z]{2,10}_)?[A-Za-z0-9]{16,}/g,
  // Any long base64 or URL-safe run: tokens, signatures, session ids.
  /[A-Za-z0-9+/_-]{32,}={0,2}/g,
];
const REDACT_MAX = 200;

/**
 * A response body made safe for an error message in a CI log (ENV-008-AI
 * NF-001): token-shaped runs are replaced and the text is cut to 200 chars.
 */
export function redactBody(text) {
  if (text === undefined || text === null) return '';
  let out = String(text);
  for (const pattern of REDACTION_PATTERNS) out = out.replace(pattern, '<redacted>');
  return out.length > REDACT_MAX ? `${out.slice(0, REDACT_MAX)}…[truncated]` : out;
}

/**
 * Number of series a selector matches over `lookback` (a PromQL range,
 * default the last hour), via the datasource proxy.
 */
export async function querySeriesCount(api, datasourceUid, selector, lookback = '1h') {
  const query = encodeURIComponent(`count(last_over_time(${selector}[${lookback}]))`);
  const res = await api(
    'GET',
    `/api/datasources/proxy/uid/${datasourceUid}/api/v1/query?query=${query}`
  );
  if (res.status !== 200) throw new Error(`series check for ${selector}: HTTP ${res.status}`);
  const value = res.json?.data?.result?.[0]?.value?.[1];
  return value === undefined ? 0 : Number(value);
}

/** The Grafana Cloud datasources a rule may query, by uid, and the query language each speaks. */
export const DATASOURCE_KINDS = {
  'grafanacloud-prom': 'prometheus',
  'grafanacloud-logs': 'loki',
};

/**
 * Number of log streams a LogQL stream selector matches over the last
 * `lookbackSeconds` up to `nowMs`, via the Loki series route of the
 * datasource proxy (Loki has no PromQL `count(last_over_time(...))`).
 */
export async function queryLokiSeriesCount(api, datasourceUid, selector, lookbackSeconds, nowMs) {
  const end = nowMs / 1000;
  const res = await api(
    'GET',
    `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/series?match%5B%5D=` +
      `${encodeURIComponent(selector)}&start=${end - lookbackSeconds}&end=${end}`
  );
  if (res.status !== 200) throw new Error(`series check for ${selector}: HTTP ${res.status}`);
  return Array.isArray(res.json?.data) ? res.json.data.length : 0;
}

/** The query model for refId A: Loki takes queryType, Prometheus takes instant. */
function queryModel(entry, datasourceUid) {
  const model = { refId: 'A', expr: entry.expr, intervalMs: 60000, maxDataPoints: 43200 };
  return DATASOURCE_KINDS[datasourceUid] === 'loki'
    ? { ...model, queryType: 'instant' }
    : { ...model, instant: true };
}

/**
 * Grafana alert rule (provisioning API shape): query -> reduce -> threshold.
 * `source` is the only thing that differs between this repo's two callers —
 * each passes its own fixed label so the two scripts' rules stay
 * distinguishable in Grafana even though the payload shape is identical.
 * The query is evaluated at "now" unless the entry sets `queryOffsetSeconds`,
 * which reads it that many seconds back so late-arriving samples are counted.
 * A rule queries the config's datasource unless it names its own `datasourceUid`.
 */
export function buildAlertRulePayload(entry, config, source) {
  const datasourceUid = entry.datasourceUid ?? config.datasourceUid;
  return {
    uid: entry.uid,
    title: entry.title,
    folderUID: config.folder.uid,
    ruleGroup: config.group.name,
    condition: 'C',
    noDataState: entry.noData,
    execErrState: 'Error',
    for: entry.for,
    labels: { severity: entry.severity, team: 'owner', source },
    annotations: { summary: entry.summary },
    isPaused: false,
    data: [
      {
        refId: 'A',
        relativeTimeRange: { from: 900, to: entry.queryOffsetSeconds ?? 0 },
        datasourceUid,
        model: queryModel(entry, datasourceUid),
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

// ---------------------------------------------------------------------------
// Read-only access (IFC-074 evidence collector,
// tools/scripts/observability/collect-observability-evidence.mjs).
// GET only: the client has no method parameter, so a write cannot be expressed.
// Errors carry `HTTP <status> <name>` and nothing else — no URL, body or token.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
/** Read-only client backoff for a sleeping Grafana Cloud stack ("instance is loading") or rate limits (also 429/502/504, unlike the 503-only RETRY_DELAYS_MS above). */
export const READ_RETRY_DELAYS_MS = [5000, 10000, 20000, 40000, 60000];
const MAX_RETRY_AFTER_MS = 60000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res) {
  const seconds = Number(res.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : undefined;
}

/**
 * Run `attempt()` until it returns a non-retryable response, sleeping between
 * retryable ones (Retry-After when given, otherwise the backoff schedule).
 */
export async function withRetry(
  attempt,
  { sleep = realSleep, delaysMs = READ_RETRY_DELAYS_MS } = {}
) {
  for (let i = 0; ; i++) {
    const res = await attempt();
    if (!RETRYABLE_STATUS.has(res.status) || i >= delaysMs.length) return res;
    await sleep(retryAfterMs(res) ?? delaysMs[i]);
  }
}

/** Bearer-token, GET-only JSON client: `get(name, path, { allowNotFound })`. */
export function createReadOnlyClient(baseUrl, token, { fetchImpl = fetch, sleep } = {}) {
  const root = baseUrl.replace(/\/$/, '');
  return async (name, path, { allowNotFound = false } = {}) => {
    const res = await withRetry(
      () =>
        fetchImpl(`${root}${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }),
      { sleep }
    );
    if (allowNotFound && res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} ${name}`);
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`invalid JSON from ${name}`);
    }
  };
}

const DATASOURCE_UID = /^[A-Za-z0-9_-]{1,64}$/;

/** The proxy path for a datasource; a uid that could alter the path is refused, unechoed. */
function datasourceProxy(uid) {
  if (!DATASOURCE_UID.test(uid)) throw new Error('invalid datasource uid');
  return `/api/datasources/proxy/uid/${uid}`;
}

function queryString(params) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

/** Grafana's own health endpoint; also wakes a sleeping free-tier stack. */
export const grafanaHealth = (get) => get('grafana health', '/api/health');

/** Loki range query via the datasource proxy (start/end in epoch nanoseconds). */
export const lokiQueryRange = (get, uid, params) =>
  get('loki query_range', `${datasourceProxy(uid)}/loki/api/v1/query_range?${queryString(params)}`);

/** Tempo TraceQL search via the datasource proxy (start/end in epoch seconds). */
export const tempoSearch = (get, uid, params) =>
  get('tempo search', `${datasourceProxy(uid)}/api/search?${queryString(params)}`);

/** One Tempo trace (v2 JSON) by a 32-hex id; resolves null when Tempo has no such trace. */
export async function tempoTrace(get, uid, traceId) {
  if (!/^[0-9a-f]{32}$/.test(traceId)) throw new Error('invalid trace id');
  return get('tempo trace', `${datasourceProxy(uid)}/api/v2/traces/${traceId}`, {
    allowNotFound: true,
  });
}

/** Prometheus instant query via the datasource proxy at `time` (epoch seconds). */
export const promInstantQuery = (get, uid, query, time) =>
  get('prometheus query', `${datasourceProxy(uid)}/api/v1/query?${queryString({ query, time })}`);

/** Prometheus range query via the datasource proxy (start/end in epoch seconds, step in s). */
export const promRangeQuery = (get, uid, query, start, end, step) =>
  get(
    'prometheus query_range',
    `${datasourceProxy(uid)}/api/v1/query_range?${queryString({ query, start, end, step })}`
  );

/** Live evaluation status (health, state, last error) of every Grafana-managed rule. */
export const ruleStatus = (get) => get('rule status', '/api/prometheus/grafana/api/v1/rules');

/** All alert rules from the Grafana provisioning API. */
export const listAlertRules = (get) => get('alert rules', '/api/v1/provisioning/alert-rules');

/** One alert rule group (for its evaluation interval) from the provisioning API. */
export async function getRuleGroup(get, folderUid, group) {
  // Folder uids are slugs; group names may contain spaces. Neither may hold a
  // slash or dot-dot segment that could leave the provisioning path.
  const validFolder = /^[A-Za-z0-9_-]{1,128}$/.test(folderUid);
  const validGroup = /^[A-Za-z0-9_. -]{1,128}$/.test(group) && !group.includes('..');
  if (!validFolder || !validGroup) throw new Error('invalid rule group');
  return get(
    'rule group',
    `/api/v1/provisioning/folder/${folderUid}/rule-groups/${encodeURIComponent(group)}`
  );
}
