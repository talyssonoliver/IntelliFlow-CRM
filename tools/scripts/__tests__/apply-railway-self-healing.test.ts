import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aiWorkerHealthcheck,
  combinedWorkerHealthcheck,
  DESIRED,
  diffFields,
  EXPECTED_API_HOST,
  probeTarget,
  run,
} from '../observability/apply-railway-self-healing.mjs';

// ENV-008-AI AC-007 (owner ruling 2: set by CI on merge) plus the lane-lead
// guard of 2026-10-25 (plan r5/A1): the api health check is only set after the
// live api answers 200 on /api/health/live. The #1045 review bound that probe
// to the api's own Railway host and added combined-worker (the 2026-10-25
// cutover); the stopped ai-worker, events-worker and ingestion-worker services
// never fail the run.

const GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const API_URL = `https://${EXPECTED_API_HOST}`;
const PROBE_URL = `${API_URL}/api/health/live`;
// IDs and the token are built at runtime so nothing secret- or ID-shaped is
// committed, and so the tests can prove none of them reaches the log.
const TOKEN = ['rw', 'tok', 'e'.repeat(28)].join('-');
const PROJECT_ID = randomUUID();
const ENV_ID = randomUUID();
const API_ID = randomUUID();
const WORKER_ID = randomUUID();
const COMBINED_ID = randomUUID();

type Fields = {
  restartPolicyType: string | null;
  restartPolicyMaxRetries: number | null;
  healthcheckPath: string | null;
  healthcheckTimeout: number | null;
};
const EMPTY: Fields = {
  restartPolicyType: 'ALWAYS',
  restartPolicyMaxRetries: null,
  healthcheckPath: null,
  healthcheckTimeout: null,
};

type ProbeBehaviour =
  | { status: number }
  | { throws: 'network' | 'timeout' }
  | ((url: string, init: Record<string, unknown>) => Promise<{ status: number }>);

type FakeOpts = {
  instances?: Partial<Record<'api' | 'ai-worker' | 'combined-worker', Partial<Fields>>>;
  variables?: Record<string, string> | null | 'denied';
  services?: string[];
  environments?: string[];
  probe?: ProbeBehaviour;
  ignoreWrites?: boolean;
  graphqlError?: { op: string; message: string; code: string };
};

type GraphqlCall = {
  op: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
};
type ProbeCall = { url: string; init: Record<string, unknown> };

type Reply = { status: number; text: () => Promise<string> };
const reply = (body: unknown): Reply => ({ status: 200, text: async () => JSON.stringify(body) });

/** The live api health endpoint, answering as `behaviour` says. */
async function fakeProbe(
  behaviour: ProbeBehaviour,
  url: string,
  init: Record<string, unknown>
): Promise<{ status: number }> {
  if (typeof behaviour === 'function') return behaviour(url, init);
  if ('status' in behaviour) return { status: behaviour.status };
  if (behaviour.throws === 'timeout') {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  }
  throw new Error(`fetch failed: getaddrinfo ENOTFOUND ${EXPECTED_API_HOST}`);
}

function projectReply(opts: FakeOpts, ids: Record<string, string>): Reply {
  const services = (
    opts.services ?? [
      'api',
      'combined-worker',
      'ai-worker',
      'events-worker',
      'ingestion-worker',
      'ws',
    ]
  ).map((name) => ({
    node: { id: ids[name] ?? randomUUID(), name },
  }));
  const environments = (opts.environments ?? ['production', 'staging']).map((name) => ({
    node: { id: name === 'production' ? ENV_ID : randomUUID(), name },
  }));
  return reply({
    data: { project: { environments: { edges: environments }, services: { edges: services } } },
  });
}

function variablesReply(opts: FakeOpts): Reply {
  if (opts.variables === 'denied') {
    return reply({ errors: [{ message: 'Not Authorized', extensions: { code: 'FORBIDDEN' } }] });
  }
  if (opts.variables === null) return reply({ data: { variables: null } });
  const dbUrl = ['post', 'gres://', 'u', ':', 'p'.repeat(12), '@db.example.invalid/x'].join('');
  return reply({
    data: { variables: { DATABASE_URL: dbUrl, ...(opts.variables ?? { PORT: '5000' }) } },
  });
}

