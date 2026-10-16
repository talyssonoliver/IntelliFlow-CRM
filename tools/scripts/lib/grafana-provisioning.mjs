// Shared plumbing for talking to the Grafana Cloud Alerting provisioning API,
// used by both tools/scripts/observability/apply-grafana-alert-rules.mjs
// (IFC-032 span-metric rules, #804) and apply-synthetic-monitoring.mjs (the
// /health/ready uptime probe's alert rule, #811). Extracted so the two
// scripts' identical HTTP client and alert-rule payload shape live in one
// place instead of drifting apart as separate copies.

/** Minimal bearer-token JSON client shared by every Grafana-shaped API this repo talks to. */
export function createApiClient(baseUrl, token, fetchImpl = fetch) {
  return async (method, path, body) => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Keep the rule editable in the UI (no provenance lock).
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
