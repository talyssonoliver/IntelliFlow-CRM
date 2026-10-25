/**
 * IFC-117: the AI alert-rules sibling script (apply-grafana-ai-alert-rules.mjs), its committed
 * rules file and its workflow. Modelled on apply-grafana-alert-rules.test.ts; that script and its
 * workflow belong to another lane and are only read here, never imported for behaviour.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RULES_PATH,
  SAFE_PATH_SEGMENT,
  buildRule,
  extractConstRegexSource,
  redactText,
  run,
  validateConfig,
} from '../observability/apply-grafana-ai-alert-rules.mjs';
import { AI_ALERT_THRESHOLDS } from '../../../apps/ai-worker/src/monitoring/otel-ai-types';

const REPO = join(__dirname, '../../..');
const CONFIG = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
const IFC032 = JSON.parse(
  readFileSync(join(REPO, 'infra/monitoring/grafana/cloud/alert-rules.json'), 'utf8')
);
const WORKFLOW_PATH = join(REPO, '.github/workflows/grafana-ai-alert-rules.yml');
// Built at runtime from filler characters, so nothing here is shaped like a real credential.
const TOKEN = 'x'.repeat(24);
const HOST = 'https://grafana.example.invalid';

type Call = { method: string; path: string; body?: unknown };
type FakeOpts = {
  series?: (q: string) => number;
  exprStatus?: (q: string) => { status: number; body?: unknown };
  existing?: string[];
  folder?: number;
  failPath?: string;
};

const reply = (status: number, json?: unknown) => ({
  status,
  text: async () => (json === undefined ? '' : JSON.stringify(json)),
});

/** The Prometheus query endpoint: series counts for the selector check, else the rule expr. */
function queryReply(path: string, opts: FakeOpts) {
  const q = decodeURIComponent(path.split('query=')[1]);
  if (q.startsWith('count(last_over_time(')) {
    return reply(200, {
      status: 'success',
      data: { result: [{ value: [0, String(opts.series ? opts.series(q) : 3)] }] },
    });
  }
  const r = opts.exprStatus?.(q) ?? {
    status: 200,
    body: { status: 'success', data: { result: [] } },
  };
  return reply(r.status, r.body);
}

function fakeGrafana(opts: FakeOpts = {}) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
    const path = url.replace(HOST, '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    if (opts.failPath && path.startsWith(opts.failPath)) {
      return reply(401, {
        message: `denied for Authorization: Bearer ${TOKEN} ${'y'.repeat(400)}`,
      });
    }
    if (path.includes('/api/v1/query')) return queryReply(path, opts);
    if (path.startsWith('/api/folders/')) return reply(opts.folder ?? 200, {});
    if (path === '/api/folders') return reply(200, {});
    const uid = path.split('/alert-rules/')[1];
    if (init.method === 'GET' && uid) return reply(opts.existing?.includes(uid) ? 200 : 404, {});
    return reply(init.method === 'POST' ? 201 : 200, {});
  };
  return { calls, fetchImpl };
}

const env = { GRAFANA_URL: HOST, GRAFANA_SA_TOKEN: TOKEN };
const quiet = () => {};

const tmpDirs: string[] = [];
function withConfig(mutate: (c: typeof CONFIG) => void): string {
  const copy = structuredClone(CONFIG);
  mutate(copy);
  const dir = mkdtempSync(join(tmpdir(), 'ifc117-rules-'));
  tmpDirs.push(dir);
  const file = join(dir, 'ai-alert-rules.json');
  writeFileSync(file, JSON.stringify(copy));
  return file;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('committed AI rules file', () => {
  it('is valid', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
  });

  it('pins the exact rule uids', () => {
    expect(CONFIG.rules.map((r: { uid: string }) => r.uid)).toEqual([
      'ifc117-hallucination-rate',
      'ifc117-drift-shift',
      'ifc117-drift-stalled',
      'ifc117-inference-p95-latency',
      'ifc117-inference-error-ratio',
      'ifc117-ai-metrics-silent',
    ]);
  });

  it('every rule tolerates missing series until ai-worker is promoted', () => {
    for (const rule of CONFIG.rules) {
      expect(rule.requireSeries).toBe(false);
      expect(rule.noData).toBe('OK');
    }
  });

  it('lives in its own folder and group, never IFC-032 (alert-rules.json)', () => {
    expect(CONFIG.folder.uid).toBe('intelliflow-ai');
    expect(CONFIG.group.name).toBe('intelliflow-ai');
    expect(CONFIG.folder.uid).not.toBe(IFC032.folder.uid);
    expect(CONFIG.group.name).not.toBe(IFC032.group.name);
    expect(CONFIG.deliveryTest).toBeUndefined();
  });

  it('uses the shared thresholds (5% hallucination, 2000 ms p95, 5% errors)', () => {
    const byUid = Object.fromEntries(CONFIG.rules.map((r: { uid: string }) => [r.uid, r]));
    expect(byUid['ifc117-hallucination-rate'].expr).toContain(
      `>= bool ${AI_ALERT_THRESHOLDS.hallucinationRate}`
    );
    expect(byUid['ifc117-hallucination-rate'].expr).toContain(
      `>= ${AI_ALERT_THRESHOLDS.minHallucinationChecks}`
    );
    expect(byUid['ifc117-inference-p95-latency'].threshold).toBe(AI_ALERT_THRESHOLDS.latencyP95Ms);
    expect(byUid['ifc117-inference-p95-latency'].expr).toContain(
      `>= ${AI_ALERT_THRESHOLDS.minCalls}`
    );
    expect(byUid['ifc117-inference-error-ratio'].expr).toContain(
      `> bool ${AI_ALERT_THRESHOLDS.errorRatio}`
    );
    expect(byUid['ifc117-drift-stalled'].for).toBe('30m');
  });

  it('builds query -> reduce -> threshold rules labelled source=ifc-117', () => {
    const rule = buildRule(CONFIG.rules[0], CONFIG);
    expect(rule.labels.source).toBe('ifc-117');
    expect(rule.folderUID).toBe('intelliflow-ai');
    expect(rule.ruleGroup).toBe('intelliflow-ai');
    expect(rule.data.map((d: { refId: string }) => d.refId)).toEqual(['A', 'B', 'C']);
  });
});

