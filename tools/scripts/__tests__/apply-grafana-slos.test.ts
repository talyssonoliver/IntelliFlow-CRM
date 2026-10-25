import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../observability/apply-grafana-slos.mjs';

// ENV-008-AI AC-002..AC-004: production SLOs as code, applied by
// .github/workflows/grafana-slos.yml. Targets come from
// docs/operations/slo-definitions.md and must not be tuned to pass.
const CONFIG = JSON.parse(
  readFileSync(join(__dirname, '../../../infra/monitoring/grafana/cloud/slos.json'), 'utf8')
);
const TOKEN = 'x'.repeat(24);
const BASE = 'https://stack.example.invalid';
const SLO_API = '/api/plugins/grafana-slo-app/resources/v1/slo';
const HEALTH_EXCLUSION = 'span_name!~"(GET|HEAD) (/api)?/health(/.*)?"';

type Slo = (typeof CONFIG.slos)[number];
const byUuid = (uuid: string): Slo => CONFIG.slos.find((s: Slo) => s.uuid === uuid);

/** Every PromQL string an SLO carries, whatever its query type. */
function queriesOf(slo: Slo): string[] {
  if (slo.query.type === 'freeform') return [slo.query.freeform.query];
  return [
    slo.query.ratio.successMetric.prometheusMetric,
    slo.query.ratio.totalMetric.prometheusMetric,
  ];
}

type Call = { method: string; path: string; body?: Record<string, unknown> };

/** Fake Grafana SLO plugin API: `existing` uuids answer 200 on GET, the rest 404. */
function fakeSloApi(
  opts: { existing?: string[]; writeStatus?: number; writeBody?: string; assignUuid?: string } = {}
) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    const path = url.replace(BASE, '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    if (init.method === 'GET') {
      const uuid = path.slice(`${SLO_API}/`.length);
      const found = opts.existing?.includes(uuid);
      return { status: found ? 200 : 404, text: async () => (found ? '{"uuid":"x"}' : '') };
    }
    const status = opts.writeStatus ?? (init.method === 'POST' ? 202 : 200);
    // A create answers with the uuid the SLO was stored under.
    const sent = init.body ? (JSON.parse(init.body) as { uuid?: string }).uuid : undefined;
    const stored = opts.assignUuid ?? sent;
    const reply =
      init.method === 'POST' ? JSON.stringify({ uuid: stored, message: 'ok' }) : '{"message":"ok"}';
    return { status, text: async () => opts.writeBody ?? reply };
  };
  return { calls, fetchImpl };
}

const env = { GRAFANA_URL: BASE, GRAFANA_SA_TOKEN: TOKEN };
const quiet = () => {};
const noSleep = async () => {};

