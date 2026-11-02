import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAlertRulePayload } from '../lib/grafana-provisioning.mjs';
import {
  groupEpisodes,
  parseArgs,
  run,
  sanitizeSpanName,
  splitIncidents,
  storedRuleDifferences,
} from '../observability/collect-observability-evidence.mjs';

// Fakes only: hosts use the reserved .invalid TLD, tokens are repeated chars.
const TOKEN = 'q'.repeat(32);
const GRAFANA_URL = 'https://stack.example.invalid';
const ENV = { GRAFANA_URL, GRAFANA_SA_TOKEN: TOKEN };
const NOW = new Date('2026-10-22T12:00:00.000Z');
const NOW_S = NOW.getTime() / 1000;

const hex = (c: string, n: number) => c.repeat(n);
const TRACE_A = hex('a', 32);
const SPAN_A = hex('1', 16);
const TRACE_B = hex('b', 32);
const SPAN_B = hex('2', 16);
const ERR_TRACE = hex('c', 32);

/** Tempo v2 encodes ids as base64; the collector must decode them to hex. */
const b64 = (hexId: string) => Buffer.from(hexId, 'hex').toString('base64');

type Transition = {
  t: number; // epoch seconds
  ruleUID: string;
  alertname: string;
  service?: string;
  previous: string;
  current: string;
  fingerprint?: string;
  extraLabels?: Record<string, string>;
};

type FakeConfig = {
  logs?: Record<string, Array<{ trace_id: string; span_id: string; t: number }>>;
  traces?: Record<
    string,
    { service: string; spans: Array<{ spanId: string; name: string; start: number }> } | 404
  >;
  /** error-span search results keyed by service: spans with start (epoch s) */
  errorSpans?: Record<string, Array<{ traceId: string; spanId: string; start: number }>>;
  metricValue?: number;
  history?: Transition[];
  rules?: Array<{ uid: string; title: string; for: string; folderUID: string; ruleGroup: string }>;
  groupInterval?: number;
  status?: (path: string) => number | undefined;
  tempoTraceIdHex?: boolean;
  /** Prometheus answers by query; undefined falls back to metricValue. */
  promQuery?: (
    query: string,
    time: number
  ) => Array<{ metric: Record<string, string>; value: [number, string] }> | undefined;
  /** Prometheus range answers by query (start/end epoch s); default empty. */
  promRange?: (
    query: string,
    start: number,
    end: number
  ) => Array<{ metric: Record<string, string>; values: Array<[number, string]> }>;
  /** Grafana ruler status (/api/prometheus/grafana/api/v1/rules) rules. */
  ruleStatus?: Array<{ uid: string; health: string; state: string; lastError?: string }>;
  /** Error-level line counts per 2-minute bucket start (epoch s), by service. */
  errorLogBuckets?: Record<string, Record<number, number>>;
  /** Any-level log lines with their stream labels (for the miss probe). */
  probeLogs?: Array<{ t: number; labels: Record<string, string> }>;
  /** Error-level log line times (epoch s) by service. */
  errorLogs?: Record<string, number[]>;
  /** Repo alert-rules.json contents; defaults to REPO_RULES. */
  repoRules?: string;
  /** Loki metric answers for a repo Loki rule's condition (start/end epoch s, step s). */
  lokiMetric?: (
    query: string,
    start: number,
    end: number,
    step: number
  ) => Array<{ metric: Record<string, string>; values: Array<[number, string]> }>;
};

function fakeGrafana(cfg: FakeConfig) {
  const calls: Array<{ method: string; path: string; auth: string | undefined }> = [];
  const fetchImpl = async (
    url: string,
    init: { method?: string; headers?: Record<string, string> }
  ) => {
    const u = new URL(url);
    const path = u.pathname;
    calls.push({
      method: init.method ?? 'GET',
      path: path + u.search,
      auth: init.headers?.Authorization,
    });
    const forced = cfg.status?.(path + u.search);
    const reply = (status: number, body?: unknown) => ({
      status,
      headers: { get: () => null },
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    });
    if (forced) return reply(forced, { message: `secret ${TOKEN}` });
    const uid = /^\/api\/datasources\/proxy\/uid\/([^/]+)\//.exec(path)?.[1];
    const lokiPath = path.includes('/loki/api/v1/');
    if (uid === 'grafanacloud-prom' && lokiPath) return reply(404);
    if ((uid === 'grafanacloud-logs' || uid === 'grafanacloud-alert-state-history') && !lokiPath)
      return reply(404);
    if (path === '/api/health') return reply(200, { database: 'ok' });
    if (path === '/api/v1/provisioning/alert-rules') return reply(200, cfg.rules ?? []);
    if (path.startsWith('/api/v1/provisioning/folder/'))
      return reply(200, { interval: cfg.groupInterval ?? 60 });
    if (path.endsWith('/loki/api/v1/query_range')) return reply(200, lokiBody(cfg, u));
    if (path.includes('/api/v2/traces/')) {
      const id = path.split('/').pop() as string;
      const t = cfg.traces?.[id];
      if (!t || t === 404) return reply(404);
      const enc = (h: string) => (cfg.tempoTraceIdHex ? h : b64(h));
      return reply(200, {
        trace: {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: t.service } },
                  { key: 'host.name', value: { stringValue: 'h.example.invalid' } },
                ],
              },
              scopeSpans: [
                {
                  spans: t.spans.map((s) => ({
                    traceId: enc(id),
                    spanId: enc(s.spanId),
                    name: s.name,
                    startTimeUnixNano: String(BigInt(s.start) * 1000000000n),
                    status: {},
                  })),
                },
              ],
            },
          ],
        },
      });
    }
    if (path.endsWith('/api/search')) {
      const q = u.searchParams.get('q') ?? '';
      const svc = /resource\.service\.name="([^"]+)"/.exec(q)?.[1] ?? '';
      const start = Number(u.searchParams.get('start'));
      const end = Number(u.searchParams.get('end'));
      const limit = Number(u.searchParams.get('limit'));
      const hits = (cfg.errorSpans?.[svc] ?? [])
        .filter((s) => s.start >= start && s.start <= end)
        .sort((a, b) => b.start - a.start)
        .slice(0, limit);
      return reply(200, {
        traces: hits.map((h) => ({
          // Tempo search strips leading zeros from trace ids
          traceID: h.traceId.replace(/^0+/, ''),
          startTimeUnixNano: String(BigInt(h.start) * 1000000000n),
          spanSets: [
            {
              spans: [
                { spanID: h.spanId, startTimeUnixNano: String(BigInt(h.start) * 1000000000n) },
              ],
            },
          ],
        })),
      });
    }
    const prom = promBody(cfg, u);
    return prom === undefined ? reply(404) : reply(200, prom);
  };
  return { calls, fetchImpl };
}

/** Loki query_range: alert state history, error-level lines, probes, or trace-carrying logs. */
function lokiBody(cfg: FakeConfig, u: URL) {
  const q = u.searchParams.get('query') ?? '';
  const start = Number(u.searchParams.get('start')) / 1e9;
  const end = Number(u.searchParams.get('end')) / 1e9;
  if (q.includes('state-history')) return historyBody(cfg, start, end);
  if (q.startsWith('(') && cfg.lokiMetric) {
    return {
      data: {
        resultType: 'matrix',
        result: cfg.lokiMetric(q, start, end, Number(u.searchParams.get('step'))),
      },
    };
  }
  if (q.startsWith('sum by (service_name)')) return bucketBody(cfg, start, end);
  const svc = /service_name="([^"]+)"/.exec(q)?.[1] ?? '';
  if (q.includes('detected_level')) return errorLogBody(cfg, svc, start, end);
  if (q.includes('trace_id="') || !q.includes('|')) return probeLogBody(cfg, q, start, end);
  const entries = (cfg.logs?.[svc] ?? []).filter((e) => e.t >= start && e.t <= end);
  return {
    data: {
      result: entries.map((e) => ({
        stream: {
          service_name: svc,
          trace_id: e.trace_id,
          span_id: e.span_id,
          host_name: 'h.example.invalid',
        },
        values: [
          [
            String(BigInt(Math.round(e.t * 1000)) * 1000000n),
            'raw line with person@example.invalid',
          ],
        ],
      })),
    },
  };
}