/** Fake Railway GraphQL API plus the live api health endpoint, routed by URL. */
function fakeRailway(opts: FakeOpts = {}) {
  const ids: Record<string, string> = {
    api: API_ID,
    'ai-worker': WORKER_ID,
    'combined-worker': COMBINED_ID,
  };
  const state: Record<string, Fields> = {
    [API_ID]: { ...EMPTY, ...opts.instances?.api },
    [WORKER_ID]: { ...EMPTY, ...opts.instances?.['ai-worker'] },
    [COMBINED_ID]: { ...EMPTY, ...opts.instances?.['combined-worker'] },
  };
  const graphql: GraphqlCall[] = [];
  const probes: ProbeCall[] = [];

  const handlers: Record<string, (vars: Record<string, unknown>) => Reply> = {
    project: () => projectReply(opts, ids),
    serviceInstance: (vars) =>
      reply({ data: { serviceInstance: { ...state[vars.serviceId as string] } } }),
    variables: () => variablesReply(opts),
    serviceInstanceUpdate: (vars) => {
      if (!opts.ignoreWrites) Object.assign(state[vars.serviceId as string], vars.input);
      return reply({ data: { serviceInstanceUpdate: true } });
    },
  };

  const fetchImpl = async (url: string, init: Record<string, unknown>) => {
    if (url !== GRAPHQL) {
      probes.push({ url, init });
      const { status } = await fakeProbe(opts.probe ?? { status: 200 }, url, init);
      return { status, text: async () => '' };
    }
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const op = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? '?';
    graphql.push({ op, variables: body.variables, headers });
    if (opts.graphqlError?.op === op) {
      const { message, code } = opts.graphqlError;
      return reply({ errors: [{ message, extensions: { code } }] });
    }
    const handler = handlers[op];
    if (!handler) throw new Error(`unexpected GraphQL operation ${op}`);
    if (op !== 'project' && !Object.values(ids).includes(body.variables.serviceId as string)) {
      throw new Error('a stopped or unmanaged service was touched');
    }
    return handler(body.variables);
  };
  const mutations = () => graphql.filter((c) => c.op === 'serviceInstanceUpdate');
  const inputFor = (id: string) =>
    mutations().find((c) => c.variables.serviceId === id)?.variables.input as
      | Record<string, unknown>
      | undefined;
  return { fetchImpl, graphql, probes, state, mutations, inputFor };
}

const env = {
  RAILWAY_API_TOKEN: TOKEN,
  RAILWAY_PROJECT_ID: PROJECT_ID,
  PRODUCTION_API_URL: API_URL,
};

function capture() {
  const lines: string[] = [];
  const summaries: string[] = [];
  return {
    lines,
    summaries,
    log: (l: string) => lines.push(l),
    writeSummary: (s: string) => summaries.push(s),
    all: () => [...lines, ...summaries].join('\n'),
  };
}

function expectNoSecretsOrIds(text: string) {
  for (const secret of [
    TOKEN,
    PROJECT_ID,
    ENV_ID,
    API_ID,
    WORKER_ID,
    COMBINED_ID,
    EXPECTED_API_HOST,
    'post' + 'gres://',
  ]) {
    expect(text).not.toContain(secret);
  }
}