describe('validateConfig negatives', () => {
  const base = () => structuredClone(CONFIG);

  it.each([
    ['missing summary', (c: typeof CONFIG) => delete c.rules[0].summary, 'missing summary'],
    ['bad operator', (c: typeof CONFIG) => (c.rules[0].operator = 'gte'), 'operator'],
    ['duplicate uid', (c: typeof CONFIG) => (c.rules[1].uid = c.rules[0].uid), 'duplicate uid'],
    ['uid without prefix', (c: typeof CONFIG) => (c.rules[0].uid = 'other-rule'), 'ifc117-'],
    ['IFC-032 group', (c: typeof CONFIG) => (c.group.name = IFC032.group.name), 'group'],
    ['IFC-032 folder', (c: typeof CONFIG) => (c.folder.uid = IFC032.folder.uid), 'folder'],
    [
      'foreign metric',
      (c: typeof CONFIG) => (c.rules[0].expr = 'sum(rate(http_requests_total[5m]))'),
      'http_requests_total',
    ],
  ])('rejects %s', (_label, mutate, message) => {
    const c = base();
    mutate(c);
    expect(validateConfig(c).join('\n')).toContain(message);
  });

  it.each(['a/../b', '?x', '#x', ' x', ''])(
    'rejects the unsafe path segment %j everywhere it is used',
    (bad) => {
      for (const mutate of [
        (c: typeof CONFIG) => (c.rules[0].uid = bad),
        (c: typeof CONFIG) => (c.folder.uid = bad),
        (c: typeof CONFIG) => (c.group.name = bad),
        (c: typeof CONFIG) => (c.datasourceUid = bad),
      ]) {
        const c = base();
        mutate(c);
        expect(validateConfig(c).length).toBeGreaterThan(0);
      }
    }
  );
});

describe('SAFE_PATH_SEGMENT parity with the IFC-032 script', () => {
  const original = readFileSync(
    join(REPO, 'tools/scripts/observability/apply-grafana-alert-rules.mjs'),
    'utf8'
  );

  it('the copied regex is identical to the original (read from source, not imported)', () => {
    expect(extractConstRegexSource(original, 'SAFE_PATH_SEGMENT')).toBe(SAFE_PATH_SEGMENT.source);
  });

  it('fails loudly when the const cannot be found, so a rename never passes vacuously', () => {
    expect(() => extractConstRegexSource('const OTHER = /x/;', 'SAFE_PATH_SEGMENT')).toThrow(
      'parity source not found'
    );
  });
});

