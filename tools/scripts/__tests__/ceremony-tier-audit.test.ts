/**
 * In-process tests for tools/scripts/ceremony-tier-audit.ts (issue #579).
 *
 * The CLI runs `main()` at import time and always ends in `process.exit`, so the
 * suite re-imports it per case with `process.argv` set and `process.exit` turned
 * into a throw. Running in-process (not as a child) is what lets V8 coverage see
 * the file. Each case builds a temp repo root with a tiny Sprint_plan.csv and
 * passes it through `--repo-root`.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HEADER = 'Task ID,Status,Description,Target Sprint,Owner,Dependencies,Estimate (O/M/P)';
const ROWS = [
  // proven pattern task the issue is about: completed
  'PG-178,Completed,Module settings playbook original,18,Frontend Dev (STOA-Foundation),,120/240/480',
  // template-following copy: Foundation lane, 1 completed dep, pattern text, 4h
  'PG-182,Backlog,Follows the module-settings playbook pattern,18,Frontend Dev (STOA-Foundation),PG-178,120/240/480',
  // novel work: no pattern reference, 40h
  'PG-950,Backlog,A brand new architectural change,18,Frontend Dev (STOA-Foundation),PG-178,1200/2400/4800',
];

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function makeRepo(opts: { csv?: string | null; tiers?: string } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-audit-'));
  tmpDirs.push(root);
  if (opts.csv !== null) {
    const dir = path.join(root, 'apps', 'project-tracker', 'docs', 'metrics', '_global');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'Sprint_plan.csv'),
      opts.csv ?? [HEADER, ...ROWS].join('\n') + '\n'
    );
  }
  if (opts.tiers) {
    fs.mkdirSync(path.join(root, '.specify', 'memory'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specify', 'memory', 'task-tiers.yaml'), opts.tiers);
  }
  return root;
}

class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

async function runCli(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as never);
  const savedArgv = process.argv;
  process.argv = ['node', 'ceremony-tier-audit.ts', ...args];
  vi.resetModules();
  let code = -1;
  try {
    await import('../ceremony-tier-audit');
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
    code = e.code;
  } finally {
    process.argv = savedArgv;
  }
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('ceremony-tier-audit CLI', () => {
  it('--task --json prints the machine-readable tier for a template-following task', async () => {
    const root = makeRepo();
    const r = await runCli(['--task', 'pg-182', '--json', '--repo-root', root]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed).toMatchObject({ taskId: 'PG-182', tier: 'light', source: 'heuristic' });
    expect(parsed.checks).toHaveLength(4);
  });

  it('--task --json classifies a novel task as full', async () => {
    const root = makeRepo();
    const r = await runCli(['--task', 'PG-950', '--json', '--repo-root', root]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).tier).toBe('full');
  });

  it('--task without --json prints per-check PASS/FAIL lines', async () => {
    const root = makeRepo();
    const r = await runCli(['--task', 'PG-950', '--repo-root', root]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('PG-950: ceremony_tier=full');
    expect(r.out).toMatch(/\[PASS\] lane:/);
    expect(r.out).toMatch(/\[FAIL\] (pattern|size):/);
  });

  it('a manual pin in task-tiers.yaml wins over the heuristic', async () => {
    const root = makeRepo({ tiers: 'overrides:\n  PG-182: full\n' });
    const r = await runCli(['--task', 'PG-182', '--json', '--repo-root', root]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ tier: 'full', source: 'override' });
  });

  it('exits 2 when the requested task is not in Sprint_plan.csv', async () => {
    const root = makeRepo();
    const r = await runCli(['--task', 'PG-404', '--repo-root', root]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('PG-404');
  });

  it('exits 2 when there is no Sprint_plan.csv', async () => {
    const root = makeRepo({ csv: null });
    const r = await runCli(['--repo-root', root]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Could not find Sprint_plan.csv');
  });

  it('exits 2 and lists the errors when the CSV lacks a required header', async () => {
    const root = makeRepo({ csv: 'Foo,Bar\n1,2\n' });
    const r = await runCli(['--repo-root', root]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Missing required CSV header');
  });

  it('--json audits the backlog only (completed tasks are skipped by default)', async () => {
    const root = makeRepo();
    const r = await runCli(['--json', '--repo-root', root]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed.tasks.map((t: { taskId: string }) => t.taskId)).toEqual(['PG-182', 'PG-950']);
    expect(parsed).toMatchObject({ total: 2, light: 1, full: 1 });
  });

  it('--include-completed also classifies completed tasks', async () => {
    const root = makeRepo();
    const r = await runCli(['--json', '--include-completed', '--repo-root', root]);
    expect(JSON.parse(r.out).total).toBe(3);
  });

  it('default run prints the table and writes the report file', async () => {
    const root = makeRepo();
    const r = await runCli(['--repo-root', root]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 task(s) classified');
    expect(r.out).toContain('LIGHT: 1   FULL: 1');
    expect(r.out).toContain('1 task(s) qualify for the LIGHT ceremony');
    const report = JSON.parse(
      fs.readFileSync(path.join(root, 'artifacts', 'reports', 'ceremony-tier-audit.json'), 'utf8')
    );
    expect(report).toMatchObject({ issue: '#579', total: 2, light: 1, full: 1 });
  });

  it('--help prints usage and exits 0 without reading any CSV', async () => {
    const r = await runCli(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Ceremony Tier Audit CLI');
  });
});