/** Loki metric query: error-line counts per service per 2-minute bucket. */
function bucketBody(cfg: FakeConfig, start: number, end: number) {
  return {
    data: {
      resultType: 'matrix',
      result: Object.entries(cfg.errorLogBuckets ?? {}).map(([service, buckets]) => ({
        metric: { service_name: service },
        values: Object.entries(buckets)
          .filter(([t]) => Number(t) >= start && Number(t) <= end)
          .map(([t, n]) => [Number(t), String(n)]),
      })),
    },
  };
}

/** Alert state-history lines in [start, end). */
function historyBody(cfg: FakeConfig, start: number, end: number) {
  const lines = (cfg.history ?? [])
    .filter((h) => h.t >= start && h.t < end)
    .map((h) => ({
      stream: { from: 'state-history' },
      values: [
        [
          String(BigInt(Math.round(h.t * 1000)) * 1000000n),
          JSON.stringify({
            ruleUID: h.ruleUID,
            ruleTitle: h.alertname,
            previous: h.previous,
            current: h.current,
            fingerprint: h.fingerprint ?? 'f0',
            labels: {
              alertname: h.alertname,
              ...(h.service ? { service: h.service } : {}),
              ...(h.extraLabels ?? {}),
            },
          }),
        ],
      ],
    }));
  return { data: { result: lines } };
}

/** Error-level Loki lines for a service between start and end (epoch s). */
function errorLogBody(cfg: FakeConfig, svc: string, start: number, end: number) {
  const times = (cfg.errorLogs?.[svc] ?? []).filter((t) => t >= start && t <= end);
  return {
    data: {
      result: times.length
        ? [
            {
              stream: { service_name: svc, detected_level: 'error' },
              values: times.map((t) => [
                String(BigInt(Math.round(t * 1000)) * 1000000n),
                'raw error line with person@example.invalid',
              ]),
            },
          ]
        : [],
    },
  };
}

/** Any-level Loki lines for a service selector or a trace_id filter. */
function probeLogBody(cfg: FakeConfig, q: string, start: number, end: number) {
  const svc = /service_name="([^"]+)"/.exec(q)?.[1];
  const trace = /trace_id="([0-9a-f]+)"/.exec(q)?.[1];
  const hits = (cfg.probeLogs ?? []).filter(
    (l) =>
      l.t >= start &&
      l.t <= end &&
      (svc === undefined || l.labels.service_name === svc) &&
      (trace === undefined || l.labels.trace_id === trace)
  );
  return {
    data: {
      result: hits.map((l) => ({
        stream: l.labels,
        values: [
          [String(BigInt(Math.round(l.t * 1000)) * 1000000n), 'raw line person@example.invalid'],
        ],
      })),
    },
  };
}

/** Ruler status and Prometheus answers; undefined for any other path. */
function promBody(cfg: FakeConfig, u: URL) {
  if (u.pathname === '/api/prometheus/grafana/api/v1/rules') {
    return { data: { groups: [{ name: 'g', rules: cfg.ruleStatus ?? [] }] } };
  }
  if (u.pathname.endsWith('/api/v1/query_range')) {
    const p = (k: string) => Number(u.searchParams.get(k));
    return {
      data: {
        result: cfg.promRange?.(u.searchParams.get('query') ?? '', p('start'), p('end')) ?? [],
      },
    };
  }
  if (!u.pathname.endsWith('/api/v1/query')) return undefined;
  const answer = cfg.promQuery?.(
    u.searchParams.get('query') ?? '',
    Number(u.searchParams.get('time'))
  );
  if (answer) return { data: { result: answer } };
  return {
    data: {
      result: cfg.metricValue === 0 ? [] : [{ value: [0, String(cfg.metricValue ?? 3)] }],
    },
  };
}

const REPO_RULES = JSON.stringify({
  rules: [{ uid: 'ifc032-api-error-rate', title: 'API error rate above 5%' }],
  deliveryTest: {
    uid: 'ifc032-delivery-test',
    title: 'IFC-032 delivery test (expected; deleted on the next normal run)',
  },
});

function harness(cfg: FakeConfig, argv: string[] = []) {
  const grafana = fakeGrafana(cfg);
  const logs: string[] = [];
  const files = new Map<string, string>();
  const removed: string[] = [];
  const waits: number[] = [];
  const opts = {
    env: ENV,
    argv: ['node', 'collect', '--out-dir', 'out', ...argv],
    fetchImpl: grafana.fetchImpl,
    log: (m: string) => logs.push(m),
    now: () => NOW,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
    readFile: async () => cfg.repoRules ?? REPO_RULES,
    writeFile: async (p: string, data: string) => {
      files.set(p.replace(/\\/g, '/'), data);
    },
    rename: async (from: string, to: string) => {
      const a = from.replace(/\\/g, '/');
      files.set(to.replace(/\\/g, '/'), files.get(a) as string);
      files.delete(a);
    },
    unlink: async (p: string) => {
      removed.push(p.replace(/\\/g, '/'));
      files.delete(p.replace(/\\/g, '/'));
    },
  };
  return { grafana, logs, files, removed, waits, opts };
}

