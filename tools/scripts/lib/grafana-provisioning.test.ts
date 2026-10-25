import { describe, expect, it } from 'vitest';
import {
  buildAlertRulePayload,
  createApiClient,
  querySeriesCount,
} from './grafana-provisioning.mjs';

const TOKEN = 'z'.repeat(24);
const BASE_URL = 'https://stack.example.invalid';

describe('createApiClient', () => {
  it('sends a bearer token, JSON content-type and the no-provenance header', async () => {
    const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
    const fetchImpl = async (url: string, init: Record<string, unknown>) => {
      calls.push({ url, init });
      return { status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const api = createApiClient(BASE_URL, TOKEN, fetchImpl);
    const res = await api('POST', '/api/thing', { a: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE_URL}/api/thing`);
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Disable-Provenance': 'true',
      },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res).toEqual({ status: 200, json: { ok: true }, text: JSON.stringify({ ok: true }) });
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe(`${BASE_URL}/api/x`);
      return { status: 200, text: async () => '' };
    };
    await createApiClient(`${BASE_URL}/`, TOKEN, fetchImpl)('GET', '/api/x');
  });

  it('sends no body and parses a non-JSON response as undefined json', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = async (_url: string, init: Record<string, unknown>) => {
      calls.push(init);
      return { status: 204, text: async () => '' };
    };
    const res = await createApiClient(BASE_URL, TOKEN, fetchImpl)('DELETE', '/api/thing');
    expect(calls[0].body).toBeUndefined();
    expect(res).toEqual({ status: 204, json: undefined, text: '' });
  });

  it('defaults to the global fetch when no fetchImpl is given', () => {
    // Just proves the default parameter doesn't throw at call time; the
    // actual network call is never exercised by any test.
    expect(() => createApiClient(BASE_URL, TOKEN)).not.toThrow();
  });
});

describe('querySeriesCount', () => {
  it('queries count(last_over_time(...)) over the last hour via the datasource proxy', async () => {
    const calls: string[] = [];
    const api = async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      return { status: 200, json: { data: { result: [{ value: [0, '7'] }] } } };
    };
    const n = await querySeriesCount(api, 'grafanacloud-prom', 'probe_success{job="x"}');
    expect(n).toBe(7);
    expect(calls).toEqual([
      'GET /api/datasources/proxy/uid/grafanacloud-prom/api/v1/query?' +
        'query=' +
        encodeURIComponent('count(last_over_time(probe_success{job="x"}[1h]))'),
    ]);
  });

  it('returns 0 when the query has no result', async () => {
    const api = async () => ({ status: 200, json: { data: { result: [] } } });
    expect(await querySeriesCount(api, 'ds', 'up')).toBe(0);
  });

  it('throws on a non-200 response', async () => {
    const api = async () => ({ status: 500, json: undefined });
    await expect(querySeriesCount(api, 'ds', 'up')).rejects.toThrow(
      'series check for up: HTTP 500'
    );
  });
});

describe('buildAlertRulePayload', () => {
  const entry = {
    uid: 'r-1',
    title: 'Rule one',
    expr: 'up == 0',
    operator: 'lt' as const,
    threshold: 1,
    for: '5m',
    noData: 'Alerting' as const,
    severity: 'critical',
    summary: 'down',
  };
  const config = { folder: { uid: 'f-1' }, group: { name: 'g-1' }, datasourceUid: 'ds-1' };

  it('builds the query -> reduce -> threshold shape with the given source label', () => {
    const rule = buildAlertRulePayload(entry, config, 'ifc-811');
    expect(rule).toMatchObject({
      uid: 'r-1',
      title: 'Rule one',
      folderUID: 'f-1',
      ruleGroup: 'g-1',
      condition: 'C',
      noDataState: 'Alerting',
      execErrState: 'Error',
      for: '5m',
      isPaused: false,
      labels: { severity: 'critical', team: 'owner', source: 'ifc-811' },
      annotations: { summary: 'down' },
    });
    expect(rule.data).toHaveLength(3);
    expect(rule.data[0]).toMatchObject({
      refId: 'A',
      datasourceUid: 'ds-1',
      model: { expr: 'up == 0', instant: true },
    });
    expect(rule.data[2].model.conditions).toEqual([{ evaluator: { type: 'lt', params: [1] } }]);
  });

  it('evaluates the query at "now" unless the entry sets queryOffsetSeconds', () => {
    expect(buildAlertRulePayload(entry, config, 'x').data[0].relativeTimeRange).toEqual({
      from: 900,
      to: 0,
    });
    const late = buildAlertRulePayload({ ...entry, queryOffsetSeconds: 60 }, config, 'x');
    expect(late.data[0].relativeTimeRange).toEqual({ from: 900, to: 60 });
  });

  it('gives the two callers distinct source labels from the same shape', () => {
    const a = buildAlertRulePayload(entry, config, 'ifc-032');
    const b = buildAlertRulePayload(entry, config, 'ifc-811');
    expect(a.labels.source).toBe('ifc-032');
    expect(b.labels.source).toBe('ifc-811');
    expect({ ...a, labels: undefined }).toEqual({ ...b, labels: undefined });
  });
});