describe('slos.json', () => {
  it('is valid', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
    expect(CONFIG.folderUid).toBe('intelliflow-prod');
    expect(CONFIG.destinationDatasourceUid).toBe('grafanacloud-prom');
  });

  it('defines exactly the three documented SLOs with their documented objectives', () => {
    expect(
      CONFIG.slos.map((s: Slo) => [s.uuid, s.objectives[0].value, s.objectives[0].window])
    ).toEqual([
      ['env008-api-availability', 0.999, '28d'],
      ['env008-api-latency', 0.95, '28d'],
      ['env008-ai-worker-llm-success', 0.995, '28d'],
    ]);
  });

  it('labels every SLO with its source and owner', () => {
    expect(CONFIG.slos).toHaveLength(3);
    for (const slo of CONFIG.slos) {
      expect(slo.labels).toEqual(
        expect.arrayContaining([
          { key: 'source', value: 'env-008-ai' },
          { key: 'team', value: 'owner' },
        ])
      );
    }
  });

  it('uses ratio queries for availability and LLM success, and a native-histogram freeform query for latency', () => {
    expect(byUuid('env008-api-availability').query.type).toBe('ratio');
    expect(byUuid('env008-ai-worker-llm-success').query.type).toBe('ratio');
    const latency = byUuid('env008-api-latency');
    expect(latency.query.type).toBe('freeform');
    expect(latency.query.freeform.query).toContain('histogram_fraction(0, 0.2,');
    expect(latency.query.freeform.query).toContain('[$__rate_interval]');
  });

  it('excludes health probes from every api query and counts server spans only', () => {
    const apiSlos = CONFIG.slos.filter((s: Slo) => s.uuid.startsWith('env008-api-'));
    expect(apiSlos).toHaveLength(2);
    for (const slo of apiSlos) {
      for (const q of queriesOf(slo)) {
        expect(q).toContain('service="api"');
        expect(q).toContain(HEALTH_EXCLUSION);
        expect(q).toContain('span_kind="SPAN_KIND_SERVER"');
      }
    }
  });

  it('counts llm.invoke spans of ai-worker for LLM success', () => {
    const queries = queriesOf(byUuid('env008-ai-worker-llm-success'));
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q).toContain('service="ai-worker"');
      expect(q).toContain('span_name="llm.invoke"');
    }
  });

  it('states in each description what its SLI does not count (AC-002)', () => {
    const availability = byUuid('env008-api-availability').description;
    expect(availability).toMatch(/tRPC/);
    expect(availability).toMatch(/200 or 4xx/);
    expect(availability).toMatch(/30 s/);
    expect(byUuid('env008-ai-worker-llm-success').description).toMatch(/low call volume/i);
  });

  it('alerts on availability burn only; latency and LLM each name their own issue (AC-004)', () => {
    const availability = byUuid('env008-api-availability');
    // Grafana derives the burn-rate windows itself; the committed blocks carry
    // the severity that routes them and a summary, so neither may be empty.
    expect(availability.alerting.fastBurn.labels).toEqual([{ key: 'severity', value: 'critical' }]);
    expect(availability.alerting.slowBurn.labels).toEqual([{ key: 'severity', value: 'warning' }]);
    for (const burn of [availability.alerting.fastBurn, availability.alerting.slowBurn]) {
      expect(burn.annotations).toEqual([
        { key: 'summary', value: expect.stringMatching(/budget/) },
      ]);
    }
    const issues = ['env008-api-latency', 'env008-ai-worker-llm-success'].map((uuid) => {
      const slo = byUuid(uuid);
      expect(slo.alerting).toBeUndefined();
      const match = /#(\d+)/.exec(slo.description);
      expect(match, `${uuid} names no issue`).not.toBeNull();
      return match?.[1];
    });
    expect(issues[0]).not.toBe(issues[1]);
  });
});

describe('validateConfig', () => {
  const clone = (): typeof CONFIG => JSON.parse(JSON.stringify(CONFIG));

  it('rejects a classic-histogram _bucket series (production has native histograms only)', () => {
    const bad = clone();
    bad.slos[1].query.freeform.query =
      'sum(rate(traces_spanmetrics_latency_bucket[$__rate_interval]))';
    expect(validateConfig(bad)).toEqual([expect.stringContaining('_bucket')]);
  });

  it('rejects a fixed range instead of [$__rate_interval]', () => {
    const bad = clone();
    bad.slos[1].query.freeform.query = bad.slos[1].query.freeform.query.replace(
      '[$__rate_interval]',
      '[5m]'
    );
    expect(validateConfig(bad)).toEqual([expect.stringContaining('$__rate_interval')]);
  });

  it('rejects a query type other than ratio or freeform', () => {
    const bad = clone();
    bad.slos[0].query = { type: 'threshold' };
    expect(validateConfig(bad)).toEqual([
      expect.stringContaining('query.type must be ratio or freeform'),
    ]);
  });

  it('rejects an empty ratio metric', () => {
    const bad = clone();
    bad.slos[0].query.ratio.totalMetric.prometheusMetric = '';
    expect(validateConfig(bad)).toEqual([expect.stringContaining('empty query')]);
  });

  it('rejects a config without its folder, datasource or any SLO', () => {
    expect(
      validateConfig({ ...clone(), folderUid: '', destinationDatasourceUid: undefined })
    ).toEqual([
      expect.stringContaining('folderUid'),
      expect.stringContaining('destinationDatasourceUid'),
    ]);
    expect(validateConfig({ ...clone(), slos: [] })).toEqual([
      expect.stringContaining('at least one SLO'),
    ]);
  });

  it('rejects a duplicate uuid', () => {
    const bad = clone();
    bad.slos[2].uuid = bad.slos[0].uuid;
    expect(validateConfig(bad)).toEqual([expect.stringContaining('duplicate uuid')]);
  });

  it.each(['uuid', 'name', 'description', 'query', 'objectives'])(
    'rejects an SLO without %s',
    (key) => {
      const bad = clone();
      delete bad.slos[0][key];
      expect(validateConfig(bad)).toEqual(
        expect.arrayContaining([expect.stringContaining(`missing ${key}`)])
      );
    }
  );

  it('rejects a uuid that would break out of its URL path segment', () => {
    const bad = clone();
    bad.slos[0].uuid = 'a/../b';
    expect(validateConfig(bad)).toEqual([expect.stringContaining('a/../b')]);
  });
});

