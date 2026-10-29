import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../observability/apply-grafana-dashboard.mjs';

// ENV-008-AI AC-005: the production service dashboard as code, applied by
// .github/workflows/grafana-dashboard.yml.
const CONFIG = JSON.parse(
  readFileSync(
    join(__dirname, '../../../infra/monitoring/grafana/cloud/dashboard-production.json'),
    'utf8'
  )
);
const TOKEN = 'x'.repeat(24);
const BASE = 'https://stack.example.invalid';
const ALLOWED_METRICS = ['traces_spanmetrics_calls_total', 'traces_spanmetrics_latency'];
const ALLOWED_SERVICES = ['api', 'ai-worker'];
// IFC-074 D8: the Loki datasources a panel may read, each with the one stream it may select.
const LOKI_STREAMS: Record<string, string> = {
  'grafanacloud-logs': '{service_name="ai-worker"}',
  'grafanacloud-alert-state-history': '{from="state-history"}',
};
const RULES = JSON.parse(
  readFileSync(join(__dirname, '../../../infra/monitoring/grafana/cloud/alert-rules.json'), 'utf8')
);

type Target = {
  refId: string;
  expr: string;
  datasource: { type?: string; uid: string };
  queryType?: string;
};
type Panel = { title: string; description?: string; targets: Target[] };
const targets = (config: typeof CONFIG): Target[] =>
  config.dashboard.panels.flatMap((p: Panel) => p.targets);
const isProm = (t: Target) => t.datasource.uid === 'grafanacloud-prom';
// Only the Prometheus targets are span-metric queries; Loki targets are checked separately.
const exprs = (config: typeof CONFIG): string[] =>
  targets(config)
    .filter(isProm)
    .map((t) => t.expr);

/** The identifier right before each `{` in a PromQL expression: its metric names. */
function metricNames(expr: string): string[] {
  const names: string[] = [];
  for (let i = expr.indexOf('{'); i !== -1; i = expr.indexOf('{', i + 1)) {
    let start = i;
    while (start > 0 && /[\w:]/.test(expr[start - 1])) start -= 1;
    if (start < i) names.push(expr.slice(start, i));
  }
  return names;
}

type Call = { method: string; path: string; body?: Record<string, unknown> };

function fakeGrafana(
  opts: { folder?: number; existing?: boolean; save?: number; saveBody?: string } = {}
) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    const path = url.replace(BASE, '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    if (path === '/api/folders/intelliflow-prod')
      return { status: opts.folder ?? 200, text: async () => '{}' };
    if (path === '/api/dashboards/uid/env008-production')
      return { status: opts.existing ? 200 : 404, text: async () => '{}' };
    if (path === '/api/dashboards/db' && init.method === 'POST')
      return {
        status: opts.save ?? 200,
        text: async () => opts.saveBody ?? '{"status":"success"}',
      };
    throw new Error(`unexpected call ${init.method} ${path}`);
  };
  return { calls, fetchImpl };
}

const env = { GRAFANA_URL: BASE, GRAFANA_SA_TOKEN: TOKEN };
const quiet = () => {};
const noSleep = async () => {};

