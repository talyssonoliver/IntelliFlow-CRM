import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

// ENV-008-AI AC-006 / AC-008 (plan r5/A2): one workflow per Grafana resource,
// so a change to SLOs or the dashboard never re-applies the alert rules, plus
// the Railway self-healing workflow (owner ruling 2: applied by CI on merge).

type Step = {
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
};
type Job = {
  environment?: string;
  'timeout-minutes'?: number;
  needs?: unknown;
  steps: Step[];
};
type Workflow = {
  on: {
    push?: { branches?: string[]; paths?: string[] };
    workflow_dispatch?: { inputs?: Record<string, { type?: string; default?: unknown }> };
    [trigger: string]: unknown;
  };
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
};

const WORKFLOWS = join(__dirname, '../../../.github/workflows');
const raw = (file: string) => readFileSync(join(WORKFLOWS, file), 'utf8');
const load = (file: string) => yaml.load(raw(file)) as Workflow;
const sparsePaths = (job: Job) =>
  job.steps
    .map((s) => s.with?.['sparse-checkout'])
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(/\r?\n/).map((l) => l.trim()))
    .filter(Boolean);
const GRAFANA_SPARSE = [
  'infra/monitoring/grafana/cloud',
  'tools/scripts/observability',
  'tools/scripts/lib',
];

function expectNoUnwantedTriggers(wf: Workflow) {
  const triggers = Object.keys(wf.on);
  expect(triggers).not.toContain('pull_request');
  expect(triggers).not.toContain('pull_request_target');
  expect(triggers).not.toContain('schedule');
}

function expectPinnedActions(job: Job, nodeVersion = '24') {
  const uses = job.steps.map((s) => s.uses).filter(Boolean);
  expect(uses).toContain('actions/checkout@v7');
  expect(uses).toContain('actions/setup-node@v7');
  const setupNode = job.steps.find((s) => s.uses === 'actions/setup-node@v7');
  expect(String(setupNode?.with?.['node-version'])).toBe(nodeVersion);
}

/** The checkout leaves no GITHUB_TOKEN in .git/config for later steps to read (STOA-security review). */
function expectNoPersistedCredentials(job: Job) {
  const checkout = job.steps.find((s) => s.uses === 'actions/checkout@v7');
  expect(checkout?.with?.['persist-credentials']).toBe(false);
}

/** A secret may only reach the job through a step's env, never inline in a run script. */
function expectSecretOnlyInEnv(job: Job, envKey: string, expression: string) {
  const envStep = job.steps.find((s) => s.env?.[envKey] !== undefined);
  expect(envStep?.env?.[envKey]).toBe(expression);
  for (const step of job.steps) expect(step.run ?? '').not.toContain('secrets.');
}

