import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildAlertRule,
  buildCheckPayload,
  run,
  validateConfig,
} from '../observability/apply-synthetic-monitoring.mjs';

const CONFIG = JSON.parse(
  readFileSync(
    join(__dirname, '../../../infra/monitoring/grafana/cloud/synthetic-monitoring.json'),
    'utf8'
  )
);
const SM_TOKEN = 'x'.repeat(24);
const GRAFANA_TOKEN = 'y'.repeat(24);
const SM_URL = 'https://sm.example.invalid';
const GRAFANA_URL = 'https://stack.example.invalid';

type Call = { method: string; url: string; body?: unknown };
type FakeResponse = { status: number; json?: unknown };
type FakeOpts = {
  existingCheckJob?: string;
  existingAlertRule?: boolean;
  folderMissing?: boolean;
  probes?: Array<{ id: number; name: string; public: boolean }>;
  series?: (q: string) => number;
};

// Each handler below covers one endpoint (or a tiny, flat group of them) so
// no single function's branching comes close to the cognitive-complexity
// budget — see handleSmCall/handleGrafanaCall, which just dispatch to these.
function smCheckList(opts: FakeOpts): FakeResponse {
  return {
    status: 200,
    json: opts.existingCheckJob ? [{ id: 42, job: opts.existingCheckJob, target: 'x' }] : [],
  };
}

function handleSmCall(path: string, method: string, body: unknown, opts: FakeOpts): FakeResponse {
  const probes = opts.probes ?? [
    { id: 11, name: 'London', public: true },
    { id: 12, name: 'Amsterdam', public: true },
    { id: 13, name: 'Frankfurt', public: true },
  ];
  if (path === '/api/v1/probe/list') return { status: 200, json: probes };
  if (path === '/api/v1/check/list') return smCheckList(opts);
  if (path === '/api/v1/check/add')
    return { status: 201, json: { ...(body as Record<string, unknown>), id: 99 } };
  if (path === '/api/v1/check/update') return { status: 200, json: body };
  throw new Error(`unexpected SM call: ${method} ${path}`);
}

function grafanaSeriesQuery(path: string, opts: FakeOpts): FakeResponse {
  const q = decodeURIComponent(path.split('query=')[1]);
  const n = opts.series ? opts.series(q) : 1;
  return { status: 200, json: { data: { result: [{ value: [0, String(n)] }] } } };
}

function grafanaAlertRuleByUid(method: string, opts: FakeOpts): FakeResponse {
  if (method === 'GET') return { status: opts.existingAlertRule ? 200 : 404, json: {} };
  return { status: 200, json: {} }; // PUT (update)
}

function handleGrafanaCall(path: string, method: string, opts: FakeOpts): FakeResponse {
  if (path.startsWith('/api/datasources/proxy/')) return grafanaSeriesQuery(path, opts);
  if (path.startsWith('/api/folders/')) return { status: opts.folderMissing ? 404 : 200, json: {} };
  if (path === '/api/folders') return { status: 200, json: {} };
  if (path.startsWith('/api/v1/provisioning/alert-rules/'))
    return grafanaAlertRuleByUid(method, opts);
  if (path === '/api/v1/provisioning/alert-rules' && method === 'POST')
    return { status: 201, json: {} };
  if (path.startsWith('/api/v1/provisioning/folder/') && method === 'PUT')
    throw new Error('must never replace the shared rule group — see run()');
  throw new Error(`unexpected Grafana call: ${method} ${path}`);
}

/**
 * Fakes both backends the script talks to behind one fetchImpl, routed by
 * host: the Synthetic Monitoring API (checks, probes) and the Grafana
 * provisioning API (alert rules, folders, the datasource proxy).
 */
function fakeBackends(opts: FakeOpts = {}) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, url, body });
    const reply = (status: number, json?: unknown) => ({
      status,
      text: async () => (json === undefined ? '' : JSON.stringify(json)),
    });

    if (url.startsWith(SM_URL)) {
      expect(init.headers.Authorization).toBe(`Bearer ${SM_TOKEN}`);
      const { status, json } = handleSmCall(url.slice(SM_URL.length), init.method, body, opts);
      return reply(status, json);
    }
    if (url.startsWith(GRAFANA_URL)) {
      expect(init.headers.Authorization).toBe(`Bearer ${GRAFANA_TOKEN}`);
      const { status, json } = handleGrafanaCall(url.slice(GRAFANA_URL.length), init.method, opts);
      return reply(status, json);
    }
    throw new Error(`unexpected host: ${url}`);
  };
  return { calls, fetchImpl };
}

