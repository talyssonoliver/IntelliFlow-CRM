/**
 * Tests for tools/scripts/exec-preflight/check-attestation-provenance.mjs
 *
 * The provenance gate runs POST-attestation. It reads a task's attestation.json
 * and BLOCKs (exit 1) when the provenance block is missing-on-a-mandatory-task,
 * non-affirmative, or NOT cross-validated against the on-disk plan/spec files.
 *
 * Each case writes a temp repo root with the .specify tree and runs the gate as
 * a child process with cwd = tempRoot (the gate uses process.cwd() as REPO_ROOT)
 * and an explicit sprint arg (so no Sprint_plan.csv is needed).
 *
 * Maps spec AC-006 / NF-002: NP-1..NP-7 + happy + non-UI exemption + abs-path + usage.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GATE = path.join(
  ROOT,
  'tools',
  'scripts',
  'exec-preflight',
  'check-attestation-provenance.mjs'
);
const MARKER = '<!-- plan-reviewer: subagent -->';

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

interface CaseOpts {
  taskId: string;
  sprint?: number;
  /** provenance object to merge into attestation.json; null = omit all provenance */
  provenance?: Record<string, unknown> | null;
  /** write a plan file containing the marker (default true when provenance present) */
  planFile?: 'with-marker' | 'no-marker' | 'absent';
  /** write a spec file (default true when provenance present) */
  specFile?: boolean;
  /** skip writing attestation.json entirely */
  noAttestation?: boolean;
}

/** Build the fixture, run the gate, return exit code. */
function run(opts: CaseOpts): number {
  const { taskId, sprint = 1 } = opts;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  tmpDirs.push(root);
  const base = path.join(root, '.specify', 'sprints', `sprint-${sprint}`);
  const attDir = path.join(base, 'attestations', taskId);
  const planDir = path.join(base, 'planning');
  const specDir = path.join(base, 'specifications');
  fs.mkdirSync(attDir, { recursive: true });
  fs.mkdirSync(planDir, { recursive: true });
  fs.mkdirSync(specDir, { recursive: true });

  const relPlan = `.specify/sprints/sprint-${sprint}/planning/${taskId}-plan.md`;
  const relSpec = `.specify/sprints/sprint-${sprint}/specifications/${taskId}-spec.md`;

  const planMode = opts.planFile ?? (opts.provenance ? 'with-marker' : 'absent');
  if (planMode !== 'absent') {
    fs.writeFileSync(
      path.join(planDir, `${taskId}-plan.md`),
      `# Plan ${taskId}\n\n## Plan-Reviewer Sign-off\n${planMode === 'with-marker' ? MARKER : 'self-review only'}\n`
    );
  }
  if (opts.specFile ?? Boolean(opts.provenance)) {
    fs.writeFileSync(path.join(specDir, `${taskId}-spec.md`), `# Spec ${taskId}\n`);
  }

  if (!opts.noAttestation) {
    const att: Record<string, unknown> = {
      schema_version: '1.0.0',
      task_id: taskId,
      attestor: 'Claude Code',
      attestation_timestamp: '2026-06-30T14:00:00Z',
      verdict: 'COMPLETE',
      ...(opts.provenance ?? {}),
    };
    fs.writeFileSync(path.join(attDir, 'attestation.json'), JSON.stringify(att, null, 2));
  }

  const res = spawnSync('node', [GATE, taskId, String(sprint)], { encoding: 'utf8', cwd: root });
  return res.status ?? -1;
}

/** A fully valid provenance block referencing the fixture's plan/spec paths. */
function validProvenance(taskId: string, sprint = 1) {
  return {
    spec_session_consensus: 'UNANIMOUS — design agreed by 3 personas',
    plan_reviewer_verdict: 'APPROVED',
    plan_reviewer_agent: `plan-reviewer-${taskId}`,
    plan_reviewer_marker: 'plan-reviewer: subagent',
    spec_path: `.specify/sprints/sprint-${sprint}/specifications/${taskId}-spec.md`,
    plan_path: `.specify/sprints/sprint-${sprint}/planning/${taskId}-plan.md`,
  };
}

