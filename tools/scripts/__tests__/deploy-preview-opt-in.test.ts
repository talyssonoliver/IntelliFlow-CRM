import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

// MVP-007 (2026-11-17, owner: "build only main"): Vercel's free plan allows 100 deployments a day,
// and a preview deploy on every PR push used them up, so production stopped deploying. The post-CI
// preview deploy is now opt-in by the `needs-preview` label. The job still runs and succeeds
// without it, and logs that the deploy was skipped.

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  run?: string;
};
type Job = { name?: string; if?: string; steps: Step[] };
type Workflow = { name: string; on: Record<string, unknown>; jobs: Record<string, Job> };

const FILE = join(__dirname, '../../../.github/workflows/deploy-preview.yml');
const workflow = yaml.load(readFileSync(FILE, 'utf8')) as Workflow;
const job = workflow.jobs['deploy-preview'];
const WANTED = "steps.optin.outputs.deploy == 'true'";
const NOT_WANTED = "steps.optin.outputs.deploy != 'true'";

describe('Deploy Preview: opt-in by label', () => {
  it('keeps the workflow, the job and its name', () => {
    expect(workflow.name).toBe('Deploy Preview');
    expect(job).toBeDefined();
    expect(job.name).toBe('Deploy Preview (post-CI)');
    expect(workflow.on).toHaveProperty('workflow_run');
  });

  it('decides first, from the needs-preview label', () => {
    const first = job.steps[0];
    expect(first.id).toBe('optin');
    expect(first.uses).toMatch(/^actions\/github-script@/);
    expect(first.env?.PREVIEW_LABEL).toBe('needs-preview');
    expect(String(first.with?.script)).toContain("core.setOutput('deploy'");
  });

  it('logs a skip line when the label is missing', () => {
    const skip = job.steps.find((s) => s.if === NOT_WANTED);
    expect(skip).toBeDefined();
    expect(skip!.run).toContain('Preview deploy skipped');
    expect(skip!.run).toContain('needs-preview');
  });

  it('runs every checkout, build, deploy and comment step only with the label', () => {
    const rest = job.steps.slice(1).filter((s) => s.if !== NOT_WANTED);
    expect(rest.length).toBeGreaterThanOrEqual(7);
    for (const step of rest) expect(step.if, step.name ?? step.uses).toBe(WANTED);
  });

  it('gates the vercel deploy itself', () => {
    const deploy = job.steps.find((s) => s.run?.includes('vercel deploy'));
    expect(deploy?.if).toBe(WANTED);
  });

  it('has no step that fails the job when the deploy is skipped', () => {
    const skip = job.steps.find((s) => s.if === NOT_WANTED)!;
    expect(skip.run).not.toMatch(/exit [1-9]/);
  });
});