function parseCsv(text: string) {
  const [header, ...rows] = text.trim().split('\n');
  const cols = header.split(',').map((c) => c.replace(/^"|"$/g, ''));
  return rows.map((r) => {
    const cells = r.split(',').map((c) => c.replace(/^"|"$/g, ''));
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

const CSV = 'out/correlation-test.csv';
const JSON_OUT = 'out/mttr-baseline.json';

/** A healthy production-like fixture: ai-worker correlates, api has no logs yet. */
function healthy(): FakeConfig {
  return {
    logs: { 'ai-worker': [{ trace_id: TRACE_A, span_id: SPAN_A, t: NOW_S - 3600 }] },
    traces: {
      [TRACE_A]: {
        service: 'ai-worker',
        spans: [{ spanId: SPAN_A, name: 'llm.invoke', start: NOW_S - 3601 }],
      },
      [ERR_TRACE]: {
        service: 'ai-worker',
        spans: [{ spanId: SPAN_B, name: 'pg.query:INSERT', start: NOW_S - 7300 }],
      },
    },
    errorSpans: { 'ai-worker': [{ traceId: ERR_TRACE, spanId: SPAN_B, start: NOW_S - 7290 }] },
    history: [
      {
        t: NOW_S - 7200,
        ruleUID: 'r-err',
        alertname: 'ErrorRatioBreach',
        service: 'ai-worker',
        previous: 'Normal',
        current: 'Alerting',
      },
      {
        t: NOW_S - 6000,
        ruleUID: 'r-err',
        alertname: 'ErrorRatioBreach',
        service: 'ai-worker',
        previous: 'Alerting',
        current: 'Normal',
      },
    ],
    rules: [
      { uid: 'r-err', title: 'ErrorRatioBreach', for: '0s', folderUID: 'kg', ruleGroup: 'asserts' },
    ],
  };
}

describe('collect-observability-evidence: guards', () => {
  it('returns 1 and writes nothing when GRAFANA_URL or GRAFANA_SA_TOKEN is missing', async () => {
    for (const env of [{ GRAFANA_SA_TOKEN: TOKEN }, { GRAFANA_URL }]) {
      const h = harness(healthy());
      expect(await run({ ...h.opts, env })).toBe(1);
      expect(h.files.size).toBe(0);
      expect(h.grafana.calls).toHaveLength(0);
    }
  });

  it('makes GET requests only, all with the bearer token', async () => {
    const h = harness(healthy());
    await run(h.opts);
    expect(h.grafana.calls.length).toBeGreaterThan(0);
    expect(h.grafana.calls.every((c) => c.method === 'GET')).toBe(true);
    expect(h.grafana.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('warms the stack up with /api/health first', async () => {
    const h = harness(healthy());
    await run(h.opts);
    expect(h.grafana.calls[0].path).toBe('/api/health');
  });

  it('never writes or logs the token, the stack URL or response bodies', async () => {
    const h = harness({
      ...healthy(),
      status: (p) => (p.startsWith('/api/v1/provisioning') ? 403 : undefined),
    });
    const code = await run(h.opts);
    expect(code).toBe(1);
    const everything = [...h.logs, ...h.files.values()].join('\n');
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain('stack.example.invalid');
    expect(everything).not.toContain('secret');
    expect(h.logs.join('\n')).toContain('HTTP 403 alert rules');
  });

  it('retries a sleeping stack (503) and then succeeds', async () => {
    let n = 0;
    const h = harness({
      ...healthy(),
      status: (p) => (p === '/api/health' && n++ < 2 ? 503 : undefined),
    });
    expect(await run(h.opts)).toBe(0);
    expect(h.waits.slice(0, 2)).toEqual([5000, 10000]);
  });

  it('returns 1, writes nothing and leaves no temp files when retries run out', async () => {
    const h = harness({
      ...healthy(),
      status: (p) => (p.includes('/api/search') ? 503 : undefined),
    });
    expect(await run(h.opts)).toBe(1);
    expect([...h.files.keys()]).toEqual([]);
  });

  it('writes nothing on --dry-run', async () => {
    const h = harness(healthy(), ['--dry-run']);
    expect(await run(h.opts)).toBe(0);
    expect(h.files.size).toBe(0);
  });

  it('prints the SHA-256 of each output it wrote', async () => {
    const h = harness(healthy());
    expect(await run(h.opts)).toBe(0);
    for (const f of [CSV, JSON_OUT]) {
      const sha = createHash('sha256')
        .update(h.files.get(f) as string)
        .digest('hex');
      expect(h.logs.some((l) => l.includes(sha) && l.includes(f.split('/').pop() as string))).toBe(
        true
      );
    }
  });
});

describe('collect-observability-evidence: correlation', () => {
  it('passes a row when trace, span, service and span metrics all line up', async () => {
    const h = harness(healthy());
    await run(h.opts);
    const rows = parseCsv(h.files.get(CSV) as string);
    const ai = rows.find((r) => r.service === 'ai-worker');
    expect(ai).toMatchObject({
      trace_id: TRACE_A,
      span_id: SPAN_A,
      span_name: 'llm.invoke',
      trace_found: 'true',
      span_found: 'true',
      service_match: 'true',
      metric_series: 'true',
      status: 'PASS',
      passed: 'true',
    });
  });

  it('writes a NOT_OBSERVED row for a service with no trace-carrying log lines', async () => {
    const h = harness(healthy());
    await run(h.opts);
    const api = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'api');
    expect(api).toMatchObject({
      status: 'NOT_OBSERVED',
      passed: 'false',
      trace_id: '',
      span_id: '',
    });
  });

  it('fails a row whose trace is not in Tempo', async () => {
    const cfg = healthy();
    cfg.traces = { ...cfg.traces, [TRACE_A]: 404 };
    const h = harness(cfg);
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai).toMatchObject({ trace_found: 'false', status: 'FAIL', passed: 'false' });
  });

  it('fails a row whose log span is missing from the trace', async () => {
    const cfg = healthy();
    cfg.logs = { 'ai-worker': [{ trace_id: TRACE_A, span_id: hex('9', 16), t: NOW_S - 3600 }] };
    const h = harness(cfg);
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai).toMatchObject({ trace_found: 'true', span_found: 'false', status: 'FAIL' });
  });

  it('fails a row when no span-metrics series exists around the log time', async () => {
    const h = harness({ ...healthy(), metricValue: 0 });
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai).toMatchObject({ metric_series: 'false', status: 'FAIL' });
  });

  it('fails a row when the span belongs to a different service', async () => {
    const cfg = healthy();
    cfg.traces = {
      ...cfg.traces,
      [TRACE_A]: { service: 'api', spans: [{ spanId: SPAN_A, name: 'x', start: NOW_S - 3601 }] },
    };
    const h = harness(cfg);
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai).toMatchObject({ service_match: 'false', status: 'FAIL' });
  });

  it('accepts Tempo ids already in hex', async () => {
    const h = harness({ ...healthy(), tempoTraceIdHex: true });
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai?.status).toBe('PASS');
  });

  it('--since narrows the log window to traffic after a deploy', async () => {
    const h = harness(healthy(), ['--since', new Date((NOW_S - 600) * 1000).toISOString()]);
    await run(h.opts);
    const ai = parseCsv(h.files.get(CSV) as string).find((r) => r.service === 'ai-worker');
    expect(ai?.status).toBe('NOT_OBSERVED');
  });

  it('writes a fully quoted CSV with the spec header', async () => {
    const h = harness(healthy());
    await run(h.opts);
    const [header, first] = (h.files.get(CSV) as string).split('\n');
    expect(header).toBe(
      '"test_id","service","trace_id","span_id","log_ts","span_name","trace_found","span_found","service_match","metric_series","status","passed","query_window_start","query_window_end","collected_at"'
    );
    expect(first.split(',').every((c) => /^".*"$/.test(c))).toBe(true);
  });

  it('never copies raw log lines or stream labels such as host names', async () => {
    const h = harness(healthy());
    await run(h.opts);
    const all = [...h.files.values()].join('\n');
    expect(all).not.toContain('example.invalid');
    expect(all).not.toContain('raw line');
  });
});