describe('DESIRED, diffFields and aiWorkerHealthcheck', () => {
  it('pins the spec values', () => {
    expect(DESIRED).toEqual({
      api: {
        restartPolicyType: 'ON_FAILURE',
        restartPolicyMaxRetries: 10,
        healthcheckPath: '/api/health/live',
        healthcheckTimeout: 120,
      },
      'combined-worker': {
        restartPolicyType: 'ON_FAILURE',
        restartPolicyMaxRetries: 10,
        healthcheckPath: '/health',
      },
      'ai-worker': { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
    });
  });

  it('returns only the keys whose values differ', () => {
    expect(
      diffFields(
        { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
        DESIRED['ai-worker']
      )
    ).toEqual({ restartPolicyMaxRetries: 10 });
    expect(diffFields({ ...DESIRED.api }, DESIRED.api)).toEqual({});
  });

  it.each([
    [{ PORT: '5000' }, true],
    [{ PORT: '8080', HEALTH_PORT: '8080' }, true],
    [{ PORT: '8080', HEALTH_PORT: '5000' }, false],
    [{ PORT: '8080' }, false],
    [{}, false],
  ])('ai-worker health check for %j -> %s', (vars, set) => {
    expect(aiWorkerHealthcheck(vars).set).toBe(set);
  });

  it('skips the ai-worker health check when variables are unreadable', () => {
    expect(aiWorkerHealthcheck(null)).toEqual({ set: false, reason: 'variables unreadable' });
  });

  it.each([
    [{ PORT: '8080' }, true],
    [{}, true],
    [{ PORT: '8080', HEALTH_PORT: '8080' }, true],
    [{ PORT: '8080', COMBINED_HEALTH_PORT: '8080', HEALTH_PORT: '9000' }, true],
    [{ PORT: '8080', HEALTH_PORT: '9000' }, false],
    [{ PORT: '8080', COMBINED_HEALTH_PORT: '7000' }, false],
    [{ HEALTH_PORT: '9000' }, false],
  ])('combined-worker health check for %j -> %s', (vars, set) => {
    expect(combinedWorkerHealthcheck(vars).set).toBe(set);
  });
});

describe('probeTarget: the probe is bound to the api host (#1045 review, P1)', () => {
  it.each([[API_URL], [`${API_URL}/`], [`${API_URL}//`]])('accepts %s', (url) => {
    expect(probeTarget(url)).toEqual({ url: PROBE_URL });
  });

  it.each([
    ['another healthy host', 'https://other-service.example.invalid'],
    ['a look-alike subdomain', `https://${EXPECTED_API_HOST}.example.invalid`],
    ['plain http', `http://${EXPECTED_API_HOST}`],
    ['another port', `https://${EXPECTED_API_HOST}:8443`],
    ['credentials', `https://u:p@${EXPECTED_API_HOST}`],
    ['a path', `https://${EXPECTED_API_HOST}/elsewhere`],
    ['a query', `https://${EXPECTED_API_HOST}/?to=elsewhere`],
  ])('refuses %s as "wrong host"', (_label, url) => {
    expect(probeTarget(url)).toEqual({ reason: 'wrong host' });
  });

  it('refuses an unparsable or missing URL', () => {
    expect(probeTarget('not a url')).toEqual({ reason: 'bad url' });
    expect(probeTarget(undefined)).toEqual({ reason: 'no url' });
  });
});

describe('run: read-only by default', () => {
  it('sends no mutation and prints every service | field | before | after row', async () => {
    const r = fakeRailway();
    const out = capture();
    const result = await run({ env, argv: [], fetchImpl: r.fetchImpl, ...out });
    expect(r.mutations()).toEqual([]);
    for (const field of Object.keys(DESIRED.api)) {
      expect(out.lines.some((l) => l.startsWith(`api | ${field} | `))).toBe(true);
    }
    for (const name of ['ai-worker', 'combined-worker'] as const) {
      for (const field of Object.keys(DESIRED[name])) {
        expect(out.lines.some((l) => l.startsWith(`${name} | ${field} | `))).toBe(true);
      }
    }
    expect(out.lines).toContain('api | restartPolicyType | ALWAYS | ON_FAILURE');
    expect(out.lines).toContain('api | healthcheckPath | none | /api/health/live');
    expect(result.applied).toBe(false);
  });
});

describe('run --apply', () => {
  it('sends one mutation per service with exactly the differing keys, then is idempotent', async () => {
    const r = fakeRailway();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.mutations()).toHaveLength(3);
    expect(r.inputFor(API_ID)).toEqual(DESIRED.api);
    expect(r.inputFor(COMBINED_ID)).toEqual(DESIRED['combined-worker']);
    expect(r.inputFor(WORKER_ID)).toEqual({
      ...DESIRED['ai-worker'],
      healthcheckPath: '/health/live',
    });

    const before = r.mutations().length;
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.mutations().length).toBe(before);
  });

  it('leaves a field that already matches out of the input', async () => {
    const r = fakeRailway({ instances: { 'ai-worker': { restartPolicyType: 'ON_FAILURE' } } });
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.inputFor(WORKER_ID)).not.toHaveProperty('restartPolicyType');
    expect(r.inputFor(WORKER_ID)).toHaveProperty('restartPolicyMaxRetries', 10);
  });

  it('skips the ai-worker health check when it serves health on another port', async () => {
    const r = fakeRailway({ variables: { PORT: '8080', HEALTH_PORT: '5000' } });
    const out = capture();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...out });
    expect(r.inputFor(WORKER_ID)).toEqual(DESIRED['ai-worker']);
    expect(out.lines).toContain(
      'healthcheck skipped: ai-worker serves health on HEALTH_PORT != PORT'
    );
  });

  it.each([
    ['a Not Authorized error', 'denied' as const, 'railway variables: FORBIDDEN Not Authorized'],
    ['null', null, 'railway variables: unreadable'],
  ])(
    'fails the run loudly when variables are answered with %s (#1045 review, P2)',
    async (_label, variables, message) => {
      const r = fakeRailway({ variables });
      await expect(
        run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() })
      ).rejects.toThrow(message);
      expect(r.inputFor(COMBINED_ID)).toBeUndefined();
      expect(r.inputFor(WORKER_ID)).toBeUndefined();
    }
  );

  it('fails loudly in read-only mode too when variables are unreadable', async () => {
    const r = fakeRailway({ variables: 'denied' });
    await expect(run({ env, argv: [], fetchImpl: r.fetchImpl, ...capture() })).rejects.toThrow(
      'railway variables: FORBIDDEN Not Authorized'
    );
  });

  it('leaves the combined-worker /health check alone when Railway already has it', async () => {
    const r = fakeRailway({
      instances: { 'combined-worker': { healthcheckPath: '/health' } },
      variables: 'denied',
      services: ['api', 'combined-worker'],
    });
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.inputFor(COMBINED_ID)).toEqual({
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    });
    expect(r.graphql.some((c) => c.op === 'variables')).toBe(false);
  });

  it('skips the combined-worker health check when it serves health on another port', async () => {
    const r = fakeRailway({ variables: { PORT: '8080', COMBINED_HEALTH_PORT: '7000' } });
    const out = capture();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...out });
    expect(r.inputFor(COMBINED_ID)).toEqual({
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    });
    expect(out.lines).toContain(
      'healthcheck skipped: combined-worker serves health on another port than PORT'
    );
  });

  it('skips a gone ai-worker and never touches the stopped events and ingestion workers', async () => {
    const r = fakeRailway({
      services: ['api', 'combined-worker', 'events-worker', 'ingestion-worker'],
    });
    const out = capture();
    const result = await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...out });
    expect(out.lines).toContain('ai-worker not found: skipped');
    expect(
      r
        .mutations()
        .map((c) => c.variables.serviceId)
        .sort()
    ).toEqual([API_ID, COMBINED_ID].sort());
    expect(result.applied).toBe(true);
  });

  it('never logs a variable value, an ID, the token or the api host', async () => {
    const r = fakeRailway();
    const out = capture();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...out });
    expect(out.summaries.length).toBeGreaterThan(0);
    expectNoSecretsOrIds(out.all());
    expect(out.summaries.join('\n')).toContain('effective from the next deployment');
  });

  it('fails closed when the read-back differs from what was sent', async () => {
    const r = fakeRailway({ ignoreWrites: true });
    await expect(
      run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() })
    ).rejects.toThrow('read-back mismatch: api.restartPolicyType');
  });

  it.each([['api'], ['combined-worker']])(
    'rejects before any mutation when service %s is missing',
    async (missing) => {
      const r = fakeRailway({
        services: ['api', 'combined-worker', 'ai-worker'].filter((s) => s !== missing),
      });
      await expect(
        run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() })
      ).rejects.toThrow(`service ${missing} not found`);
      expect(r.mutations()).toEqual([]);
    }
  );

  it('rejects when there is no production environment', async () => {
    const r = fakeRailway({ environments: ['staging'] });
    await expect(run({ env, argv: [], fetchImpl: r.fetchImpl, ...capture() })).rejects.toThrow(
      'environment production not found'
    );
  });

  it.each(['RAILWAY_API_TOKEN', 'RAILWAY_PROJECT_ID'])(
    'refuses to start without %s',
    async (key) => {
      const r = fakeRailway();
      await expect(
        run({
          env: { ...env, [key]: undefined },
          argv: ['--apply'],
          fetchImpl: r.fetchImpl,
          ...capture(),
        })
      ).rejects.toThrow('RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID are required');
      expect(r.graphql).toEqual([]);
      expect(r.probes).toEqual([]);
    }
  );

  it('logs only the error code and an allow-listed message from a GraphQL error', async () => {
    const r = fakeRailway({
      graphqlError: { op: 'project', message: 'Not Authorized', code: 'FORBIDDEN' },
    });
    await expect(run({ env, argv: [], fetchImpl: r.fetchImpl, ...capture() })).rejects.toThrow(
      'railway project: FORBIDDEN Not Authorized'
    );
  });

  it('redacts a GraphQL error message that is not allow-listed', async () => {
    const r = fakeRailway({
      graphqlError: {
        op: 'serviceInstance',
        message: `project ${PROJECT_ID} is locked`,
        code: 'INTERNAL',
      },
    });
    const err = await run({ env, argv: [], fetchImpl: r.fetchImpl, ...capture() }).catch(
      (e: Error) => e
    );
    expect((err as Error).message).toBe('railway serviceInstance: INTERNAL <redacted>');
  });

  it('prints an error code only if it looks like an enum code (STOA-security review)', async () => {
    const r = fakeRailway({
      graphqlError: { op: 'project', message: 'Not Authorized', code: `x ${PROJECT_ID}` },
    });
    const err = await run({ env, argv: [], fetchImpl: r.fetchImpl, ...capture() }).catch(
      (e: Error) => e
    );
    expect((err as Error).message).toBe('railway project: UNKNOWN Not Authorized');
  });

  it('gives every GraphQL request a timeout, so a hung Railway API cannot stall the job', async () => {
    const r = fakeRailway();
    const signals: unknown[] = [];
    const fetchImpl: typeof r.fetchImpl = async (url, init) => {
      if (url.includes('backboard')) signals.push(init.signal);
      return r.fetchImpl(url, init);
    };
    await run({ env, argv: [], fetchImpl, ...capture() });
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('only ever reads instances and updates settings: no deploy or redeploy operation', async () => {
    const r = fakeRailway();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.mutations().length).toBeGreaterThan(0);
    for (const call of r.graphql) {
      expect(['project', 'serviceInstance', 'variables', 'serviceInstanceUpdate']).toContain(
        call.op
      );
    }
  });

  it('sends the user agent and the bearer token on every GraphQL request', async () => {
    const r = fakeRailway();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.graphql.length).toBeGreaterThan(0);
    for (const call of r.graphql) {
      expect(call.headers['User-Agent']).toBe('ifc-env008/1.0');
      expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });
});