describe('dashboard-production.json', () => {
  it('is valid, with a fixed uid in the production folder and six panels', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
    expect(CONFIG.dashboard.uid).toBe('env008-production');
    expect(CONFIG.folderUid).toBe('intelliflow-prod');
    expect(CONFIG.dashboard.panels).toHaveLength(6);
  });

  it('queries only the span-metric series that production emits, never a _bucket series', () => {
    for (const expr of exprs(CONFIG)) {
      const metrics = metricNames(expr);
      expect(metrics.length, expr).toBeGreaterThan(0);
      for (const metric of metrics) expect(ALLOWED_METRICS).toContain(metric);
      expect(expr).not.toContain('_bucket');
    }
  });

  it('matches only the services that emit telemetry (api, ai-worker)', () => {
    for (const expr of exprs(CONFIG)) {
      const matchers = [...expr.matchAll(/service(=~|=)"([^"]+)"/g)];
      expect(matchers.length, expr).toBeGreaterThan(0);
      for (const [, op, value] of matchers) {
        const values = op === '=~' ? value.split('|') : [value];
        for (const v of values) expect(ALLOWED_SERVICES).toContain(v);
      }
      expect(expr).not.toMatch(/service(!=|!~)/);
    }
  });

  it('reads each target from a known Grafana Cloud datasource and lets Grafana assign panel ids', () => {
    for (const panel of CONFIG.dashboard.panels as Panel[]) {
      expect(panel).not.toHaveProperty('id');
      for (const t of panel.targets) {
        if (isProm(t)) continue;
        expect(Object.keys(LOKI_STREAMS)).toContain(t.datasource.uid);
        expect(t.datasource.type).toBe('loki');
        expect(t.queryType).toBe('range');
      }
    }
  });

  it('selects in each Loki target only the stream its datasource allows', () => {
    const loki = targets(CONFIG).filter((t) => !isProm(t));
    expect(loki.length).toBeGreaterThan(0);
    for (const t of loki) {
      // Exactly one stream selector, and it is the allowed one.
      expect(t.expr.split('{').length - 1, t.expr).toBe(1);
      expect(t.expr).toContain(LOKI_STREAMS[t.datasource.uid]);
    }
  });

  it('has an "MTTD per error episode (live proxy)" panel pointing at the official KPI', () => {
    const panel = (CONFIG.dashboard.panels as Panel[]).find((p) =>
      p.title.includes('MTTD per error episode')
    ) as Panel;
    expect(panel.title).toContain('live proxy');
    expect(panel.description).toContain('proxy');
    expect(panel.description).toContain('artifacts/reports/mttr-baseline.json');
    expect(panel.description).toContain('IFC-074');
    const [a, b, c] = panel.targets;
    expect(a.datasource.uid).toBe('grafanacloud-prom');
    expect(a.expr).toContain('status_code="STATUS_CODE_ERROR"');
    // Target B counts the very lines ifc074-error-logs-direct alerts on, per minute.
    const ruleExpr = RULES.rules.find((r: { uid: string }) => r.uid === 'ifc074-error-logs-direct')
      .expr as string;
    expect(b.datasource.uid).toBe('grafanacloud-logs');
    expect(b.expr).toBe(ruleExpr.replace('[2m]', '[$__interval]'));
    expect(c.datasource.uid).toBe('grafanacloud-alert-state-history');
    expect(c.expr).toContain('current=~"Alerting.*"');
    expect(c.expr).toContain('previous!~"Alerting.*"');
    // Each sample covers its whole step, so wide ranges do not drop bursts or firings.
    for (const t of [a, b, c]) expect(t.expr).toContain('[$__interval]');
    expect((panel as Panel & { interval?: string }).interval).toBe('1m');
  });
});

describe('validateConfig', () => {
  const withExpr = (expr: string) => {
    const bad = JSON.parse(JSON.stringify(CONFIG));
    bad.dashboard.panels[0].targets[0].expr = expr;
    return bad;
  };

  it('rejects a metric production does not emit', () => {
    expect(validateConfig(withExpr('sum(rate(http_requests_total{service="api"}[5m]))'))).toEqual([
      expect.stringContaining('http_requests_total'),
    ]);
  });

  it('rejects a _bucket series', () => {
    expect(
      validateConfig(withExpr('sum(rate(traces_spanmetrics_latency_bucket{service="api"}[5m]))'))
    ).toEqual(expect.arrayContaining([expect.stringContaining('_bucket')]));
  });

  it('rejects a foreign service with =', () => {
    expect(
      validateConfig(withExpr('sum(rate(traces_spanmetrics_calls_total{service="ws"}[5m]))'))
    ).toEqual([expect.stringContaining('ws')]);
  });

  it('rejects a foreign service hidden inside a =~ alternative', () => {
    expect(
      validateConfig(
        withExpr('sum(rate(traces_spanmetrics_calls_total{service=~"api|events-worker"}[5m]))')
      )
    ).toEqual([expect.stringContaining('events-worker')]);
  });

  it.each(['!=', '!~'])('rejects a negative service matcher (%s)', (op) => {
    expect(
      validateConfig(withExpr(`sum(rate(traces_spanmetrics_calls_total{service${op}"ws"}[5m]))`))
    ).toEqual([expect.stringContaining(op)]);
  });

  it('rejects a query with no service matcher', () => {
    expect(validateConfig(withExpr('sum(rate(traces_spanmetrics_calls_total{}[5m]))'))).toEqual([
      expect.stringContaining('no service matcher'),
    ]);
  });

  it('checks panels nested inside a row too', () => {
    const bad = JSON.parse(JSON.stringify(CONFIG));
    bad.dashboard.panels.push({
      type: 'row',
      title: 'row',
      panels: [
        {
          type: 'timeseries',
          title: 'nested',
          targets: [
            { refId: 'A', expr: 'up{service="ws"}', datasource: { uid: 'grafanacloud-prom' } },
          ],
        },
      ],
    });
    expect(validateConfig(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining('up'), expect.stringContaining('ws')])
    );
  });

  it('does not read a label that only ends in "service" as the service matcher', () => {
    expect(
      validateConfig(
        withExpr('sum(rate(traces_spanmetrics_calls_total{peer_service="ws", service="api"}[5m]))')
      )
    ).toEqual([]);
  });

  const withTarget = (target: Record<string, unknown>) => {
    const bad = JSON.parse(JSON.stringify(CONFIG));
    bad.dashboard.panels[0].targets = [target];
    return bad;
  };

  it('accepts each allowed Loki stream on its own datasource', () => {
    for (const [uid, stream] of Object.entries(LOKI_STREAMS)) {
      expect(
        validateConfig(
          withTarget({
            refId: 'A',
            datasource: { type: 'loki', uid },
            expr: `count_over_time(${stream} [1m])`,
          })
        )
      ).toEqual([]);
    }
  });

  it('rejects a target on a datasource that is not allowed', () => {
    expect(
      validateConfig(
        withTarget({
          refId: 'A',
          datasource: { type: 'loki', uid: 'grafanacloud-other' },
          expr: 'count_over_time({service_name="ai-worker"} [1m])',
        })
      )
    ).toEqual([expect.stringContaining('datasource grafanacloud-other')]);
  });

  it('rejects a Loki query on the Prometheus datasource', () => {
    expect(
      validateConfig(
        withTarget({
          refId: 'A',
          datasource: { uid: 'grafanacloud-prom' },
          expr: 'count_over_time({service_name="ai-worker"} [1m])',
        })
      )
    ).not.toEqual([]);
  });

  it.each([
    ['grafanacloud-logs', '{service_name="api"}'],
    ['grafanacloud-logs', '{from="state-history"}'],
    ['grafanacloud-alert-state-history', '{service_name="ai-worker"}'],
    ['grafanacloud-logs', '{service_name=~".+"}'],
  ])('rejects a Loki selector its datasource does not allow (%s %s)', (uid, stream) => {
    expect(
      validateConfig(
        withTarget({
          refId: 'A',
          datasource: { type: 'loki', uid },
          expr: `count_over_time(${stream} [1m])`,
        })
      )
    ).toEqual([expect.stringContaining('stream')]);
  });

  it('rejects a wrong uid or folder', () => {
    const bad = JSON.parse(JSON.stringify(CONFIG));
    bad.dashboard.uid = 'other';
    bad.folderUid = 'elsewhere';
    expect(validateConfig(bad)).toEqual([
      expect.stringContaining('dashboard.uid'),
      expect.stringContaining('folderUid'),
    ]);
  });
});