describe('run', () => {
  it('refuses to start without the URL and token, before any request', async () => {
    const api = fakeSloApi();
    await expect(run({ env: {}, argv: [], fetchImpl: api.fetchImpl, log: quiet })).rejects.toThrow(
      'GRAFANA_URL and GRAFANA_SA_TOKEN are required'
    );
    expect(api.calls).toEqual([]);
  });

  it('dry run only reads', async () => {
    const api = fakeSloApi({ existing: ['env008-api-latency'] });
    const result = await run({
      env,
      argv: ['--dry-run'],
      fetchImpl: api.fetchImpl,
      log: quiet,
      sleep: noSleep,
    });
    expect(api.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'GET']);
    expect(result).toEqual({ created: 0, updated: 0, dryRun: true });
  });

  it('creates a missing SLO by POST with its uuid, and updates an existing one by PUT', async () => {
    const api = fakeSloApi({ existing: ['env008-api-latency'] });
    const result = await run({
      env,
      argv: [],
      fetchImpl: api.fetchImpl,
      log: quiet,
      sleep: noSleep,
    });
    const writes = api.calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual([
      `POST ${SLO_API}`,
      `PUT ${SLO_API}/env008-api-latency`,
      `POST ${SLO_API}`,
    ]);
    expect(writes[0].body).toMatchObject({
      uuid: 'env008-api-availability',
      folder: { uid: 'intelliflow-prod' },
      destinationDatasource: { uid: 'grafanacloud-prom' },
    });
    expect(result).toEqual({ created: 2, updated: 1, dryRun: false });
  });

  it('fails when Grafana stores a created SLO under a different uuid (no silent duplicates)', async () => {
    const api = fakeSloApi({ assignUuid: 'generated-elsewhere' });
    await expect(
      run({ env, argv: [], fetchImpl: api.fetchImpl, log: quiet, sleep: noSleep })
    ).rejects.toThrow('env008-api-availability: created under uuid generated-elsewhere');
  });

  it('throws a redacted error when a write is rejected', async () => {
    const leaked = 'gl' + 'sa_' + 'p'.repeat(32);
    const api = fakeSloApi({ writeStatus: 400, writeBody: `{"message":"invalid ${leaked}"}` });
    const err = await run({
      env,
      argv: [],
      fetchImpl: api.fetchImpl,
      log: quiet,
      sleep: noSleep,
    }).catch((e: Error) => e);
    expect((err as Error).message).toContain('env008-api-availability: HTTP 400');
    expect((err as Error).message).not.toContain(leaked);
  });

  it('throws when a read answers something other than 200 or 404', async () => {
    const api = fakeSloApi();
    const fetchImpl: typeof api.fetchImpl = async () => ({ status: 403, text: async () => '' });
    await expect(run({ env, argv: [], fetchImpl, log: quiet, sleep: noSleep })).rejects.toThrow(
      'read env008-api-availability: HTTP 403'
    );
  });

  it('retries a 503 through the injected sleep', async () => {
    const api = fakeSloApi();
    let first = true;
    const sleeps: number[] = [];
    const fetchImpl: typeof api.fetchImpl = async (url, init) => {
      if (first) {
        first = false;
        return { status: 503, text: async () => '' };
      }
      return api.fetchImpl(url, init);
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
    const api = fakeSloApi();
    await run({
      env,
      argv: [],
      fetchImpl: api.fetchImpl,
      log: (l: string) => lines.push(l),
      sleep: noSleep,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(TOKEN);
  });
});
