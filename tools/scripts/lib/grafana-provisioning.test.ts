import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAlertRulePayload,
  createApiClient,
  createGrafanaClient,
  DATASOURCE_KINDS,
  loadValidConfig,
  queryLokiSeriesCount,
  querySeriesCount,
  redactBody,
  requireEnv,
  RETRY_DELAYS_MS,
} from './grafana-provisioning.mjs';

const TOKEN = 'z'.repeat(24);
const BASE_URL = 'https://stack.example.invalid';

/** A fetch that answers with the given statuses in order, recording each call. */
function scriptedFetch(statuses: number[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return { status, text: async () => JSON.stringify({ status }) };
  };
  return { calls, fetchImpl };
}

describe('createApiClient retry on 503 (the Grafana Cloud instance waking up)', () => {
  it('retries a 503 and returns the 200 that follows, sleeping the first delay once', async () => {
    const { calls, fetchImpl } = scriptedFetch([503, 200]);
    const sleeps: number[] = [];
    const api = createApiClient(BASE_URL, TOKEN, fetchImpl, {
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    const res = await api('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([RETRY_DELAYS_MS[0]]);
  });

  it('makes 8 attempts on a persistent 503, sleeping every delay, and returns the last 503', async () => {
    const { calls, fetchImpl } = scriptedFetch([503]);
    const sleeps: number[] = [];
    const api = createApiClient(BASE_URL, TOKEN, fetchImpl, {
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    const res = await api('GET', '/api/health');
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(8);
    expect(RETRY_DELAYS_MS).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
    expect(sleeps).toEqual(RETRY_DELAYS_MS);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(255000);
  });

  it.each([500, 401, 404])('does not retry a %i', async (status) => {
    const { calls, fetchImpl } = scriptedFetch([status, 200]);
    const sleeps: number[] = [];
    const api = createApiClient(BASE_URL, TOKEN, fetchImpl, {
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    const res = await api('GET', '/api/x');
    expect(res.status).toBe(status);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('turns the 503 into a series-check error once the retries are used up', async () => {
    const { fetchImpl } = scriptedFetch([503]);
    const api = createApiClient(BASE_URL, TOKEN, fetchImpl, { sleep: async () => {} });
    await expect(querySeriesCount(api, 'ds', 'up')).rejects.toThrow(
      'series check for up: HTTP 503'
    );
  });

  it('uses a real timer as the default sleep', async () => {
    vi.useFakeTimers();
    try {
      const { calls, fetchImpl } = scriptedFetch([503, 200]);
      const pending = createApiClient(BASE_URL, TOKEN, fetchImpl)('GET', '/api/x');
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect((await pending).status).toBe(200);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('requireEnv', () => {
  it('names every required variable when one is missing or empty', () => {
    expect(() => requireEnv({ A: 'x', B: '' }, ['A', 'B'])).toThrow('A and B are required');
    expect(() => requireEnv({}, ['A'])).toThrow('A are required');
  });

  it('passes when every variable is set', () => {
    expect(() => requireEnv({ A: 'x', B: 'y' }, ['A', 'B'])).not.toThrow();
  });
});

describe('loadValidConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grafana-config-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the parsed config when the validator finds no problem', () => {
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify({ uid: 'a' }));
    const validate = vi.fn(() => []);
    expect(loadValidConfig(path, validate, 'thing')).toEqual({ uid: 'a' });
    expect(validate).toHaveBeenCalledWith({ uid: 'a' });
  });

  it('throws "<label> invalid:" with one problem per line', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{}');
    expect(() => loadValidConfig(path, () => ['x: required', 'y: required'], 'SLO file')).toThrow(
      'SLO file invalid:\n  x: required\n  y: required'
    );
  });
});

describe('createGrafanaClient', () => {
  it('refuses to start without GRAFANA_URL and GRAFANA_SA_TOKEN, before any request', () => {
    const fetchImpl = vi.fn();
    expect(() => createGrafanaClient({ GRAFANA_URL: BASE_URL }, fetchImpl, vi.fn())).toThrow(
      'GRAFANA_URL and GRAFANA_SA_TOKEN are required'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('talks to GRAFANA_URL with the service-account token and the given sleep', async () => {
    const { calls, fetchImpl } = scriptedFetch([503, 200]);
    const sleep = vi.fn(async () => {});
    const api = createGrafanaClient(
      { GRAFANA_URL: BASE_URL, GRAFANA_SA_TOKEN: TOKEN },
      fetchImpl as unknown as typeof fetch,
      sleep
    );
    const res = await api('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(calls).toEqual([`${BASE_URL}/api/health`, `${BASE_URL}/api/health`]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('redactBody', () => {
  const bearer = 'Bear' + 'er ' + 'q'.repeat(20);
  const glsa = 'gl' + 'sa_' + 'x'.repeat(32);
  const longRun = 'A1b2-_'.repeat(6);

  it('redacts a bearer header, a Grafana service-account token and long base64 runs', () => {
    const out = redactBody(`denied: ${bearer} / ${glsa} / ${longRun} end`);
    expect(out).not.toContain('q'.repeat(20));
    expect(out).not.toContain(glsa);
    expect(out).not.toContain(longRun);
    expect(out).toContain('<redacted>');
    expect(out.startsWith('denied: ')).toBe(true);
    expect(out.endsWith(' end')).toBe(true);
  });

  it('redacts a Basic credential and a short prefixed token (STOA-security review)', () => {
    const basic = 'Bas' + 'ic ' + 'dXNlcjpwYXNz';
    const prefixed = ['sk', 'live', 'Ab12Cd34Ef56Gh78'].join('_');
    const out = redactBody(`no: ${basic} and ${prefixed}`);
    expect(out).not.toContain('dXNlcjpwYXNz');
    expect(out).not.toContain(prefixed);
    expect(out).toBe('no: <redacted> and <redacted>');
  });

  it('keeps short ordinary text as it is', () => {
    expect(redactBody('{"message":"bad request"}')).toBe('{"message":"bad request"}');
  });

  it('truncates to 200 characters with a marker', () => {
    const out = redactBody('word '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(200 + '…[truncated]'.length);
    expect(out.endsWith('…[truncated]')).toBe(true);
  });

  it('returns an empty string for undefined and null', () => {
    expect(redactBody(undefined)).toBe('');
    expect(redactBody(null)).toBe('');
  });
});

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

  it('looks back over the range it is given', async () => {
    const paths: string[] = [];
    const api = async (_method: string, path: string) => {
      paths.push(path);
      return { status: 200, json: { data: { result: [{ value: [0, '1'] }] } } };
    };
    await querySeriesCount(api, 'ds', 'up', '7d');
    expect(paths[0]).toContain(encodeURIComponent('count(last_over_time(up[7d]))'));
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

describe('queryLokiSeriesCount', () => {
  const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
  const SELECTOR = '{service_name=~"ai-worker|api"}';

  it('lists the streams a selector matches over the lookback via the Loki series route', async () => {
    const calls: string[] = [];
    const api = async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      return { status: 200, json: { status: 'success', data: [{ a: '1' }, { a: '2' }] } };
    };
    const n = await queryLokiSeriesCount(api, 'grafanacloud-logs', SELECTOR, 7 * 86400, NOW);
    expect(n).toBe(2);
    const end = NOW / 1000;
    expect(calls).toEqual([
      'GET /api/datasources/proxy/uid/grafanacloud-logs/loki/api/v1/series?' +
        `match%5B%5D=${encodeURIComponent(SELECTOR)}&start=${end - 7 * 86400}&end=${end}`,
    ]);
  });

  it('returns 0 when no stream matches', async () => {
    const api = async () => ({ status: 200, json: { status: 'success', data: [] } });
    expect(await queryLokiSeriesCount(api, 'ds', SELECTOR, 3600, NOW)).toBe(0);
  });

  it('throws on a non-200 response', async () => {
    const api = async () => ({ status: 502, json: undefined });
    await expect(queryLokiSeriesCount(api, 'ds', SELECTOR, 3600, NOW)).rejects.toThrow(
      `series check for ${SELECTOR}: HTTP 502`
    );
  });
});

describe('DATASOURCE_KINDS', () => {
  it('knows the Grafana Cloud metrics and logs datasources', () => {
    expect(DATASOURCE_KINDS).toEqual({
      'grafanacloud-prom': 'prometheus',
      'grafanacloud-logs': 'loki',
    });
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

  it('a rule on the logs datasource queries Loki as an instant query', () => {
    const rule = buildAlertRulePayload(
      { ...entry, datasourceUid: 'grafanacloud-logs' },
      { ...config, datasourceUid: 'grafanacloud-prom' },
      'x'
    );
    expect(rule.data[0].datasourceUid).toBe('grafanacloud-logs');
    expect(rule.data[0].model).toMatchObject({ expr: 'up == 0', queryType: 'instant' });
    expect(rule.data[0].model).not.toHaveProperty('instant');
  });

  it('a rule without its own datasourceUid keeps the config datasource and the Prometheus shape', () => {
    const rule = buildAlertRulePayload(
      entry,
      { ...config, datasourceUid: 'grafanacloud-prom' },
      'x'
    );
    expect(rule.data[0].datasourceUid).toBe('grafanacloud-prom');
    expect(rule.data[0].model).toMatchObject({ instant: true });
    expect(rule.data[0].model).not.toHaveProperty('queryType');
  });

  it('gives the two callers distinct source labels from the same shape', () => {
    const a = buildAlertRulePayload(entry, config, 'ifc-032');
    const b = buildAlertRulePayload(entry, config, 'ifc-811');
    expect(a.labels.source).toBe('ifc-032');
    expect(b.labels.source).toBe('ifc-811');
    expect({ ...a, labels: undefined }).toEqual({ ...b, labels: undefined });
  });
});