describe('grafana-alert-rules.yml', () => {
  const wf = load('grafana-alert-rules.yml');

  it('keeps exactly its own three trigger paths, so SLO or dashboard edits never re-apply the alert rules', () => {
    expect(wf.on.push?.branches).toEqual(['main']);
    expect(wf.on.push?.paths).toEqual([
      'infra/monitoring/grafana/cloud/alert-rules.json',
      'tools/scripts/observability/apply-grafana-alert-rules.mjs',
      '.github/workflows/grafana-alert-rules.yml',
    ]);
  });

  it('keeps its one job, environment, inputs and command as they are', () => {
    expect(Object.keys(wf.jobs)).toEqual(['apply']);
    const job = wf.jobs.apply;
    expect(job.environment).toBe('Production');
    expect(sparsePaths(job)).toEqual(GRAFANA_SPARSE);
    expectPinnedActions(job);
    expect(Object.keys(wf.on.workflow_dispatch?.inputs ?? {})).toEqual(['send_test', 'dry_run']);
    expect(job.steps.map((s) => s.run).filter(Boolean)).toEqual([
      'node tools/scripts/observability/apply-grafana-alert-rules.mjs $SEND_TEST $DRY_RUN',
    ]);
    expectSecretOnlyInEnv(job, 'GRAFANA_SA_TOKEN', '${{ secrets.GRAFANA_SA_TOKEN }}');
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('allows 12 minutes, so the 503 retry (up to 255 s per call) fits', () => {
    expect(wf.jobs.apply['timeout-minutes']).toBe(12);
  });

  it('has no pull_request or schedule trigger', () => {
    expectNoUnwantedTriggers(wf);
  });
});

describe.each([
  {
    file: 'grafana-slos.yml',
    job: 'slos',
    config: 'infra/monitoring/grafana/cloud/slos.json',
    script: 'tools/scripts/observability/apply-grafana-slos.mjs',
  },
  {
    file: 'grafana-dashboard.yml',
    job: 'dashboard',
    config: 'infra/monitoring/grafana/cloud/dashboard-production.json',
    script: 'tools/scripts/observability/apply-grafana-dashboard.mjs',
  },
])('$file (grafana)', ({ file, job: jobName, config, script }) => {
  const load_ = () => load(file);

  it('runs on push to main only for its own files and the shared lib', () => {
    const wf = load_();
    expect(wf.on.push?.branches).toEqual(['main']);
    expect(wf.on.push?.paths).toEqual([
      config,
      script,
      'tools/scripts/lib/grafana-provisioning.mjs',
      `.github/workflows/${file}`,
    ]);
  });

  it('has a single independent job in the Production environment with a 12-minute timeout', () => {
    const wf = load_();
    expect(Object.keys(wf.jobs)).toEqual([jobName]);
    const job = wf.jobs[jobName];
    expect(job.needs).toBeUndefined();
    expect(job.environment).toBe('Production');
    expect(job['timeout-minutes']).toBe(12);
    expect(sparsePaths(job)).toEqual(GRAFANA_SPARSE);
    expectPinnedActions(job);
    expectNoPersistedCredentials(job);
  });

  it('reads only, never cancels a running apply, and uses its own concurrency group', () => {
    const wf = load_();
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(wf.concurrency).toEqual({
      group: file.replace('.yml', ''),
      'cancel-in-progress': false,
    });
  });

  it('passes the token only through the step env and maps dry_run to --dry-run', () => {
    const wf = load_();
    const job = wf.jobs[jobName];
    expectSecretOnlyInEnv(job, 'GRAFANA_SA_TOKEN', '${{ secrets.GRAFANA_SA_TOKEN }}');
    const step = job.steps.find((s) => s.run);
    expect(step?.env?.GRAFANA_URL).toBe('https://graysushi1880.grafana.net');
    expect(step?.env?.DRY_RUN).toBe("${{ inputs.dry_run && '--dry-run' || '' }}");
    expect(step?.run).toBe(`node ${script} $DRY_RUN`);
    expect(wf.on.workflow_dispatch?.inputs?.dry_run).toMatchObject({
      type: 'boolean',
      default: false,
    });
  });

  it('has no pull_request or schedule trigger', () => {
    expectNoUnwantedTriggers(load_());
  });
});

describe('railway-self-healing.yml', () => {
  const load_ = () => load('railway-self-healing.yml');
  const onlyJob = (wf: Workflow) => {
    const jobs = Object.values(wf.jobs);
    expect(jobs).toHaveLength(1);
    return jobs[0];
  };

  it('applies on push to main only when its own script or workflow changes', () => {
    const wf = load_();
    expect(wf.on.push?.branches).toEqual(['main']);
    expect(wf.on.push?.paths).toEqual([
      'tools/scripts/observability/apply-railway-self-healing.mjs',
      '.github/workflows/railway-self-healing.yml',
    ]);
  });

  it('the script is self-contained, so the sparse checkout needs only its own folder', () => {
    const script = readFileSync(
      join(__dirname, '../observability/apply-railway-self-healing.mjs'),
      'utf8'
    );
    expect(script).not.toMatch(/from ['"]\.\.\/lib\//);
    expect(sparsePaths(onlyJob(load_()))).toEqual(['tools/scripts/observability']);
  });

  it('applies on push, and a manual dispatch is read-only unless apply is ticked', () => {
    const wf = load_();
    expect(wf.on.workflow_dispatch?.inputs?.apply).toMatchObject({
      type: 'boolean',
      default: false,
    });
    const step = onlyJob(wf).steps.find((s) => s.run);
    expect(step?.env?.APPLY).toBe(
      "${{ (github.event_name == 'push' || inputs.apply) && '--apply' || '' }}"
    );
    expect(step?.run).toBe(
      'node tools/scripts/observability/apply-railway-self-healing.mjs $APPLY'
    );
  });

  it('runs in Production, reads only from the repo, and never cancels a running apply', () => {
    const wf = load_();
    const job = onlyJob(wf);
    expect(job.environment).toBe('Production');
    expect(job['timeout-minutes']).toBe(5);
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(wf.concurrency).toEqual({ group: 'railway-self-healing', 'cancel-in-progress': false });
    expectPinnedActions(job);
    expectNoPersistedCredentials(job);
  });

  it('passes the token, project and api URL only through the step env', () => {
    const job = onlyJob(load_());
    expectSecretOnlyInEnv(job, 'RAILWAY_API_TOKEN', '${{ secrets.RAILWAY_TOKEN }}');
    const step = job.steps.find((s) => s.run);
    expect(step?.env?.RAILWAY_PROJECT_ID).toBe('${{ vars.RAILWAY_PROJECT_ID }}');
    expect(step?.env?.PRODUCTION_API_URL).toBe('${{ vars.PRODUCTION_API_URL }}');
  });

  it('has no pull_request or schedule trigger', () => {
    expectNoUnwantedTriggers(load_());
  });
});
