import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRule,
  liveSeriesSelector,
  run,
  validateConfig,
} from '../observability/apply-grafana-alert-rules.mjs';

const CONFIG = JSON.parse(
  readFileSync(join(__dirname, '../../../infra/monitoring/grafana/cloud/alert-rules.json'), 'utf8')
);
const TOKEN = 'x'.repeat(24);

type Call = { method: string; path: string; body?: unknown };

/** Fake Grafana: records calls; per-path responses with sensible defaults. */
function fakeGrafana(
  opts: {
    series?: (q: string) => number;
    lokiStreams?: (selector: string) => number;
    existing?: string[];
    folder?: number;
  } = {}
) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    const path = url.replace('https://stack.example.invalid', '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const reply = (status: number, json?: unknown) => ({
      status,
      text: async () => (json === undefined ? '' : JSON.stringify(json)),
    });
    if (path.includes('/loki/api/v1/series')) {
      const selector = decodeURIComponent(path.split('match%5B%5D=')[1].split('&')[0]);
      const n = opts.lokiStreams ? opts.lokiStreams(selector) : 2;
      return reply(200, { status: 'success', data: Array.from({ length: n }, () => ({})) });
    }
    if (path.includes('/api/v1/query')) {
      const q = decodeURIComponent(path.split('query=')[1]);
      return reply(200, {
        data: { result: [{ value: [0, String(opts.series ? opts.series(q) : 3)] }] },
      });
    }
    if (path.startsWith('/api/folders/')) return reply(opts.folder ?? 200, {});
    if (path === '/api/folders') return reply(200, {});
    const uid = path.split('/alert-rules/')[1];
    if (init.method === 'GET' && uid) return reply(opts.existing?.includes(uid) ? 200 : 404, {});
    if (init.method === 'DELETE') return reply(204);
    return reply(init.method === 'POST' ? 201 : 200, {});
  };
  return { calls, fetchImpl };
}

const env = { GRAFANA_URL: 'https://stack.example.invalid', GRAFANA_SA_TOKEN: TOKEN };
const quiet = () => {};