describe('check-attestation-provenance', () => {
  it('happy path: full valid provenance + plan marker → exit 0', () => {
    expect(run({ taskId: 'IFC-900', provenance: validProvenance('IFC-900') })).toBe(0);
  });

  it('NP-1: empty plan_reviewer_verdict → BLOCK', () => {
    expect(
      run({
        taskId: 'IFC-901',
        provenance: { ...validProvenance('IFC-901'), plan_reviewer_verdict: '' },
      })
    ).toBe(1);
  });

  it('NP-1b: empty spec_session_consensus → BLOCK', () => {
    expect(
      run({
        taskId: 'IFC-902',
        provenance: { ...validProvenance('IFC-902'), spec_session_consensus: '' },
      })
    ).toBe(1);
  });

  it('NP-2: REJECTED verdict → BLOCK', () => {
    expect(
      run({
        taskId: 'IFC-903',
        provenance: { ...validProvenance('IFC-903'), plan_reviewer_verdict: 'REJECTED' },
      })
    ).toBe(1);
  });

  it('NP-2b: PENDING (non-enum) verdict → BLOCK', () => {
    expect(
      run({
        taskId: 'IFC-904',
        provenance: { ...validProvenance('IFC-904'), plan_reviewer_verdict: 'PENDING' },
      })
    ).toBe(1);
  });

  it('NP-3: plan_path absent on a UI task → BLOCK', () => {
    const p = validProvenance('PG-905') as Record<string, unknown>;
    delete p.plan_path;
    expect(run({ taskId: 'PG-905', provenance: p })).toBe(1);
  });

  it('NP-4: plan_path set but file missing → BLOCK', () => {
    expect(
      run({ taskId: 'IFC-906', provenance: validProvenance('IFC-906'), planFile: 'absent' })
    ).toBe(1);
  });

  it('NP-5: plan_path file present but no marker (self-review case) → BLOCK', () => {
    expect(
      run({ taskId: 'IFC-907', provenance: validProvenance('IFC-907'), planFile: 'no-marker' })
    ).toBe(1);
  });

  it('NP-6: spec_path set but file missing → BLOCK', () => {
    expect(
      run({ taskId: 'IFC-908', provenance: validProvenance('IFC-908'), specFile: false })
    ).toBe(1);
  });

  it('NP-7: spec_session_consensus = SKIPPED → BLOCK', () => {
    expect(
      run({
        taskId: 'IFC-909',
        provenance: { ...validProvenance('IFC-909'), spec_session_consensus: 'SKIPPED' },
      })
    ).toBe(1);
  });

  it('APPROVED_WITH_CHANGES is affirmative → exit 0', () => {
    expect(
      run({
        taskId: 'IFC-910',
        provenance: {
          ...validProvenance('IFC-910'),
          plan_reviewer_verdict: 'APPROVED_WITH_CHANGES',
        },
      })
    ).toBe(0);
  });

  it('non-UI task, provenance absent → exit 0 (WARN exemption)', () => {
    expect(run({ taskId: 'AUTOMATION-999', provenance: null })).toBe(0);
  });

  it('UI task, provenance absent → BLOCK', () => {
    expect(run({ taskId: 'PG-998', provenance: null })).toBe(1);
  });

  it('absolute plan_path → BLOCK (no path leak)', () => {
    expect(
      run({
        taskId: 'IFC-911',
        provenance: { ...validProvenance('IFC-911'), plan_path: 'C:/Users/x/plan.md' },
      })
    ).toBe(1);
  });

  it('missing attestation file → exit 0 (WARN; existence enforced elsewhere)', () => {
    expect(run({ taskId: 'IFC-912', noAttestation: true })).toBe(0);
  });

  it('usage error (no task id) → exit 2', () => {
    const res = spawnSync('node', [GATE], { encoding: 'utf8', cwd: ROOT });
    expect(res.status).toBe(2);
  });
});