const env = {
  SM_API_URL: SM_URL,
  SM_ACCESS_TOKEN: SM_TOKEN,
  GRAFANA_URL,
  GRAFANA_SA_TOKEN: GRAFANA_TOKEN,
};
const quiet = () => {};

describe('synthetic monitoring config', () => {
  it('the committed config is valid', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
  });

  it('targets the production readiness endpoint on a 1-5 minute frequency', () => {
    expect(CONFIG.check.target).toBe('https://api-production-e9c1.up.railway.app/health/ready');
    expect(CONFIG.check.frequencySeconds).toBeGreaterThanOrEqual(60);
    expect(CONFIG.check.frequencySeconds).toBeLessThanOrEqual(300);
  });

  it('reports missing/bad check fields', () => {
    const bad = {
      check: { ...CONFIG.check, job: '', frequencySeconds: 30, probeNames: [] },
      alertRule: CONFIG.alertRule,
    };
    expect(validateConfig(bad)).toEqual([
      'check: missing job',
      'check: frequencySeconds must be between 60 and 300 (1-5 minutes)',
      'check: probeNames must be a non-empty array',
    ]);
  });

  it('reports a timeout that is not shorter than the frequency', () => {
    const bad = { check: { ...CONFIG.check, timeoutSeconds: 60 }, alertRule: CONFIG.alertRule };
    expect(validateConfig(bad)).toEqual([
      'check: timeoutSeconds must be less than frequencySeconds',
    ]);
  });

  it('reports missing/bad alert rule fields', () => {
    const bad = {
      check: CONFIG.check,
      alertRule: { ...CONFIG.alertRule, operator: 'eq', threshold: '1', summary: '' },
    };
    expect(validateConfig(bad)).toEqual([
      'ifc811-probe-success-down: operator must be gt or lt',
      'ifc811-probe-success-down: threshold must be a number',
      'ifc811-probe-success-down: missing summary',
    ]);
  });

  it('builds the SM check payload with resolved probe ids', () => {
    const payload = buildCheckPayload(CONFIG.check, [11, 12, 13]);
    expect(payload).toMatchObject({
      job: 'ifc-prod-health-ready',
      target: CONFIG.check.target,
      frequency: 60_000,
      timeout: 10_000,
      enabled: true,
      probes: [11, 12, 13],
      settings: { http: { method: 'GET', validStatusCodes: [200] } },
    });
  });

  it('builds a query -> reduce -> threshold alert rule in the shared production folder, its own rule group', () => {
    const rule = buildAlertRule(CONFIG.alertRule, CONFIG);
    expect(rule).toMatchObject({
      uid: 'ifc811-probe-success-down',
      folderUID: 'intelliflow-prod',
      ruleGroup: 'intelliflow-prod-synthetic',
      condition: 'C',
      noDataState: 'Alerting',
      for: '1m',
    });
    expect(rule.data[0].model.expr).toBe(CONFIG.alertRule.expr);
    expect(rule.data[2].model.conditions[0].evaluator).toEqual({ type: 'lt', params: [1] });
  });

  it('the workflow only applies on an explicit manual dispatch, never on push — issue #811: "prepare it, I\'ll switch it on"', () => {
    // GRAFANA_SA_TOKEN (Admin-role, provisioning-capable) already exists as a
    // Production environment secret, added for IFC-032 (#804) before this PR.
    // The only thing standing between "prepare" and "switch on" is whether
    // this workflow can run unattended. A `push: branches: [main]` trigger on
    // these exact paths means the moment the owner later adds SM_ACCESS_TOKEN
    // + SM_API_URL (the one step #811 leaves him), the very next merge that
    // touches the config, the script, or this workflow file — not
    // necessarily one where he means to flip the switch — auto-applies the
    // check and alert rule with no further action. Only `workflow_dispatch`
    // keeps "switch on" a deliberate act, independent of what secrets exist.
    const workflow = yaml.load(
      readFileSync(join(__dirname, '../../../.github/workflows/synthetic-monitoring.yml'), 'utf8')
    ) as { on?: Record<string, unknown> };
    expect(Object.keys(workflow.on ?? {})).toEqual(['workflow_dispatch']);
  });

  it("never shares a rule group name with alert-rules.json, so that script's folder/rule-group PUT can never wipe this rule", () => {
    // apply-grafana-alert-rules.mjs replaces its ENTIRE named group's rule
    // list on every run (PUT /api/v1/provisioning/folder/{uid}/rule-groups/{name}),
    // built only from its own config.rules. If this config named the same
    // group, that run — triggered by any push to alert-rules.json, or by
    // hand via workflow_dispatch — would silently delete ifc811-probe-success-down
    // with no error and no scheduled job to recreate it. The folder may
    // still be shared; the rule group name must not be.
    const alertRulesConfig = JSON.parse(
      readFileSync(
        join(__dirname, '../../../infra/monitoring/grafana/cloud/alert-rules.json'),
        'utf8'
      )
    );
    expect(CONFIG.group.name).not.toBe(alertRulesConfig.group.name);
  });
});

