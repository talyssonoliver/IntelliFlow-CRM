/**
 * Issue #318 — nightly k6 1,000-VU load test workflow.
 *
 * Validates the REAL `.github/workflows/performance-gate.yml` (parsed with
 * js-yaml, no mocking) rather than unit-testing a helper, because the thing
 * that must be correct here is the workflow file itself: it must run on a
 * schedule (not per-PR), on a self-hosted runner (not GitHub-hosted minutes
 * — owner decision 2026-10-12, issue #318), target a non-production/ephemeral
 * DB on a port that does not collide with this machine's own pre-ship test
 * containers (ports 5433/6380 — see scripts/lib/preship-integration-infra.mjs),
 * and publish a summary artifact.
 *
 * @module tools/scripts/__tests__/k6-nightly-load-test.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

function repoRoot(): string {
  return resolve(__dirname, '../../..');
}

interface WorkflowYaml {
  on?: Record<string, unknown> | string[];
  jobs: Record<
    string,
    {
      'runs-on'?: string | string[];
      if?: string;
      timeout_minutes?: number;
      steps?: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }>;
      services?: Record<string, { image?: string; ports?: string[]; env?: Record<string, string> }>;
      env?: Record<string, string>;
    }
  >;
}

function loadWorkflow(): WorkflowYaml {
  const text = readFileSync(resolve(repoRoot(), '.github/workflows/performance-gate.yml'), 'utf-8');
  // YAML's `on:` is a reserved word in JS-YAML's default schema and parses
  // fine as a string key; js-yaml gives us a plain object back.
  return load(text) as WorkflowYaml;
}

function findNightlyJob(workflow: WorkflowYaml): [string, WorkflowYaml['jobs'][string]] {
  const entry = Object.entries(workflow.jobs).find(([, job]) => {
    const runsOn = job['runs-on'];
    const asArray = Array.isArray(runsOn) ? runsOn : [runsOn];
    return asArray.some((label) => typeof label === 'string' && label.includes('self-hosted'));
  });
  if (!entry) {
    throw new Error('No job with a self-hosted runs-on label found in performance-gate.yml');
  }
  return entry as [string, WorkflowYaml['jobs'][string]];
}

describe('#318 — nightly k6 1,000-VU load test (performance-gate.yml)', () => {
  it('parses as valid YAML', () => {
    expect(() => loadWorkflow()).not.toThrow();
  });

  it('is triggered on a schedule, not only workflow_dispatch/pull_request', () => {
    const workflow = loadWorkflow();
    const on = workflow.on as Record<string, unknown>;
    expect(on).toHaveProperty('schedule');
    const schedule = on.schedule as Array<{ cron: string }>;
    expect(Array.isArray(schedule)).toBe(true);
    expect(schedule.length).toBeGreaterThan(0);
  });

  it('the schedule cron fires at most once a day (no sub-daily cron on GitHub-hosted minutes)', () => {
    const workflow = loadWorkflow();
    const on = workflow.on as Record<string, unknown>;
    const schedule = on.schedule as Array<{ cron: string }>;
    for (const { cron } of schedule) {
      const [minute, hour, dom, month, dow] = cron.trim().split(/\s+/);
      // A once-daily cron fixes minute+hour and leaves dom/month/dow as '*'.
      expect(minute).not.toBe('*');
      expect(hour).not.toBe('*');
      expect(minute).not.toMatch(/\//); // no "*/N minutes" step pattern
      expect(hour).not.toMatch(/\//); // no "*/N hours" step pattern
      expect(dom).toBe('*');
      expect(month).toBe('*');
      expect(dow).toBe('*');
    }
  });

  it('has a job that runs on a self-hosted runner, never ubuntu-latest', () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    const runsOn = job['runs-on'];
    const asArray = Array.isArray(runsOn) ? runsOn : [runsOn];
    expect(asArray).not.toContain('ubuntu-latest');
    expect(asArray).not.toContain('windows-latest');
  });

  it("the nightly job's ephemeral Postgres does not collide with this machine's pre-ship test containers (5433/6380)", () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    const postgres = job.services?.postgres;
    expect(postgres).toBeDefined();
    const ports = postgres!.ports ?? [];
    expect(ports.length).toBeGreaterThan(0);
    for (const portMapping of ports) {
      const hostPort = portMapping.split(':')[0];
      expect(hostPort).not.toBe('5432');
      expect(hostPort).not.toBe('5433'); // scripts/lib/preship-integration-infra.mjs
    }
  });

  it("the nightly job's DATABASE_URL mirrors the production transaction-pooler shape (?pgbouncer=true)", () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    const databaseUrl = job.env?.DATABASE_URL ?? '';
    expect(databaseUrl).toContain('pgbouncer=true');
  });

  it('runs the real 1000-VU k6 script (tools/scripts/k6/load-test.js), not the smoke test', () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    const steps = job.steps ?? [];
    const runsK6LoadTest = steps.some((s) => s.run?.includes('tools/scripts/k6/load-test.js'));
    expect(runsK6LoadTest).toBe(true);
  });

  it('the referenced k6 script actually defines 1000-VU stages and p99/error thresholds', () => {
    const scriptPath = resolve(repoRoot(), 'tools/scripts/k6/load-test.js');
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toMatch(/target:\s*1000/);
    expect(content).toMatch(/thresholds\s*:/);
    expect(content).toMatch(/p99/);
  });

  it('uploads a summary artifact for the nightly run', () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    const steps = job.steps ?? [];
    const uploadsArtifact = steps.some(
      (s) =>
        s.uses?.startsWith('actions/upload-artifact') &&
        JSON.stringify(s.with ?? {}).includes('artifacts/benchmarks')
    );
    expect(uploadsArtifact).toBe(true);
  });

  it('only runs the heavy nightly job on schedule or an explicit manual opt-in, not on every workflow_dispatch', () => {
    const workflow = loadWorkflow();
    const [, job] = findNightlyJob(workflow);
    expect(job.if).toBeDefined();
    expect(job.if).toMatch(/schedule/);
  });
});
