import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRule, run, validateConfig } from '../observability/apply-grafana-alert-rules.mjs';

const CONFIG = JSON.parse(
  readFileSync(join(__dirname, '../../../infra/monitoring/grafana/cloud/alert-rules.json'), 'utf8')
);
const TOKEN = 'x'.repeat(24);

type Call = { method: string; path: string; body?: unknown };

/** Fake Grafana: records calls; per-path responses with sensible defaults. */
function fakeGrafana(
  opts: { series?: (q: string) => number; existing?: string[]; folder?: number } = {}
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
    ]);
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

describe('run', () => {
  it('refuses to start without the URL and token', async () => {
    await expect(run({ env: {}, argv: [], log: quiet })).rejects.toThrow(
      'GRAFANA_URL and GRAFANA_SA_TOKEN'
    );
  });

  it('dry run checks every selector and writes nothing', async () => {
    const g = fakeGrafana();
    const result = await run({ env, argv: ['--dry-run'], fetchImpl: g.fetchImpl, log: quiet });
    expect(result).toEqual({ applied: 0, empty: [] });
    expect(g.calls.every((c) => c.method === 'GET')).toBe(true);
    expect(g.calls).toHaveLength(CONFIG.rules.length);
  });

  it('creates missing rules, updates existing ones, sets the group interval and removes the test rule', async () => {
    const g = fakeGrafana({ existing: ['ifc032-api-error-rate'], folder: 404 });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(5);
    const writes = g.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);
    expect(writes).toContain('POST /api/folders');
    expect(writes).toContain('PUT /api/v1/provisioning/alert-rules/ifc032-api-error-rate');
    expect(writes.filter((w) => w === 'POST /api/v1/provisioning/alert-rules')).toHaveLength(4);
    expect(writes).toContain(
      'PUT /api/v1/provisioning/folder/intelliflow-prod/rule-groups/intelliflow-prod'
    );
    expect(writes).toContain('DELETE /api/v1/provisioning/alert-rules/ifc032-delivery-test');
  });

  it('with --send-test also applies the always-firing delivery rule and keeps it', async () => {
    const g = fakeGrafana();
    const result = await run({ env, argv: ['--send-test'], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(6);
    const posted = g.calls
      .filter((c) => c.method === 'POST')
      .map((c) => (c.body as { uid?: string }).uid);
    expect(posted).toContain('ifc032-delivery-test');
    expect(g.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('fails loudly when a rule watches a metric with no live series', async () => {
    const g = fakeGrafana({ series: (q) => (q.includes('latency') ? 0 : 2) });
    await expect(run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet })).rejects.toThrow(
      'match no live series (check metric names): ifc032-workflow-p95-latency'
    );
  });

  it('never logs the token', async () => {
    const lines: string[] = [];
    const g = fakeGrafana();
    await run({ env, argv: [], fetchImpl: g.fetchImpl, log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).not.toContain(TOKEN);
  });
});
