/**
 * In-process tests for the light-ceremony waiver in
 * tools/scripts/exec-preflight/check-attestation-provenance.mjs (issue #579).
 *
 * The sibling suite runs the gate as a child process, which V8 coverage cannot
 * see. This one re-imports the gate per case (it runs `main()` at import and
 * ends in `process.exit`, turned here into a throw) with `process.cwd()` pointed
 * at a temp repo root, and stubs `spawnSync` so the tier re-derivation is
 * controlled: the gate must trust only what the classifier says, never the
 * plan or attestation.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (orig) => {
  const actual = await orig<typeof import('node:child_process')>();
  return { ...actual, spawnSync: spawnMock, default: { ...actual, spawnSync: spawnMock } };
});

const MARKER = '<!-- plan-reviewer: subagent -->';
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

interface Case {
  taskId?: string;
  planText: string | null;
  verdict?: string | null;
  /** what the stubbed classifier subprocess returns */
  audit?: { status: number; stdout: string } | 'throws';
}

async function runGate(c: Case): Promise<{ code: number; err: string }> {
  const taskId = c.taskId ?? 'PG-900';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-inproc-'));
  tmpDirs.push(root);
  const base = path.join(root, '.specify', 'sprints', 'sprint-1');
  const attDir = path.join(base, 'attestations', taskId);
  fs.mkdirSync(attDir, { recursive: true });
  fs.mkdirSync(path.join(base, 'planning'), { recursive: true });
  fs.mkdirSync(path.join(base, 'specifications'), { recursive: true });
  const planRel = `.specify/sprints/sprint-1/planning/${taskId}-plan.md`;
  const specRel = `.specify/sprints/sprint-1/specifications/${taskId}-spec.md`;
  if (c.planText !== null) fs.writeFileSync(path.join(root, planRel), c.planText);
  fs.writeFileSync(path.join(root, specRel), '# spec\n');
  const att: Record<string, unknown> = {
    spec_session_consensus: 'UNANIMOUS: agreed',
    spec_path: specRel,
    plan_path: planRel,
  };
  if (c.verdict !== null && c.verdict !== undefined) att.plan_reviewer_verdict = c.verdict;
  fs.writeFileSync(path.join(attDir, 'attestation.json'), JSON.stringify(att));

  if (c.audit === 'throws') {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });
  } else {
    spawnMock.mockReturnValue(c.audit ?? { status: 0, stdout: JSON.stringify({ tier: 'light' }) });
  }

  const err: string[] = [];
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
    err.push(String(s));
    return true;
  }) as never);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as never);
  const savedArgv = process.argv;
  process.argv = ['node', 'check-attestation-provenance.mjs', taskId, '1'];
  vi.resetModules();
  let code = -1;
  try {
    // @ts-expect-error plain .mjs, no type declarations
    await import('../exec-preflight/check-attestation-provenance.mjs');
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
    code = e.code;
  } finally {
    process.argv = savedArgv;
  }
  return { code, err: err.join('') };
}

const LIGHT_PLAN = '# Plan\n\nceremony_tier: light\nPlan-Reviewer skipped by design.\n';

describe('provenance gate: light ceremony waiver', () => {
  it('waives the Plan-Reviewer when the plan says light and the classifier agrees', async () => {
    const r = await runGate({ planText: LIGHT_PLAN, verdict: null });
    expect(r.code).toBe(0);
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it('BLOCKs when the plan claims light but the classifier says full', async () => {
    const r = await runGate({
      planText: LIGHT_PLAN,
      verdict: null,
      audit: { status: 0, stdout: JSON.stringify({ tier: 'full' }) },
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('classify PG-900 as full');
  });

  it('treats a classifier failure as full (fail closed)', async () => {
    const r = await runGate({
      planText: LIGHT_PLAN,
      verdict: null,
      audit: { status: 1, stdout: '' },
    });
    expect(r.code).toBe(1);
  });

  it('treats unparseable classifier output as full', async () => {
    const r = await runGate({
      planText: LIGHT_PLAN,
      verdict: null,
      audit: { status: 0, stdout: 'not json' },
    });
    expect(r.code).toBe(1);
  });

  it('treats a throwing classifier as full', async () => {
    const r = await runGate({ planText: LIGHT_PLAN, verdict: null, audit: 'throws' });
    expect(r.code).toBe(1);
  });

  it('never waives a plan that creates a page.tsx, even if classified light', async () => {
    const r = await runGate({
      planText: LIGHT_PLAN + 'Create apps/web/src/app/settings/foo/page.tsx\n',
      verdict: null,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('creates a page.tsx');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not waive when the plan does not record ceremony_tier: light', async () => {
    const r = await runGate({ planText: '# Plan\n\nno tier line\n', verdict: null });
    expect(r.code).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not waive when the plan carries the subagent marker (normal path needs a verdict)', async () => {
    const r = await runGate({ planText: LIGHT_PLAN + MARKER + '\n', verdict: null });
    expect(r.code).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not waive when a verdict was claimed: REJECTED still BLOCKs', async () => {
    const r = await runGate({ planText: LIGHT_PLAN, verdict: 'REJECTED' });
    expect(r.code).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('a normal affirmative verdict with the marker still passes without any classification', async () => {
    const r = await runGate({ planText: '# Plan\n' + MARKER + '\n', verdict: 'APPROVED' });
    expect(r.code).toBe(0);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