describe('collect-observability-evidence: MTTD', () => {
  async function baseline(cfg: FakeConfig, argv: string[] = []) {
    const h = harness(cfg, argv);
    const code = await run(h.opts);
    return { code, h, json: JSON.parse((h.files.get(JSON_OUT) as string) ?? 'null') };
  }

  it('measures MTTD from the first error span to the Alerting transition', async () => {
    const { json, code } = await baseline(healthy());
    expect(code).toBe(0);
    expect(json.measurement_method).toBe('grafana-cloud-readonly-collector');
    expect(json.incidents).toHaveLength(1);
    expect(json.incidents[0]).toMatchObject({
      rule_uid: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      anchored: true,
      mttd_s: 90,
      first_error_trace_id: ERR_TRACE,
      first_error_span_name: 'pg.query:INSERT',
      first_error_service: 'ai-worker',
      trace_resolves: true,
      auto_resolve_s: 1200,
    });
    expect(json.kpi).toMatchObject({ target_s: 120, statistic: 'mean', met: true });
  });

  it('records the rule pending period and group interval from the provisioning API', async () => {
    const { json } = await baseline({ ...healthy(), groupInterval: 60 });
    expect(json.rules).toEqual([
      expect.objectContaining({ uid: 'r-err', for: '0s', interval_s: 60 }),
    ]);
  });

  it('records pending_s when the rule went Pending before Alerting', async () => {
    const cfg = healthy();
    cfg.history = [
      {
        t: NOW_S - 7260,
        ruleUID: 'r-err',
        alertname: 'ErrorRatioBreach',
        service: 'ai-worker',
        previous: 'Normal',
        current: 'Pending',
      },
      {
        t: NOW_S - 7200,
        ruleUID: 'r-err',
        alertname: 'ErrorRatioBreach',
        service: 'ai-worker',
        previous: 'Pending',
        current: 'Alerting',
      },
    ];
    const { json } = await baseline(cfg);
    expect(json.incidents[0]).toMatchObject({ pending_s: 60, anchored: true });
  });

  it('splits incidents on a gap of 30 minutes or more and reports raw transitions', async () => {
    const cfg = healthy();
    const mk = (t: number): Transition => ({
      t,
      ruleUID: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      previous: 'Normal',
      current: 'Alerting',
    });
    cfg.history = [mk(NOW_S - 10000), mk(NOW_S - 10000 + 1799), mk(NOW_S - 10000 + 1799 + 1800)];
    const { json } = await baseline(cfg);
    expect(json.aggregates.n_transitions).toBe(3);
    expect(json.aggregates.n_incidents).toBe(2);
  });

  it('excludes the delivery-test rule and asserts_up with constant reasons', async () => {
    const cfg = healthy();
    cfg.history = [
      ...(cfg.history ?? []),
      {
        t: NOW_S - 5000,
        ruleUID: 'ifc032-delivery-test',
        alertname: 'x',
        previous: 'Normal',
        current: 'Alerting',
      },
      {
        t: NOW_S - 4000,
        ruleUID: 'r-up',
        alertname: 'asserts_up',
        service: 'api',
        previous: 'Normal',
        current: 'Alerting',
      },
    ];
    const { json } = await baseline(cfg);
    const reasons = Object.fromEntries(
      json.exclusions.map((e: { rule_uid: string; reason: string }) => [e.rule_uid, e.reason])
    );
    expect(reasons['ifc032-delivery-test']).toMatch(/delivery test/i);
    expect(reasons['r-up']).toMatch(/telemetry/i);
    expect(json.incidents.map((i: { rule_uid: string }) => i.rule_uid)).toEqual(['r-err']);
  });

  it('marks an incident unanchored when no error span precedes it', async () => {
    const cfg = { ...healthy(), errorSpans: {} };
    const { json, code } = await baseline(cfg);
    expect(json.incidents[0]).toMatchObject({ anchored: false });
    expect(json.aggregates).toMatchObject({ n_anchored: 0, n_unanchored: 1 });
    expect(json.kpi.met).toBeNull();
    expect(code).toBe(2);
  });

  it('treats a negative MTTD (clock skew) as unanchored', async () => {
    const cfg = healthy();
    cfg.history = [{ ...(cfg.history as Transition[])[0], t: NOW_S - 7295 }];
    cfg.errorSpans = { 'ai-worker': [{ traceId: ERR_TRACE, spanId: SPAN_B, start: NOW_S - 7290 }] };
    const { json } = await baseline(cfg);
    expect(json.incidents[0].anchored).toBe(false);
  });

  it('bounds the error-span search by the previous incident end', async () => {
    const cfg = healthy();
    const mk = (t: number, current = 'Alerting'): Transition => ({
      t,
      ruleUID: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      previous: current === 'Alerting' ? 'Normal' : 'Alerting',
      current,
    });
    cfg.history = [mk(NOW_S - 9000), mk(NOW_S - 7000)]; // two incidents, 2000 s apart
    // only error span sits before the FIRST incident; the second must not reuse it
    cfg.errorSpans = { 'ai-worker': [{ traceId: ERR_TRACE, spanId: SPAN_B, start: NOW_S - 9050 }] };
    const { json } = await baseline(cfg);
    expect(json.incidents.map((i: { anchored: boolean }) => i.anchored)).toEqual([true, false]);
  });

  it('narrows the search window while Tempo returns a full page of 50 traces', async () => {
    const cfg = healthy();
    const spans = Array.from({ length: 70 }, (_, i) => ({
      traceId: hex('d', 31) + (i % 10),
      spanId: SPAN_B,
      start: NOW_S - 7200 - 10 - i * 10,
    }));
    cfg.errorSpans = { 'ai-worker': spans };
    const { json } = await baseline(cfg);
    // earliest of the 70 is 700 s before the alert -> found only by narrowing
    expect(json.incidents[0].mttd_s).toBe(700);
  });

  it('computes aggregates and judges the KPI on the mean, not the median', async () => {
    const cfg = healthy();
    const alerts = [NOW_S - 20000, NOW_S - 15000, NOW_S - 10000];
    const offsets = [30, 40, 400]; // median 40 (< 120), mean 156.667 (>= 120)
    cfg.history = alerts.map((t) => ({
      t,
      ruleUID: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      previous: 'Normal',
      current: 'Alerting',
    }));
    cfg.errorSpans = {
      'ai-worker': alerts.map((t, i) => ({
        traceId: ERR_TRACE,
        spanId: SPAN_B,
        start: t - offsets[i],
      })),
    };
    const { json } = await baseline(cfg);
    expect(json.aggregates).toMatchObject({
      n_incidents: 3,
      n_anchored: 3,
      median_s: 40,
      mean_s: 156.667,
      p90_s: 400,
    });
    expect(json.aggregates.share_lt_120s).toBe(0.667);
    expect(json.kpi.met).toBe(false);
    // the only rule has for: 0s -> the delay is the condition, not a pending period
    expect(json.kpi.cause_if_not_met).toMatch(/threshold/);
  });

  it('names the pending period as the cause when most anchored incidents come from rules with for > 0', async () => {
    const cfg = healthy();
    cfg.history = [{ ...(cfg.history as Transition[])[0] }];
    cfg.errorSpans = {
      'ai-worker': [{ traceId: ERR_TRACE, spanId: SPAN_B, start: NOW_S - 7200 - 400 }],
    };
    cfg.rules = [
      { uid: 'r-err', title: 'ErrorRatioBreach', for: '5m', folderUID: 'kg', ruleGroup: 'asserts' },
    ];
    const { json } = await baseline(cfg);
    expect(json.kpi.met).toBe(false);
    expect(json.kpi.cause_if_not_met).toMatch(/pending period/);
  });

  it('judges the KPI on the first alert from any rule per error episode', async () => {
    // One burst of errors, two rules: the direct rule fires 70 s after the
    // first error, Asserts' ErrorRatioBreach 300 s after it.
    const cfg = healthy();
    const firstError = NOW_S - 7300;
    cfg.errorSpans = {
      'ai-worker': [{ traceId: ERR_TRACE, spanId: SPAN_B, start: firstError }],
    };
    const alerting = (t: number, ruleUID: string, alertname: string): Transition => ({
      t,
      ruleUID,
      alertname,
      service: 'ai-worker',
      previous: 'Normal',
      current: 'Alerting',
    });
    cfg.history = [
      alerting(firstError + 70, 'r-fast', 'ErrorSpansDirect'),
      alerting(firstError + 300, 'r-err', 'ErrorRatioBreach'),
    ];
    cfg.rules = [
      { uid: 'r-err', title: 'ErrorRatioBreach', for: '0s', folderUID: 'kg', ruleGroup: 'asserts' },
      { uid: 'r-fast', title: 'ErrorSpansDirect', for: '0s', folderUID: 'ip', ruleGroup: 'prod' },
    ];
    const { json, h } = await baseline(cfg);
    expect(json.schema_version).toBe('2.3.0');
    expect(json.incidents.map((i: { mttd_s: number }) => i.mttd_s)).toEqual([70, 300]);
    expect(json.aggregates.mean_s).toBe(185);
    expect(json.episodes).toEqual([
      {
        service: 'ai-worker',
        t_first_error: new Date(firstError * 1000).toISOString(),
        first_error_trace_id: ERR_TRACE,
        t_detected: new Date((firstError + 70) * 1000).toISOString(),
        detected_by: 'r-fast',
        mttd_s: 70,
        incidents: 2,
        rule_uids: ['r-fast', 'r-err'],
        error_log: expect.objectContaining({ lines: 0, first_offset_s: null }),
      },
    ]);
    expect(json.episode_aggregates).toMatchObject({ n_episodes: 1, mean_s: 70 });
    expect(json.kpi).toMatchObject({ basis: 'error_episode', met: true });
    expect(h.logs.join('\n')).toMatch(/episodes 1, mean MTTD 70 s, KPI met true/);
  });

  it('reports no cause when the KPI is met', async () => {
    const { json } = await baseline(healthy());
    expect(json.kpi).toMatchObject({ met: true, cause_if_not_met: null });
  });

  it('fetches alert history in 7-day slices across the window', async () => {
    const h = harness(healthy(), ['--alert-window-days', '30']);
    await run(h.opts);
    const slices = h.grafana.calls.filter(
      (c) =>
        c.path.includes('alert-state-history') ||
        decodeURIComponent(c.path).includes('state-history')
    );
    expect(slices).toHaveLength(5);
  });

  it('drops free labels and only titles rules committed in the repo', async () => {
    const cfg = healthy();
    cfg.history = [
      {
        ...(cfg.history as Transition[])[0],
        extraLabels: { asserts_request_context: 'db.pooler.example.invalid' },
      },
    ];
    const { json } = await baseline(cfg);
    const text = JSON.stringify(json);
    expect(text).not.toContain('pooler');
    expect(json.rules[0].title).toBeUndefined();
  });

  it("names a repo rule's alerts by uid, because repo titles are free text", async () => {
    const cfg = healthy();
    cfg.history = [
      {
        t: NOW_S - 7200,
        ruleUID: 'ifc032-api-error-rate',
        alertname: 'API error rate above 5%',
        service: 'ai-worker',
        previous: 'Normal',
        current: 'Alerting',
      },
    ];
    const { code, json } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.incidents[0]).toMatchObject({
      rule_uid: 'ifc032-api-error-rate',
      alertname: 'ifc032-api-error-rate',
      mttd_s: 90,
    });
    expect(json.rules[0].title).toBe('API error rate above 5%');
  });

  it('--since starts the alert window and keeps only episodes whose first error is after it', async () => {
    const since = NOW_S - 7000;
    const cfg = healthy();
    // Episode 1: errors start 100 s before --since and alert 50 s after it.
    // Episode 2: entirely after --since.
    cfg.errorSpans = {
      'ai-worker': [
        { traceId: ERR_TRACE, spanId: SPAN_B, start: since - 100 },
        { traceId: TRACE_B, spanId: SPAN_B, start: since + 3000 },
      ],
    };
    cfg.traces = { ...cfg.traces, [TRACE_B]: { service: 'ai-worker', spans: [] } };
    const alerting = (t: number): Transition => ({
      t,
      ruleUID: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      previous: 'Normal',
      current: 'Alerting',
    });
    cfg.history = [alerting(NOW_S - 7200), alerting(since + 50), alerting(since + 3180)];
    const { json } = await baseline(cfg, ['--since', new Date(since * 1000).toISOString()]);
    expect(json.windows.alert_window_start).toBe(new Date(since * 1000).toISOString());
    expect(json.incidents.map((i: { t_alerting: string }) => i.t_alerting)).toEqual([
      new Date((since + 50) * 1000).toISOString(),
      new Date((since + 3180) * 1000).toISOString(),
    ]);
    expect(json.episodes).toHaveLength(1);
    expect(json.episodes[0]).toMatchObject({ mttd_s: 180 });
    expect(json.episode_aggregates).toMatchObject({
      n_episodes: 1,
      n_before_window: 1,
      mean_s: 180,
    });
  });

  it('checks every committed rule: transitions by state, live health and whether its condition held', async () => {
    const expr = 'sum by (service) (increase(errors_total[2m]))';
    const cfg = healthy();
    cfg.repoRules = JSON.stringify({
      rules: [
        {
          uid: 'ifc074-error-spans-direct',
          title: 'Error spans (direct)',
          expr,
          operator: 'gt',
          threshold: 0,
        },
      ],
    });
    cfg.history = [
      ...(cfg.history as Transition[]),
      {
        t: NOW_S - 7100,
        ruleUID: 'ifc074-error-spans-direct',
        alertname: 'Error spans (direct)',
        previous: 'Normal',
        current: 'Error',
      },
      {
        t: NOW_S - 7040,
        ruleUID: 'ifc074-error-spans-direct',
        alertname: 'Error spans (direct)',
        previous: 'Error',
        current: 'Normal (Error)',
      },
    ];
    cfg.ruleStatus = [
      {
        uid: 'ifc074-error-spans-direct',
        health: 'error',
        state: 'inactive',
        lastError: `failed to query ${GRAFANA_URL}`,
      },
    ];
    const queries: Array<{ query: string; time: number }> = [];
    const firstError = NOW_S - 7290;
    cfg.promQuery = (query, time) => {
      if (!query.includes('errors_total')) return undefined;
      queries.push({ query, time });
      if (query.startsWith('count_over_time'))
        return [{ metric: { service: 'ai-worker' }, value: [time, '3'] }];
      return time === firstError + 120
        ? [{ metric: { service: 'ai-worker' }, value: [time, '2'] }]
        : [];
    };
    const { code, json } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.repo_rule_checks).toEqual([
      {
        uid: 'ifc074-error-spans-direct',
        datasource_kind: 'prometheus',
        transitions_by_state: { Error: 1, Normal: 1 },
        live: { health: 'error', state: 'inactive', has_last_error: true },
        stored: { found: false, differences: [], query_shape: null },
        condition: {
          lookback_s: 259200,
          steps_true_by_service: [{ service: 'ai-worker', steps: 3 }],
        },
      },
    ]);
    expect(queries[0].query).toBe(`count_over_time(((${expr}) > 0)[259200s:60s])`);
    expect(json.episodes[0].repo_rules_true_at_120s).toEqual(['ifc074-error-spans-direct']);
    // No free text from Grafana: the lastError message never reaches the output.
    expect(JSON.stringify(json)).not.toContain('failed to query');
  });

  it("tests each rule's condition with its own operator and threshold", async () => {
    const cfg = healthy();
    cfg.repoRules = JSON.stringify({
      rules: [
        { uid: 'silent', title: 'x', expr: 'rate_ai', operator: 'lt', threshold: 0.001 },
        { uid: 'err-rate', title: 'y', expr: 'ratio_ai', operator: 'gt', threshold: 0.05 },
      ],
    });
    const queries: string[] = [];
    const firstError = NOW_S - 7290;
    cfg.promQuery = (query, time) => {
      if (!/rate_ai|ratio_ai/.test(query)) return undefined;
      queries.push(query);
      if (query.startsWith('count_over_time')) return [];
      if (time !== firstError + 120) return [];
      // Both values are above 0, but neither rule's condition holds:
      // 0.5 is not below 0.001, and 0.02 is not above 0.05.
      const value = query === 'rate_ai' ? '0.5' : '0.02';
      return [{ metric: { service: 'ai-worker' }, value: [time, value] }];
    };
    const { json } = await baseline(cfg);
    expect(queries).toContain('count_over_time(((rate_ai) < 0.001)[259200s:60s])');
    expect(queries).toContain('count_over_time(((ratio_ai) > 0.05)[259200s:60s])');
    expect(json.episodes[0].repo_rules_true_at_120s).toEqual([]);
  });

  it('compares the stored rule with the repo payload and times the condition after each first error', async () => {
    const entry = {
      uid: 'ifc074-error-spans-direct',
      title: 'Error spans (direct)',
      expr: 'sum by (service) (increase(errors_total[2m]))',
      operator: 'gt',
      threshold: 0,
      for: '0s',
      noData: 'OK',
      severity: 'high',
      summary: 's',
    };
    const config = {
      folder: { uid: 'intelliflow-prod' },
      group: { name: 'intelliflow-prod', intervalSeconds: 60 },
      datasourceUid: 'grafanacloud-prom',
      rules: [entry],
    };
    const payload = buildAlertRulePayload(entry, config, 'ifc-032');
    // Stored as the repo sends it, except Grafana evaluates query A 60 s back.
    const stored = structuredClone(payload);
    stored.data[0].relativeTimeRange.to = 60;
    const cfg = healthy();
    cfg.repoRules = JSON.stringify(config);
    cfg.rules = [...(cfg.rules ?? []), stored];
    const t0 = Math.ceil(NOW_S - 7290);
    cfg.promRange = (query, start, end) => {
      if (!query.includes('errors_total')) return [];
      expect([start, end]).toEqual([t0, t0 + 600]);
      return [
        {
          metric: { service: 'ai-worker' },
          values: [
            [t0 + 60, '1'],
            [t0 + 75, '1'],
          ],
        },
        { metric: { service: 'api' }, values: [[t0 + 15, '1']] },
      ];
    };
    const { code, json } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.repo_rule_checks[0].stored).toMatchObject({
      found: true,
      differences: ['A.relative_to_s'],
      query_shape: { is_paused: false, condition: 'C' },
    });
    expect(json.repo_rule_checks[0].stored.query_shape.queries[0]).toEqual({
      ref_id: 'A',
      relative_from_s: 900,
      relative_to_s: 60,
      instant: true,
      reducer: null,
      evaluator: null,
    });
    expect(json.episodes[0].repo_rule_timeline).toEqual([
      { uid: 'ifc074-error-spans-direct', first_true_s: 60, last_true_s: 75, n_true_steps: 2 },
    ]);
  });

  describe('a repo rule on the Loki datasource', () => {
    const LOKI_EXPR =
      'sum by (service_name) (count_over_time({service_name="ai-worker"} | detected_level=~"error" [2m]))';
    const lokiRules = (extra: Array<Record<string, unknown>> = []) =>
      JSON.stringify({
        datasourceUid: 'grafanacloud-prom',
        rules: [
          {
            uid: 'ifc074-error-logs-direct',
            title: 'Error-level logs (direct)',
            datasourceUid: 'grafanacloud-logs',
            expr: LOKI_EXPR,
            operator: 'gt',
            threshold: 0,
          },
          ...extra,
        ],
      });
    const firstError = NOW_S - 7290;
    const lokiCalls = (calls: Array<{ path: string }>) =>
      calls
        .map((c) => new URL(c.path, GRAFANA_URL))
        .filter((u) => (u.searchParams.get('query') ?? '').includes('detected_level=~"error"'));

    it('routes the rule to the logs datasource query_range with step 60, never to Prometheus', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = () => [];
      const promQueries: string[] = [];
      cfg.promQuery = (query) => {
        promQueries.push(query);
        return undefined;
      };
      const { code, h } = await baseline(cfg);
      expect(code).toBe(0);
      const calls = lokiCalls(h.grafana.calls);
      expect(calls.length).toBeGreaterThan(0);
      for (const u of calls) {
        expect(u.pathname).toBe(
          '/api/datasources/proxy/uid/grafanacloud-logs/loki/api/v1/query_range'
        );
        expect(u.searchParams.get('query')).toBe(`(${LOKI_EXPR}) > 0`);
        expect(u.searchParams.get('step')).toBe('60');
        // LogQL has no Prometheus subquery.
        expect(u.searchParams.get('query')).not.toContain(':60s]');
      }
      expect(promQueries.filter((q) => q.includes('detected_level'))).toEqual([]);
    });

    it('probes the rule 120 s after the first error with a Loki range of one instant', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      const probes: Array<[number, number]> = [];
      cfg.lokiMetric = (_q, start, end) => {
        if (start === end) probes.push([start, end]);
        return start === end && start === firstError + 120
          ? [{ metric: { service_name: 'ai-worker' }, values: [[start, '2']] }]
          : [];
      };
      const { json } = await baseline(cfg);
      expect(probes).toContainEqual([firstError + 120, firstError + 120]);
      expect(json.episodes[0].repo_rules_true_at_120s).toEqual(['ifc074-error-logs-direct']);
    });

    it("counts the 60 s steps where the rule's condition held, with the Loki lookback capped at 6 h", async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = (_q, start, end, step) =>
        end - start === 21600 && step === 60
          ? [
              {
                metric: { service_name: 'ai-worker' },
                values: [
                  [end - 120, '1'],
                  [end - 60, '3'],
                ],
              },
            ]
          : [];
      const { json } = await baseline(cfg);
      expect(json.repo_rule_checks[0]).toMatchObject({
        uid: 'ifc074-error-logs-direct',
        datasource_kind: 'loki',
        condition: {
          lookback_s: 21600,
          steps_true_by_service: [{ service: 'ai-worker', steps: 2 }],
        },
      });
    });

    it('times the condition after each first error from the Loki matrix, and gives null when empty', async () => {
      const t0 = Math.ceil(firstError);
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = (_q, start, end) =>
        start === t0 && end === t0 + 600
          ? [
              {
                metric: { service_name: 'ai-worker' },
                values: [
                  [t0 + 60, '1'],
                  [t0 + 120, '1'],
                ],
              },
              { metric: { service_name: 'api' }, values: [[t0, '1']] },
            ]
          : [];
      const { json } = await baseline(cfg);
      expect(json.episodes[0].repo_rule_timeline).toEqual([
        { uid: 'ifc074-error-logs-direct', first_true_s: 60, last_true_s: 120, n_true_steps: 2 },
      ]);

      const empty = healthy();
      empty.repoRules = lokiRules();
      empty.lokiMetric = () => [];
      const { json: none } = await baseline(empty);
      expect(none.episodes[0].repo_rule_timeline).toEqual([
        { uid: 'ifc074-error-logs-direct', first_true_s: null, last_true_s: null, n_true_steps: 0 },
      ]);
    });

    it('matches a Loki series without service_name only to an episode without a service', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = (_q, start, end) =>
        start === end ? [{ metric: {}, values: [[start, '5']] }] : [];
      const { json } = await baseline(cfg);
      // The episode is ai-worker's, so an unlabelled Loki series does not make the rule true for it.
      expect(json.episodes[0].repo_rules_true_at_120s).toEqual([]);
    });

    it('keeps Prometheus rules on the prom proxy beside a Loki rule', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules([
        {
          uid: 'ifc074-error-spans-direct',
          title: 'x',
          expr: 'errors_total',
          operator: 'gt',
          threshold: 0,
        },
      ]);
      cfg.lokiMetric = () => [];
      const { json, h } = await baseline(cfg);
      const promPaths = h.grafana.calls
        .map((c) => new URL(c.path, GRAFANA_URL))
        .filter((u) => (u.searchParams.get('query') ?? '').includes('errors_total'));
      expect(promPaths.length).toBeGreaterThan(0);
      for (const u of promPaths)
        expect(u.pathname).toMatch(
          /^\/api\/datasources\/proxy\/uid\/grafanacloud-prom\/api\/v1\/query/
        );
      expect(
        json.repo_rule_checks.map((c: { datasource_kind: string }) => c.datasource_kind)
      ).toEqual(['loki', 'prometheus']);
    });

    it('reports a rule on an unknown datasource as not_checked and still writes', async () => {
      const cfg = healthy();
      cfg.repoRules = JSON.stringify({
        datasourceUid: 'grafanacloud-prom',
        rules: [
          {
            uid: 'odd',
            title: 'x',
            datasourceUid: 'grafanacloud-other',
            expr: 'up',
            operator: 'gt',
            threshold: 0,
          },
        ],
      });
      const { code, json } = await baseline(cfg);
      expect(code).toBe(0);
      expect(json.repo_rule_checks[0]).toMatchObject({
        uid: 'odd',
        datasource_kind: null,
        not_checked: 'unknown_datasource',
        condition: null,
      });
      expect(json.episodes[0].repo_rules_true_at_120s).toEqual([]);
      expect(json.episodes[0].repo_rule_timeline).toEqual([]);
    });

    it('anchors a Loki-rule transition labelled only service_name to its episode', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = () => [];
      cfg.history = [
        {
          t: firstError + 45,
          ruleUID: 'ifc074-error-logs-direct',
          alertname: 'Error-level logs (direct)',
          previous: 'Normal',
          current: 'Alerting',
          extraLabels: { service_name: 'ai-worker' },
        },
        ...(cfg.history as Transition[]),
      ];
      const { json } = await baseline(cfg);
      expect(json.episodes[0]).toMatchObject({
        service: 'ai-worker',
        detected_by: 'ifc074-error-logs-direct',
        mttd_s: 45,
      });
    });

    it('keeps a span-rule transition anchored with its earliest error span (regression)', async () => {
      const cfg = healthy();
      const { json } = await baseline(cfg);
      expect(json.episodes[0]).toMatchObject({
        service: 'ai-worker',
        first_error_trace_id: ERR_TRACE,
        detected_by: 'r-err',
        mttd_s: 90,
      });
    });

    it('writes the 2.3.0 schema, whose new keys pass the output key check', async () => {
      const cfg = healthy();
      cfg.repoRules = lokiRules();
      cfg.lokiMetric = () => [];
      const { json } = await baseline(cfg);
      expect(json.schema_version).toBe('2.3.0');
      expect(Object.keys(json.repo_rule_checks[0])).toEqual(
        expect.arrayContaining(['datasource_kind', 'condition'])
      );
    });
  });

  it('measures how many episodes have an error-level log line within 60 s of the first error span', async () => {
    // Two episodes: the first has an error log 5 s before (and one 70 s after,
    // outside the window) its first error span; the second's only error log is
    // 90 s after, also outside the ±60 s window.
    const cfg = healthy();
    const e1 = NOW_S - 7290;
    const e2 = NOW_S - 3000;
    cfg.errorSpans = {
      'ai-worker': [
        { traceId: ERR_TRACE, spanId: SPAN_B, start: e1 },
        { traceId: TRACE_B, spanId: SPAN_B, start: e2 },
      ],
    };
    cfg.traces = { ...cfg.traces, [TRACE_B]: { service: 'ai-worker', spans: [] } };
    const alerting = (t: number): Transition => ({
      t,
      ruleUID: 'r-err',
      alertname: 'ErrorRatioBreach',
      service: 'ai-worker',
      previous: 'Normal',
      current: 'Alerting',
    });
    cfg.history = [alerting(e1 + 180), alerting(e2 + 180)];
    cfg.errorLogs = { 'ai-worker': [e1 - 5, e1 + 70, e2 + 90] };
    const { code, json, h } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.episodes.map((e: { error_log: unknown }) => e.error_log)).toEqual([
      { lines: 1, first_offset_s: -5 },
      expect.objectContaining({ lines: 0, first_offset_s: null }),
    ]);
    expect(json.log_coverage).toEqual({
      window_s: 60,
      n_episodes: 2,
      with_error_log: 1,
      share: 0.5,
    });
    // Log text never reaches the output.
    expect(JSON.stringify(json)).not.toContain('person@');
    const query = h.grafana.calls
      .map((c) => decodeURIComponent(c.path))
      .find((p) => p.includes('detected_level'));
    expect(query).toContain('{service_name="ai-worker"}');
  });

  it('probes an episode with no error-level line: labels and levels around it, never text', async () => {
    const cfg = healthy();
    const e1 = NOW_S - 7290; // the healthy() first error span, trace ERR_TRACE
    cfg.errorLogs = {};
    cfg.probeLogs = [
      // Same service, logged at warn, not error.
      {
        t: e1 + 1,
        labels: {
          service_name: 'ai-worker',
          detected_level: 'warn',
          severity_text: 'WARN',
          trace_id: ERR_TRACE,
          host_name: 'h.example.invalid',
        },
      },
      // The same trace logged by another service name at error.
      {
        t: e1 + 2,
        labels: {
          service_name: 'intelliflow-ai-worker',
          detected_level: 'error',
          trace_id: ERR_TRACE,
        },
      },
      // Another service and another trace, inside the window: excluded.
      { t: e1 + 3, labels: { service_name: 'api', detected_level: 'error', trace_id: TRACE_A } },
      // Unrelated line far outside both windows.
      { t: e1 + 900, labels: { service_name: 'ai-worker', detected_level: 'error' } },
    ];
    const { code, json } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.episodes[0].error_log).toEqual({
      lines: 0,
      first_offset_s: null,
      probe: {
        same_service: {
          lines: 1,
          levels: [{ detected_level: 'warn', severity_text: 'WARN', count: 1 }],
          label_names: ['detected_level', 'host_name', 'service_name', 'severity_text', 'trace_id'],
        },
        by_trace: {
          lines: 2,
          services: ['ai-worker', 'intelliflow-ai-worker'],
          levels: [
            { detected_level: 'error', severity_text: null, count: 1 },
            { detected_level: 'warn', severity_text: 'WARN', count: 1 },
          ],
        },
      },
    });
    const text = JSON.stringify(json);
    expect(text).not.toContain('person@');
    expect(text).not.toContain('example.invalid');
  });

  it('counts 2-minute buckets with error-level lines that match no episode', async () => {
    // healthy(): one ai-worker episode, first error at NOW_S - 7290.
    const cfg = healthy();
    const e1 = NOW_S - 7290;
    cfg.errorLogs = { 'ai-worker': [e1 + 1] };
    cfg.errorLogBuckets = {
      // One bucket at the episode (matched), two far from it (noise), and one
      // empty bucket that must not count.
      'ai-worker': { [e1 + 60]: 3, [e1 + 3600]: 1, [e1 + 5400]: 2, [e1 + 600]: 0 },
      // api has error lines but no episode at all: all noise.
      api: { [e1 + 120]: 5 },
    };
    const { code, json, h } = await baseline(cfg);
    expect(code).toBe(0);
    expect(json.log_noise).toEqual({
      bucket_s: 120,
      by_service: [
        { service: 'ai-worker', buckets_with_error_lines: 3, matched_to_episode: 1, unmatched: 2 },
        { service: 'api', buckets_with_error_lines: 1, matched_to_episode: 0, unmatched: 1 },
      ],
    });
    const q = h.grafana.calls
      .map((c) => new URL(c.path, GRAFANA_URL).searchParams.get('query') ?? '')
      .find((p) => p.includes('sum by (service_name)'));
    expect(q).toContain('count_over_time');
    expect(q).toContain('[2m]');
  });

  it('does not probe episodes that already have an error-level line', async () => {
    const cfg = healthy();
    cfg.errorLogs = { 'ai-worker': [NOW_S - 7290] };
    const { json, h } = await baseline(cfg);
    expect(json.episodes[0].error_log).toEqual({ lines: 1, first_offset_s: 0 });
    expect(h.grafana.calls.some((c) => decodeURIComponent(c.path).includes('trace_id="'))).toBe(
      false
    );
  });

  it('refuses a committed rule whose operator or threshold it cannot read', async () => {
    const cfg = healthy();
    cfg.repoRules = JSON.stringify({
      rules: [{ uid: 'bad', title: 'x', expr: 'up', operator: 'gte', threshold: 1 }],
    });
    const { code, h } = await baseline(cfg);
    expect(code).toBe(1);
    expect(h.files.size).toBe(0);
  });

  it('records an unknown live state instead of a value Grafana made up', async () => {
    const cfg = healthy();
    cfg.repoRules = JSON.stringify({
      rules: [
        { uid: 'ifc074-error-spans-direct', title: 'x', expr: 'up', operator: 'gt', threshold: 0 },
      ],
    });
    cfg.ruleStatus = [{ uid: 'ifc074-error-spans-direct', health: 'weird value', state: 'odd' }];
    const { json } = await baseline(cfg);
    expect(json.repo_rule_checks[0].live).toEqual({
      health: 'other',
      state: 'other',
      has_last_error: false,
    });
  });

  it('reports a committed rule Grafana does not have as live: null', async () => {
    const cfg = healthy();
    cfg.repoRules = JSON.stringify({
      rules: [
        { uid: 'ifc074-error-spans-direct', title: 'x', expr: 'up', operator: 'gt', threshold: 0 },
      ],
    });
    const { json } = await baseline(cfg);
    expect(json.repo_rule_checks[0]).toMatchObject({ transitions_by_state: {}, live: null });
  });
});