describe('run()', () => {
  it('applies only its own group: folder created on 404, rules created, group PUT, nothing deleted', async () => {
    const g = fakeGrafana({ folder: 404 });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(6);
    expect(g.calls.some((c) => c.method === 'POST' && c.path === '/api/folders')).toBe(true);
    const groupPuts = g.calls.filter((c) => c.method === 'PUT' && c.path.includes('/rule-groups/'));
    expect(groupPuts.map((c) => c.path)).toEqual([
      '/api/v1/provisioning/folder/intelliflow-ai/rule-groups/intelliflow-ai',
    ]);
    expect(g.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('updates rules that already exist', async () => {
    const g = fakeGrafana({ existing: ['ifc117-drift-shift'] });
    await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(
      g.calls.some((c) => c.method === 'PUT' && c.path.endsWith('/alert-rules/ifc117-drift-shift'))
    ).toBe(true);
  });

  it('does not fail when a requireSeries:false rule has no live series', async () => {
    const g = fakeGrafana({ series: () => 0 });
    const result = await run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.empty).toEqual([]);
  });

  it('dry run writes nothing, but runs the series check and an instant query of every expr', async () => {
    const g = fakeGrafana({ series: () => 0 });
    const result = await run({ env, argv: ['--dry-run'], fetchImpl: g.fetchImpl, log: quiet });
    expect(result.applied).toBe(0);
    expect(g.calls.every((c) => c.method === 'GET')).toBe(true);
    const exprQueries = g.calls.filter(
      (c) =>
        c.path.includes('/api/v1/query') &&
        !decodeURIComponent(c.path).includes('count(last_over_time(')
    );
    expect(exprQueries).toHaveLength(CONFIG.rules.length);
  });

  it('dry run fails naming the rule whose expr Grafana rejects', async () => {
    const g = fakeGrafana({
      exprStatus: (q) =>
        q.includes('drift_detections')
          ? { status: 400, body: { status: 'error', error: 'parse error' } }
          : { status: 200, body: { status: 'success', data: { result: [] } } },
    });
    await expect(
      run({ env, argv: ['--dry-run'], fetchImpl: g.fetchImpl, log: quiet })
    ).rejects.toThrow('ifc117-drift-shift');
  });

  it('rejects an invalid rules file before calling Grafana', async () => {
    const file = withConfig((c) => (c.group.name = IFC032.group.name));
    const g = fakeGrafana();
    await expect(
      run({ env, argv: [], fetchImpl: g.fetchImpl, log: quiet, rulesPath: file })
    ).rejects.toThrow('rules file invalid');
    expect(g.calls).toHaveLength(0);
  });

  it('requires the URL and token, and never echoes the token', async () => {
    await expect(
      run({ env: { GRAFANA_URL: HOST }, argv: [], fetchImpl: fakeGrafana().fetchImpl, log: quiet })
    ).rejects.toThrow('GRAFANA_URL and GRAFANA_SA_TOKEN are required');
  });

  it('a 401 with an echoing body leaks neither the token nor the Authorization header, and is truncated', async () => {
    const g = fakeGrafana({ failPath: '/api/folders/' });
    const lines: string[] = [];
    const err = await run({
      env,
      argv: [],
      fetchImpl: g.fetchImpl,
      log: (l: string) => lines.push(l),
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const text = `${(err as Error).message}\n${lines.join('\n')}`;
    expect(text).not.toContain(TOKEN);
    expect(text).not.toMatch(/Authorization/i);
    expect((err as Error).message.length).toBeLessThan(400);
  });

  it('redactText removes bearer values and truncates', () => {
    const out = redactText(`Authorization: Bearer ${TOKEN} ${'z'.repeat(500)}`, TOKEN);
    expect(out).not.toContain(TOKEN);
    expect(out.length).toBeLessThanOrEqual(200);
  });
});

describe('workflow contract (.github/workflows/grafana-ai-alert-rules.yml)', () => {
  const raw = readFileSync(WORKFLOW_PATH, 'utf8');
  const wf = yaml.load(raw) as {
    on: Record<string, { branches?: string[]; paths?: string[]; inputs?: Record<string, unknown> }>;
    permissions: Record<string, string>;
    concurrency: { group: string };
    jobs: Record<
      string,
      {
        environment?: string;
        'timeout-minutes'?: number;
        steps: {
          uses?: string;
          with?: Record<string, string>;
          env?: Record<string, string>;
          run?: string;
        }[];
      }
    >;
  };
  const job = Object.values(wf.jobs)[0];

  it('runs only on push to main (path-filtered) and by hand, never on pull requests', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(wf.on.push.branches).toEqual(['main']);
    expect(wf.on.push.paths?.sort()).toEqual(
      [
        'infra/monitoring/grafana/cloud/ai-alert-rules.json',
        'tools/scripts/observability/apply-grafana-ai-alert-rules.mjs',
        '.github/workflows/grafana-ai-alert-rules.yml',
        'tools/scripts/lib/grafana-provisioning.mjs',
      ].sort()
    );
    expect(Object.keys(wf.on.workflow_dispatch.inputs ?? {})).toEqual(['dry_run']);
    expect(raw).not.toMatch(/pull_request/);
  });

  it('is read-only, Production-scoped, with its own concurrency group and a 12+ minute timeout', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(job.environment).toBe('Production');
    expect(wf.concurrency.group).toBe('grafana-ai-alert-rules');
    expect(job['timeout-minutes']).toBeGreaterThanOrEqual(12);
  });

  it('passes the token only through a step env, never on a run line', () => {
    const withToken = job.steps.filter((s) => JSON.stringify(s).includes('GRAFANA_SA_TOKEN'));
    expect(withToken).toHaveLength(1);
    expect(withToken[0].env?.GRAFANA_SA_TOKEN).toBe('${{ secrets.GRAFANA_SA_TOKEN }}');
    expect(withToken[0].run ?? '').not.toContain('secrets.');
  });

  it('pins the actions and node, and sparse-checks out what the script imports', () => {
    const uses = job.steps.map((s) => s.uses).filter(Boolean);
    expect(uses).toEqual(['actions/checkout@v7', 'actions/setup-node@v7']);
    const setupNode = job.steps.find((s) => s.uses === 'actions/setup-node@v7');
    expect(String(setupNode?.with?.['node-version'])).toBe('24');
    const sparse = (job.steps[0].with?.['sparse-checkout'] ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(sparse.sort()).toEqual(
      ['infra/monitoring/grafana/cloud', 'tools/scripts/lib', 'tools/scripts/observability'].sort()
    );
  });
});