describe('run', () => {
  it('refuses to start without the URL and token, before any request', async () => {
    const g = fakeGrafana();
    await expect(run({ env: {}, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'GRAFANA_URL and GRAFANA_SA_TOKEN are required'
    );
    expect(g.calls).toEqual([]);
  });

  it('dry run only reads the folder and the dashboard', async () => {
    const g = fakeGrafana();
    const result = await run({
      env,
      argv: ['--dry-run'],
      fetchImpl: g.fetchImpl,
      log: quiet,
      sleep: noSleep,
    });
    expect(g.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/folders/intelliflow-prod',
      'GET /api/dashboards/uid/env008-production',
    ]);
    expect(result).toEqual({ applied: false, existed: false });
  });

  it('saves the dashboard into the production folder with overwrite', async () => {
    const g = fakeGrafana({ existing: true });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet, sleep: noSleep });
    const save = g.calls.find((c) => c.method === 'POST');
    expect(save?.path).toBe('/api/dashboards/db');
    expect(save?.body).toMatchObject({
      dashboard: { uid: 'env008-production' },
      folderUid: 'intelliflow-prod',
      overwrite: true,
      message: 'ENV-008-AI dashboard as code',
    });
    expect(result).toEqual({ applied: true, existed: true });
  });

  it('does not create the folder; it fails when the folder is missing', async () => {
    const g = fakeGrafana({ folder: 404 });
    await expect(
      run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet, sleep: noSleep })
    ).rejects.toThrow('folder intelliflow-prod: HTTP 404');
    expect(g.calls.some((c) => c.method !== 'GET')).toBe(false);
  });

  it.each([400, 412])('surfaces a %i on save as a redacted error', async (status) => {
    const leaked = 'gl' + 'sa_' + 'r'.repeat(32);
    const g = fakeGrafana({ save: status, saveBody: `{"message":"no ${leaked}"}` });
    const err = await run({
      env,
      argv: [],
      fetchImpl: g.fetchImpl,
      log: quiet,
      sleep: noSleep,
    }).catch((e: Error) => e);
    expect((err as Error).message).toContain(`save dashboard: HTTP ${status}`);
    expect((err as Error).message).not.toContain(leaked);
  });

  it('retries a 503 through the injected sleep', async () => {
    const g = fakeGrafana();
    let first = true;
    const sleeps: number[] = [];
    const fetchImpl: typeof g.fetchImpl = async (url, init) => {
      if (first) {
        first = false;
        return { status: 503, text: async () => '' };
      }
      return g.fetchImpl(url, init);
    };
    await run({
      env,
      argv: ['--dry-run'],
      fetchImpl,
      log: quiet,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([5000]);
  });

  it('never logs the token', async () => {
    const lines: string[] = [];
    const g = fakeGrafana();
    await run({
      env,
      argv: [],
      fetchImpl: g.fetchImpl,
      log: (l: string) => lines.push(l),
      sleep: noSleep,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(TOKEN);
  });
});