describe('collect-observability-evidence: output hygiene', () => {
  it('fails closed (exit 1, nothing written) when a span name carries an email', async () => {
    const cfg = healthy();
    cfg.traces = {
      ...cfg.traces,
      [TRACE_A]: {
        service: 'ai-worker',
        spans: [{ spanId: SPAN_A, name: 'mail person@example.invalid', start: NOW_S - 3601 }],
      },
    };
    const h = harness(cfg);
    expect(await run(h.opts)).toBe(1);
    expect(h.files.size).toBe(0);
  });

  it('fails closed when a value carries a quote and newline', async () => {
    const cfg = healthy();
    cfg.traces = {
      ...cfg.traces,
      [TRACE_A]: {
        service: 'ai-worker',
        spans: [
          { spanId: SPAN_A, name: 'a"' + String.fromCharCode(10) + 'b', start: NOW_S - 3601 },
        ],
      },
    };
    const h = harness(cfg);
    expect(await run(h.opts)).toBe(1);
    expect(h.files.size).toBe(0);
  });

  it('fails closed when an alert service label is not a service name', async () => {
    const cfg = healthy();
    cfg.history = [
      {
        ...(cfg.history as Transition[])[0],
        service: 'tenant 0c1d2e3f-0000-4000-8000-000000000000',
      },
    ];
    const h = harness(cfg);
    expect(await run(h.opts)).toBe(1);
    expect(h.files.size).toBe(0);
  });

  it('removes temp files when the second output fails after the first was written', async () => {
    const h = harness(healthy());
    let renames = 0;
    const opts = {
      ...h.opts,
      rename: async (from: string, to: string) => {
        renames += 1;
        if (renames === 2) throw new Error('disk full');
        await h.opts.rename(from, to);
      },
    };
    expect(await run(opts)).toBe(1);
    expect([...h.files.keys()].some((k) => k.includes('.tmp'))).toBe(false);
  });

  it('exits 2 when ai-worker has no PASS row', async () => {
    const h = harness({ ...healthy(), logs: {} });
    expect(await run(h.opts)).toBe(2);
    expect(h.files.has(CSV)).toBe(true);
  });

  it('takes free-text JSON fields from constants only', async () => {
    const h = harness(healthy());
    await run(h.opts);
    const json = JSON.parse(h.files.get(JSON_OUT) as string);
    for (const l of json.limitations) expect(l).toMatch(/^[A-Za-z0-9 ,.;:()'%/<>=-]+$/);
    const keys = JSON.stringify(json).match(/"([a-z_]+)":/g) ?? [];
    for (const k of keys) expect(k).not.toMatch(/key|token|auth|secret|api/);
  });
});

describe('storedRuleDifferences', () => {
  const entry = {
    uid: 'r',
    title: 't',
    expr: 'up',
    operator: 'gt',
    threshold: 0,
    for: '0s',
    noData: 'OK',
    severity: 'high',
    summary: 's',
  };
  const config = {
    folder: { uid: 'f' },
    group: { name: 'g', intervalSeconds: 60 },
    datasourceUid: 'grafanacloud-prom',
  };

  it('finds no difference between a payload and an identical stored rule', () => {
    const payload = buildAlertRulePayload(entry, config, 'ifc-032');
    expect(storedRuleDifferences(structuredClone(payload), payload)).toEqual([]);
  });

  it('names each field that differs, without copying any value', () => {
    const payload = buildAlertRulePayload(entry, config, 'ifc-032');
    const stored = structuredClone(payload);
    stored.isPaused = true;
    stored.data[0].model.expr = 'secret-looking expr';
    stored.data[0].datasourceUid = 'other-ds';
    stored.data[2].model.conditions[0].evaluator.params = [5];
    stored.data = stored.data.filter((d: { refId: string }) => d.refId !== 'B');
    const diff = storedRuleDifferences(stored, payload);
    expect(diff).toEqual(['isPaused', 'A.expr', 'A.datasourceUid', 'B.missing', 'C.evaluator']);
    expect(JSON.stringify(diff)).not.toContain('secret');
  });
});

describe('sanitizeSpanName', () => {
  it.each([
    ['llm.invoke', 'llm.invoke'],
    ['GET /health/ready', 'GET /health/ready'],
    ['pg.query:INSERT postgres', 'pg.query:INSERT postgres'],
    ['connect aws-1-eu.pooler.example.com', 'redacted'],
    ['GET /api/leads/0c1d2e3f-0000-4000-8000-000000000000', 'redacted'],
    ['GET /x/deadbeefcafe', 'redacted'],
    ['GET /orders/1234567', 'redacted'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeSpanName(input)).toBe(expected);
  });
});

describe('splitIncidents', () => {
  it('splits exactly at a 1800 s gap and keeps 1799 s together', () => {
    const mk = (t: number) => ({
      t,
      ruleUID: 'r',
      service: 's',
      alertname: 'a',
      previous: 'Normal',
      current: 'Alerting',
    });
    const incidents = splitIncidents([mk(0), mk(1799), mk(3599)]);
    expect(incidents.map((i: unknown[]) => i.length)).toEqual([2, 1]);
  });
});

describe('groupEpisodes', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 22, 12, 0, s)).toISOString();
  const inc = (
    rule: string,
    service: string,
    errorS: number,
    alertS: number,
    trace = ERR_TRACE
  ) => ({
    rule_uid: rule,
    service,
    anchored: true,
    t_first_error: at(errorS),
    t_alerting: at(alertS),
    first_error_trace_id: trace,
  });

  it('joins incidents whose first errors are up to 600 s apart and splits at 601 s', () => {
    const episodes = groupEpisodes([
      inc('a', 'ai-worker', 0, 300),
      inc('b', 'ai-worker', 600, 660),
      inc('c', 'ai-worker', 1201, 1300),
    ]);
    expect(episodes.map((e) => [e.incidents, e.mttd_s, e.detected_by])).toEqual([
      [2, 300, 'a'],
      [1, 99, 'c'],
    ]);
  });

  it('measures from the earliest error to the earliest alert, whichever rules they came from', () => {
    const [episode] = groupEpisodes([
      inc('slow', 'ai-worker', 10, 300, TRACE_A),
      inc('fast', 'ai-worker', 0, 70, TRACE_B),
    ]);
    expect(episode).toMatchObject({
      first_error_trace_id: TRACE_B,
      detected_by: 'fast',
      mttd_s: 70,
      rule_uids: ['fast', 'slow'],
    });
  });

  it('keeps services apart and ignores unanchored incidents', () => {
    const episodes = groupEpisodes([
      inc('a', 'ai-worker', 0, 100),
      inc('a', 'api', 5, 50),
      { rule_uid: 'a', service: 'api', anchored: false, t_alerting: at(20) },
    ]);
    expect(episodes.map((e) => [e.service, e.mttd_s])).toEqual([
      ['ai-worker', 100],
      ['api', 45],
    ]);
  });
});

describe('parseArgs', () => {
  it('applies the defaults', () => {
    expect(parseArgs([])).toMatchObject({
      services: ['api', 'ai-worker'],
      logWindowDays: 7,
      alertWindowDays: 30,
      maxTraces: 10,
      outDir: 'artifacts/reports',
      dryRun: false,
      since: undefined,
    });
  });

  it.each([
    [['--services', 'API!']],
    [['--max-traces', '0']],
    [['--since', 'yesterday']],
    [['--bogus']],
  ])('rejects %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});