describe('run', () => {
  it('refuses to start without the SM URL and token', async () => {
    await expect(
      run({ env: { GRAFANA_URL, GRAFANA_SA_TOKEN: GRAFANA_TOKEN }, argv: [], log: quiet })
    ).rejects.toThrow('SM_API_URL and SM_ACCESS_TOKEN');
  });

  it('refuses to start without the Grafana URL and token', async () => {
    await expect(
      run({ env: { SM_API_URL: SM_URL, SM_ACCESS_TOKEN: SM_TOKEN }, argv: [], log: quiet })
    ).rejects.toThrow('GRAFANA_URL and GRAFANA_SA_TOKEN');
  });

  it('fails loudly when a configured probe name does not exist on the stack', async () => {
    const b = fakeBackends({ probes: [{ id: 11, name: 'London', public: true }] });
    await expect(run({ env, argv: [], fetchImpl: b.fetchImpl, log: quiet })).rejects.toThrow(
      'unknown probe name(s): Amsterdam, Frankfurt'
    );
  });

  it('dry run resolves probes and writes nothing to either API', async () => {
    const b = fakeBackends();
    const result = await run({ env, argv: ['--dry-run'], fetchImpl: b.fetchImpl, log: quiet });
    expect(result.probeIds).toEqual([11, 12, 13]);
    expect(b.calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('creates a brand-new check and alert rule, and never replaces the shared rule group', async () => {
    const b = fakeBackends();
    const result = await run({ env, argv: [], fetchImpl: b.fetchImpl, log: quiet });
    expect(result.check).toBe('created');
    expect(result.alertRule).toBe('created');
    expect(result.seriesChecked).toBe(false);
    const writes = b.calls.filter((c) => c.method !== 'GET').map((c) => c.url);
    expect(writes.some((u) => u.endsWith('/api/v1/check/add'))).toBe(true);
    expect(writes.some((u) => u.endsWith('/api/v1/provisioning/alert-rules'))).toBe(true);
    expect(writes.some((u) => u.includes('/api/v1/provisioning/folder/'))).toBe(false);
  });

  it('updates an existing check and alert rule, and checks the alert actually has live series', async () => {
    const b = fakeBackends({ existingCheckJob: CONFIG.check.job, existingAlertRule: true });
    const result = await run({ env, argv: [], fetchImpl: b.fetchImpl, log: quiet });
    expect(result.check).toBe('updated');
    expect(result.alertRule).toBe('updated');
    expect(result.seriesChecked).toBe(true);
    expect(result.empty).toEqual([]);
    const writes = b.calls.filter((c) => c.method !== 'GET').map((c) => c.url);
    expect(writes.some((u) => u.endsWith('/api/v1/check/update'))).toBe(true);
    expect(
      writes.some((u) => u.endsWith(`/api/v1/provisioning/alert-rules/ifc811-probe-success-down`))
    ).toBe(true);
  });

  it('fails loudly when an already-running check has no live probe_success series', async () => {
    const b = fakeBackends({
      existingCheckJob: CONFIG.check.job,
      existingAlertRule: true,
      series: () => 0,
    });
    await expect(run({ env, argv: [], fetchImpl: b.fetchImpl, log: quiet })).rejects.toThrow(
      'no live series (check that the probe is running): ifc811-probe-success-down'
    );
  });

  it('never logs either token', async () => {
    const lines: string[] = [];
    const b = fakeBackends();
    await run({ env, argv: [], fetchImpl: b.fetchImpl, log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).not.toContain(SM_TOKEN);
    expect(lines.join('\n')).not.toContain(GRAFANA_TOKEN);
  });
});
