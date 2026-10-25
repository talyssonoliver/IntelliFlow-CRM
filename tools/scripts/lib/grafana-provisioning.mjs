// Shared plumbing for talking to the Grafana Cloud Alerting provisioning API,
// used by both tools/scripts/observability/apply-grafana-alert-rules.mjs
// (IFC-032 span-metric rules, #804) and apply-synthetic-monitoring.mjs (the
// /health/ready uptime probe's alert rule, #811). Extracted so the two
// scripts' identical HTTP client and alert-rule payload shape live in one
// place instead of drifting apart as separate copies.

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
  /glsa_\w+/g,
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

/** Number of live series a selector matches over the last hour, via the datasource proxy. */
export async function querySeriesCount(api, datasourceUid, selector) {
  const query = encodeURIComponent(`count(last_over_time(${selector}[1h]))`);
  const res = await api(
    'GET',
    `/api/datasources/proxy/uid/${datasourceUid}/api/v1/query?query=${query}`
  );
  if (res.status !== 200) throw new Error(`series check for ${selector}: HTTP ${res.status}`);
  const value = res.json?.data?.result?.[0]?.value?.[1];
  return value === undefined ? 0 : Number(value);
}

/**
 * Grafana alert rule (provisioning API shape): query -> reduce -> threshold.
 * `source` is the only thing that differs between this repo's two callers —
 * each passes its own fixed label so the two scripts' rules stay
 * distinguishable in Grafana even though the payload shape is identical.
 */
export function buildAlertRulePayload(entry, config, source) {
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