describe('run --apply: api live-probe guard (r5/A1)', () => {
  const skippedApiInput = {
    restartPolicyType: 'ON_FAILURE',
    restartPolicyMaxRetries: 10,
  };

  it('sets the health check when the live api answers 200', async () => {
    const r = fakeRailway({ probe: { status: 200 } });
    const result = await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.probes.map((p) => p.url)).toEqual([PROBE_URL]);
    expect(r.inputFor(API_ID)).toEqual(DESIRED.api);
    expect(result.applied).toBe(true);
  });

  it('sends an unauthenticated GET that does not follow redirects and has a timeout', async () => {
    const r = fakeRailway();
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    const [probe] = r.probes;
    expect(probe.init.method).toBe('GET');
    expect(probe.init.redirect).toBe('manual');
    expect(probe.init.signal).toBeInstanceOf(AbortSignal);
    expect(probe.init).not.toHaveProperty('headers');
    expect(JSON.stringify(probe)).not.toContain(TOKEN);
  });

  it.each([
    ['HTTP 503', { status: 503 }],
    ['HTTP 204', { status: 204 }],
    ['redirect', { status: 302 }],
    ['redirect', { status: 301 }],
    ['network error', { throws: 'network' as const }],
    ['timeout', { throws: 'timeout' as const }],
  ])(
    'on a failed probe (%s) it sets the restart policy, skips the health check and fails the run',
    async (reason, probe) => {
      const r = fakeRailway({ probe });
      const out = capture();
      const err = await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...out }).catch(
        (e: Error) => e
      );
      const line = `healthcheck skipped: api /api/health/live probe returned ${reason}`;
      expect((err as Error).message).toBe(line);
      expect(r.inputFor(API_ID)).toEqual(skippedApiInput);
      expect(r.inputFor(WORKER_ID)).toEqual({
        ...DESIRED['ai-worker'],
        healthcheckPath: '/health/live',
      });
      expect(out.lines).toContain(line);
      expect(out.summaries.join('\n')).toContain(line);
      expect(out.summaries.join('\n')).toContain('api | restartPolicyType | ALWAYS | ON_FAILURE');
      expectNoSecretsOrIds(out.all());
      expect(out.all()).not.toContain('ENOTFOUND');
    }
  );

  it('skips with "no url" and makes no probe when PRODUCTION_API_URL is unset', async () => {
    const r = fakeRailway();
    const err = await run({
      env: { ...env, PRODUCTION_API_URL: undefined },
      argv: ['--apply'],
      fetchImpl: r.fetchImpl,
      ...capture(),
    }).catch((e: Error) => e);
    expect((err as Error).message).toBe(
      'healthcheck skipped: api /api/health/live probe returned no url'
    );
    expect(r.probes).toEqual([]);
    expect(r.inputFor(API_ID)).toEqual(skippedApiInput);
  });

  it.each([
    ['another healthy host', 'https://other-service.example.invalid'],
    ['plain http', `http://${EXPECTED_API_HOST}`],
  ])(
    'refuses a PRODUCTION_API_URL naming %s: no probe, no health check, run fails',
    async (_label, url) => {
      const r = fakeRailway();
      const out = capture();
      const err = await run({
        env: { ...env, PRODUCTION_API_URL: url },
        argv: ['--apply'],
        fetchImpl: r.fetchImpl,
        ...out,
      }).catch((e: Error) => e);
      expect((err as Error).message).toBe(
        'healthcheck skipped: api /api/health/live probe returned wrong host'
      );
      expect(r.probes).toEqual([]);
      expect(r.inputFor(API_ID)).toEqual(skippedApiInput);
      expect(out.all()).not.toContain('other-service');
    }
  );

  it('probes /api/health/live once, without a double slash, for a URL with a trailing slash', async () => {
    const r = fakeRailway();
    await run({
      env: { ...env, PRODUCTION_API_URL: `${API_URL}/` },
      argv: ['--apply'],
      fetchImpl: r.fetchImpl,
      ...capture(),
    });
    expect(r.probes.map((p) => p.url)).toEqual([PROBE_URL]);
  });

  it('makes no probe when the api health check path is already set', async () => {
    const r = fakeRailway({ instances: { api: { healthcheckPath: '/api/health/live' } } });
    await run({ env, argv: ['--apply'], fetchImpl: r.fetchImpl, ...capture() });
    expect(r.probes).toEqual([]);
    expect(r.inputFor(API_ID)).toEqual({
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
      healthcheckTimeout: 120,
    });
  });

  it('in read-only mode probes, reports "would be skipped" and resolves without writing', async () => {
    const r = fakeRailway({ probe: { status: 503 } });
    const out = capture();
    const result = await run({ env, argv: [], fetchImpl: r.fetchImpl, ...out });
    expect(r.probes).toHaveLength(1);
    expect(r.mutations()).toEqual([]);
    expect(out.lines).toContain(
      'healthcheck would be skipped: api /api/health/live probe returned HTTP 503'
    );
    expect(result.applied).toBe(false);
  });
});