describe('alert rules config', () => {
  it('the committed rules file is valid', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
    expect(CONFIG.rules.map((r: { uid: string }) => r.uid)).toEqual([
      'ifc032-telemetry-silent',
      'ifc032-lead-routing-failures',
      'ifc032-workflow-error-rate',
      'ifc032-workflow-p95-latency',
      'ifc032-api-error-rate',
      'ifc074-error-spans-direct',
      'ifc074-error-logs-direct',
    ]);
  });

  // #812: four rules watch traffic that does not exist yet (workflow.lead.route
  // has no callers; #802 hasn't promoted the api SERVER spans) and opt out
  // with requireSeries:false, so the script reports them without failing the
  // run. ifc074-error-spans-direct keeps the check, made against its base
  // metric (see liveSeriesSelector), because a period with no error spans is
  // healthy. ifc032-telemetry-silent skips the check entirely
  // (liveSeriesCheck:false): it alerts when its series are absent, so the
  // check contradicts its purpose, and a wrong name there fires at once.
  it('the four traffic-less rules opt out of the live-series requirement; the others do not', () => {
    const byUid = Object.fromEntries(
      CONFIG.rules.map((r: { uid: string; requireSeries?: boolean; liveSeriesCheck?: boolean }) => [
        r.uid,
        { requireSeries: r.requireSeries, liveSeriesCheck: r.liveSeriesCheck },
      ])
    );
    const traffic = { requireSeries: false, liveSeriesCheck: undefined };
    expect(byUid).toEqual({
      'ifc032-telemetry-silent': { requireSeries: undefined, liveSeriesCheck: false },
      'ifc032-lead-routing-failures': traffic,
      'ifc032-workflow-error-rate': traffic,
      'ifc032-workflow-p95-latency': traffic,
      'ifc032-api-error-rate': traffic,
      'ifc074-error-spans-direct': { requireSeries: undefined, liveSeriesCheck: undefined },
      'ifc074-error-logs-direct': { requireSeries: undefined, liveSeriesCheck: undefined },
    });
  });

  it('only a rule that alerts on silence skips the series check', () => {
    for (const rule of CONFIG.rules) {
      if (rule.liveSeriesCheck === false) expect(rule.noData, rule.uid).toBe('Alerting');
    }
  });

  it('rejects requireSeries or liveSeriesCheck that is not a boolean', () => {
    const bad = structuredClone(CONFIG);
    bad.rules[0].liveSeriesCheck = 'no';
    bad.rules[1].requireSeries = 0;
    expect(validateConfig(bad)).toEqual([
      'ifc032-telemetry-silent: liveSeriesCheck must be true or false',
      'ifc032-lead-routing-failures: requireSeries must be true or false',
    ]);
  });

  // IFC-074: Asserts' ErrorRatioBreach fires 180-360 s after the first error.
  // The first version of this rule (2m window, evaluated at "now") never
  // fired in 24 h of production: span metrics land 60-120 s after the error
  // and reach the ruler more than 60 s later still, by which time a 2m
  // increase was already back to 0. A 5m window read 60 s back (like Asserts'
  // own rules) fires on every replayed episode across 60-120 s of ingest lag.
  // Pin what that depends on.
  it('the fast error rule reads span metrics over 5m, 60 s back, with no pending period', () => {
    const entry = CONFIG.rules.find((r: { uid: string }) => r.uid === 'ifc074-error-spans-direct');
    expect(entry.expr).toMatch(/^sum by \(service\) \(increase\(traces_spanmetrics_calls_total\{/);
    expect(entry.expr).toContain('status_code="STATUS_CODE_ERROR"');
    expect(entry.expr).toContain('[5m]');
    expect(entry.expr).not.toMatch(/asserts:|offset/);
    expect(entry).toMatchObject({
      operator: 'gt',
      threshold: 0,
      for: '0s',
      noData: 'OK',
      queryOffsetSeconds: 60,
    });
    expect(CONFIG.group.intervalSeconds).toBe(60);

    const rule = buildRule(entry, CONFIG);
    expect(rule.for).toBe('0s');
    expect(rule.data[0].relativeTimeRange).toEqual({ from: 900, to: 60 });
    expect(rule.data[0].model.instant).toBe(true);
  });

  // The combined worker reports as intelliflow-ai-worker. Both rules that
  // watch ai-worker must see it, and telemetry-silent must stay quiet while
  // either name still sends spans, so it sums across both (no `by`).
  it('the ai-worker rules cover the combined worker without a false "silent" at cutover', () => {
    const byUid = (uid: string) => CONFIG.rules.find((r: { uid: string }) => r.uid === uid);
    const fast = byUid('ifc074-error-spans-direct');
    expect(fast.expr).toContain('service=~"ai-worker|intelliflow-ai-worker|api"');
    expect(fast.selector).toContain('service=~"ai-worker|intelliflow-ai-worker|api"');

    const silent = byUid('ifc032-telemetry-silent');
    expect(silent.expr).toBe(
      'sum(rate(traces_spanmetrics_calls_total{service=~"ai-worker|intelliflow-ai-worker"}[15m]))'
    );
    expect(silent.selector).toBe(
      'traces_spanmetrics_calls_total{service=~"ai-worker|intelliflow-ai-worker"}'
    );
    expect(silent).toMatchObject({ operator: 'lt', threshold: 0.001, for: '15m' });
  });

  // IFC-074 MTTD < 120 s: no span-metrics rule can get there (the first sample
  // lands 60-120 s after the error and reaches the ruler more than 60 s
  // later), while Loki ingests a log line in seconds. This rule reads
  // error-level log lines from the same services on the logs datasource.
  it('the fast log rule counts error-level lines over 2m on Loki, at "now", with no pending period', () => {
    const entry = CONFIG.rules.find((r: { uid: string }) => r.uid === 'ifc074-error-logs-direct');
    const services = 'service_name=~"ai-worker|intelliflow-ai-worker|api"';
    const levels = '"(?i)error|fatal|critical"';
    expect(entry.datasourceUid).toBe('grafanacloud-logs');
    expect(entry.selector).toBe(`{${services}}`);
    expect(entry.expr).toBe(
      `sum by (service_name) (count_over_time({${services}} | detected_level=~${levels} or severity_text=~${levels} [2m]))`
    );
    expect(entry).toMatchObject({ operator: 'gt', threshold: 0, for: '0s', noData: 'OK' });
    expect(entry.queryOffsetSeconds).toBeUndefined();

    const rule = buildRule(entry, CONFIG);
    expect(rule.data[0].datasourceUid).toBe('grafanacloud-logs');
    expect(rule.data[0].model.queryType).toBe('instant');
    expect(rule.data[0].relativeTimeRange).toEqual({ from: 900, to: 0 });
  });

  it('every other rule stays on the metrics datasource', () => {
    for (const entry of CONFIG.rules.filter(
      (r: { uid: string }) => r.uid !== 'ifc074-error-logs-direct'
    )) {
      expect(entry.datasourceUid, entry.uid).toBeUndefined();
      expect(buildRule(entry, CONFIG).data[0].datasourceUid).toBe('grafanacloud-prom');
    }
  });

  it('rejects a datasourceUid that is not a known Grafana Cloud datasource', () => {
    const bad = structuredClone(CONFIG);
    bad.rules[1].datasourceUid = 'grafanacloud-tempo';
    expect(validateConfig(bad)).toEqual([
      'ifc032-lead-routing-failures: datasourceUid must be one of grafanacloud-prom, grafanacloud-logs',
    ]);
  });

  it('the other rules keep evaluating at "now"', () => {
    for (const entry of CONFIG.rules.filter(
      (r: { uid: string }) => r.uid !== 'ifc074-error-spans-direct'
    )) {
      expect(buildRule(entry, CONFIG).data[0].relativeTimeRange).toEqual({ from: 900, to: 0 });
    }
  });

  it('rejects a query offset that is not a whole number of seconds below the 900 s range', () => {
    for (const queryOffsetSeconds of [-1, 1.5, 900, '60']) {
      const bad = { ...CONFIG, rules: [{ ...CONFIG.rules[0], queryOffsetSeconds }] };
      expect(validateConfig(bad)).toEqual([
        'ifc032-telemetry-silent: queryOffsetSeconds must be a whole number from 0 to 600',
      ]);
    }
  });

  it('reports missing fields, bad operators, bad thresholds and duplicates', () => {
    const bad = {
      rules: [
        { ...CONFIG.rules[0], operator: 'eq', threshold: '1' },
        { ...CONFIG.rules[0], summary: '' },
      ],
    };
    expect(validateConfig(bad)).toEqual([
      'ifc032-telemetry-silent: operator must be gt or lt',
      'ifc032-telemetry-silent: threshold must be a number',
      'ifc032-telemetry-silent: missing summary',
      'ifc032-telemetry-silent: duplicate uid',
    ]);
  });

  // Every value checked here is interpolated straight into a URL path segment
  // in client()'s caller (run()); a `/`, `..` or `?` in any of them would let
  // one path segment become two, retarget the request, or add a query string.
  it('rejects a rule uid that would break out of its URL path segment', () => {
    const bad = { ...CONFIG, rules: [{ ...CONFIG.rules[0], uid: 'a/../other' }] };
    expect(validateConfig(bad)).toEqual([expect.stringContaining('a/../other')]);
  });

  it('rejects an unsafe folder.uid, group.name or deliveryTest.uid', () => {
    expect(validateConfig({ ...CONFIG, folder: { ...CONFIG.folder, uid: 'x/y' } })).toEqual([
      expect.stringContaining('folder.uid'),
    ]);
    expect(validateConfig({ ...CONFIG, group: { ...CONFIG.group, name: 'a?b=1' } })).toEqual([
      expect.stringContaining('group.name'),
    ]);
    expect(
      validateConfig({ ...CONFIG, deliveryTest: { ...CONFIG.deliveryTest, uid: 'a#frag' } })
    ).toEqual([expect.stringContaining('deliveryTest.uid')]);
  });

  it('builds a query -> reduce -> threshold rule in the configured folder and group', () => {
    const rule = buildRule(CONFIG.rules[0], CONFIG);
    expect(rule).toMatchObject({
      uid: 'ifc032-telemetry-silent',
      folderUID: 'intelliflow-prod',
      ruleGroup: 'intelliflow-prod',
      condition: 'C',
      noDataState: 'Alerting',
      for: '15m',
    });
    expect(rule.data[0].model.expr).toBe(CONFIG.rules[0].expr);
    expect(rule.data[2].model.conditions[0].evaluator).toEqual({ type: 'lt', params: [0.001] });
  });
});

describe('liveSeriesSelector', () => {
  it('drops the error-only matcher wherever it sits and keeps the rest', () => {
    expect(liveSeriesSelector('m{service="api", status_code="STATUS_CODE_ERROR"}')).toBe(
      'm{service="api"}'
    );
    expect(liveSeriesSelector('m{status_code="STATUS_CODE_ERROR", service=~"a|b"}')).toBe(
      'm{service=~"a|b"}'
    );
    expect(liveSeriesSelector('m{status_code="STATUS_CODE_ERROR"}')).toBe('m');
  });

  it('leaves selectors without it, and other status_code matchers, unchanged', () => {
    expect(liveSeriesSelector('m{service="api", span_kind="SPAN_KIND_SERVER"}')).toBe(
      'm{service="api", span_kind="SPAN_KIND_SERVER"}'
    );
    expect(liveSeriesSelector('m{status_code!="STATUS_CODE_ERROR"}')).toBe(
      'm{status_code!="STATUS_CODE_ERROR"}'
    );
    expect(liveSeriesSelector('sum(m)')).toBe('sum(m)');
  });

  it('keeps a quoted comma or escaped quote inside a value intact', () => {
    expect(liveSeriesSelector('m{span_name="a,b \\"c\\"", status_code="STATUS_CODE_ERROR"}')).toBe(
      'm{span_name="a,b \\"c\\""}'
    );
  });
});

describe('run', () => {
  it('refuses to start without the URL and token', async () => {
    await expect(run({ env: {}, argv: [], log: quiet })).rejects.toThrow(
      'GRAFANA_URL and GRAFANA_SA_TOKEN'
    );
  });

  it('dry run checks every selector except the silence rule and writes nothing', async () => {
    const g = fakeGrafana();
    const lines: string[] = [];
    const result = await run({
      env,
      argv: ['--dry-run'],
      fetchImpl: g.fetchImpl,
      log: (l: string) => lines.push(l),
    });
    expect(result).toEqual({ applied: 0, empty: [] });
    expect(g.calls.every((c) => c.method === 'GET')).toBe(true);
    expect(g.calls).toHaveLength(CONFIG.rules.length - 1);
    // The silence rule's own selector is never queried.
    const silent = CONFIG.rules[0].selector;
    expect(g.calls.some((c) => decodeURIComponent(c.path).includes(silent))).toBe(false);
    expect(lines).toContain('series skip  ifc032-telemetry-silent  (liveSeriesCheck: false)');
  });

  it('creates missing rules, updates existing ones, sets the group interval and removes the test rule', async () => {
    const g = fakeGrafana({ existing: ['ifc032-api-error-rate'], folder: 404 });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(7);
    const writes = g.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
    expect(writes).toContain('POST /api/folders');
    expect(writes).toContain('PUT /api/v1/provisioning/alert-rules/ifc032-api-error-rate');
    expect(writes.filter((w) => w === 'POST /api/v1/provisioning/alert-rules')).toHaveLength(6);
    expect(writes).toContain(
      'PUT /api/v1/provisioning/folder/intelliflow-prod/rule-groups/intelliflow-prod'
    );
    expect(writes).toContain('DELETE /api/v1/provisioning/alert-rules/ifc032-delivery-test');
  });

  it('with --send-test also applies the always-firing delivery rule and keeps it', async () => {
    const g = fakeGrafana();
    const result = await run({ env, argv: ['--send-test'], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(8);
    const posted = g.calls
      .filter((c) => c.method === 'POST')
      .map((c) => (c.body as { uid?: string }).uid);
    expect(posted).toContain('ifc032-delivery-test');
    expect(g.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('checks the log rule on the Loki series route over the last 7 days, the others on Prometheus', async () => {
    const g = fakeGrafana();
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    await run({ env, argv: ['--dry-run'], fetchImpl: g.fetchImpl, log: quiet, now: () => now });
    const loki = g.calls.filter((c) => c.path.includes('/loki/api/v1/series'));
    const end = now / 1000;
    expect(loki.map((c) => c.path)).toEqual([
      '/api/datasources/proxy/uid/grafanacloud-logs/loki/api/v1/series?match%5B%5D=' +
        encodeURIComponent('{service_name=~"ai-worker|intelliflow-ai-worker|api"}') +
        `&start=${end - 7 * 86400}&end=${end}`,
    ]);
    const prom = g.calls.filter((c) => c.path.includes('/api/v1/query'));
    expect(prom).toHaveLength(CONFIG.rules.length - 2);
    expect(
      prom.every((c) => c.path.startsWith('/api/datasources/proxy/uid/grafanacloud-prom/'))
    ).toBe(true);
  });

  it('fails loudly when the log rule matches no log streams (a wrong service_name)', async () => {
    const g = fakeGrafana({ lokiStreams: () => 0 });
    await expect(run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'match no live series (check metric names): ifc074-error-logs-direct'
    );
  });

  it('fails loudly when a rule watches a metric with no live series', async () => {
    // Only ifc074-error-spans-direct still requires series: the other four
    // opted out with requireSeries:false and telemetry-silent skips the check,
    // so of the selectors matching "ai-worker" only ifc074's can fail the run.
    const g = fakeGrafana({ series: (q) => (q.includes('ai-worker') ? 0 : 2) });
    await expect(run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'match no live series (check metric names): ifc074-error-spans-direct'
    );
  });

  // The 21:09 run after #1055 failed on ifc032-telemetry-silent and
  // ifc074-error-spans-direct: at night the api sleeps (#1046) and the worker
  // is idle, so the last hour had no series. The check now looks back 7 days.
  it('passes on a quiet night: a metric with no series in the last hour but some this week', async () => {
    const queries: string[] = [];
    const g = fakeGrafana({
      series: (q) => {
        queries.push(q);
        return q.endsWith('[7d]))') ? 4 : 0;
      },
    });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.empty).toEqual([]);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.endsWith('[7d]))'))).toBe(true);
  });

  it('still fails a misspelled metric, which has no series at any range', async () => {
    const g = fakeGrafana({ series: () => 0 });
    await expect(run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'match no live series (check metric names): ifc074-error-spans-direct'
    );
  });

  // After #1045 merged, the first apply failed only because there were no error
  // spans: the rule's status_code="STATUS_CODE_ERROR" selector matched nothing.
  // The check now proves the base metric exists for the same services.
  it('checks an error-only rule against its base metric, so no errors is not a failure', async () => {
    const queries: string[] = [];
    const g = fakeGrafana({
      series: (q) => {
        queries.push(q);
        return q.includes('STATUS_CODE_ERROR') ? 0 : 2;
      },
    });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.empty).toEqual([]);
    expect(queries.some((q) => q.includes('status_code'))).toBe(false);
    expect(queries).toContain(
      'count(last_over_time(traces_spanmetrics_calls_total{service=~"ai-worker|intelliflow-ai-worker|api"}[7d]))'
    );
  });

  it('still fails an error-only rule whose base metric has no series (a wrong name)', async () => {
    const g = fakeGrafana({ series: (q) => (q.includes('|api"}') ? 0 : 2) });
    await expect(run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'match no live series (check metric names): ifc074-error-spans-direct'
    );
  });

  it('does not fail the run when a requireSeries:false rule has no live series (#812)', async () => {
    const g = fakeGrafana({ series: (q) => (q.includes('latency') ? 0 : 2) });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(7);
    expect(result.empty).toEqual([]);
  });

  it('never logs the token', async () => {
    const lines: string[] = [];
    const g = fakeGrafana();
    await run({ env, argv: [], fetchImpl: g.fetchImpl, log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).not.toContain(TOKEN);
  });

  // ENV-008-AI AC-001: the workflow was red from 2026-10-06 on HTTP 503 while
  // the Grafana Cloud instance woke up. run() must pass its sleep to the client.
  it('retries a 503 on the series check through the injected sleep', async () => {
    const g = fakeGrafana();
    let first = true;
    const sleeps: number[] = [];
    const fetchImpl: typeof g.fetchImpl = async (url, init) => {
      if (first && url.includes('/api/v1/query')) {
        first = false;
        return { status: 503, text: async () => 'waking up' };
      }
      return g.fetchImpl(url, init);
    };
    const result = await run({
      env,
      argv: ['--dry-run'],
      fetchImpl,
      log: quiet,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    expect(result).toEqual({ applied: 0, empty: [] });
    expect(sleeps).toEqual([5000]);
  });

  it.each([
    [
      'the folder create',
      'create folder: HTTP 400',
      (url: string, method: string) => method === 'POST' && url.endsWith('/api/folders'),
    ],
    [
      'the rule-group update',
      'rule group interval: HTTP 400',
      (url: string, method: string) => method === 'PUT' && url.includes('/rule-groups/'),
    ],
  ])('does not echo a token from a 400 body at %s', async (_site, expected, matches) => {
    const leaked = 'gl' + 'sa_' + 'n'.repeat(32);
    const g = fakeGrafana({ folder: 404 });
    const fetchImpl: typeof g.fetchImpl = async (url, init) => {
      if (matches(url, init.method)) {
        return { status: 400, text: async () => `{"message":"no ${leaked}"}` };
      }
      return g.fetchImpl(url, init);
    };
    const err = await run({ env, argv: [], fetchImpl, log: quiet }).catch((e: Error) => e);
    expect((err as Error).message).toContain(expected);
    expect((err as Error).message).not.toContain(leaked);
  });

  it('does not echo a token from an error response body', async () => {
    const leaked = 'gl' + 'sa_' + 'k'.repeat(32);
    const g = fakeGrafana();
    const fetchImpl: typeof g.fetchImpl = async (url, init) => {
      if (init.method === 'POST' && url.endsWith('/api/v1/provisioning/alert-rules')) {
        return { status: 400, text: async () => `{"message":"bad token ${leaked}"}` };
      }
      return g.fetchImpl(url, init);
    };
    const err = await run({ env, argv: [], fetchImpl, log: quiet }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('HTTP 400');
    expect((err as Error).message).not.toContain(leaked);
  });
});
