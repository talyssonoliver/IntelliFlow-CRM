import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateTaskContract,
  checkDuplicateLease,
  validateContractWithLeaseCheck,
  type TaskContract,
  type LeaseRecord,
} from '../validate-task-contract.js';
import {
  verifyDispatchBinding,
  resolveCurrentBranch,
  parseArgs,
  runBindingCli,
  type BindingCheckInput,
} from '../verify-dispatch-binding.js';
import { runValidateCli } from '../validate-task-contract.js';

// ─── Fixture: minimal valid contract ─────────────────────────────────────────

function makeValidContract(overrides: Partial<Record<string, unknown>> = {}): TaskContract {
  return {
    taskId: 'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
    approvedOutcome: 'Deliver task-contract JSON schema + dispatch-binding guard',
    acceptanceCriteria: [
      'JSON Schema covers all 20 fields',
      'Validator rejects invalid contracts',
      'Guard exits 0 on valid binding',
    ],
    baselineMainSha: '1810a937137adf4b8410eac1719500ea3558ac3b',
    specHash: 'abc123def456',
    policyVersion: 'ADR-070-v1',
    dependencySnapshot: 'pnpm-lock.yaml@1810a937',
    riskClass: 'Low',
    priority: 'high',
    estimatedEffort: '4/8/16',
    timeBudget: '4h',
    retryBudget: 1,
    validationProfile: 'scoped-unit-tests-only',
    expectedArtifacts: [
      'tools/scripts/orchestration/schemas/task-contract.schema.json',
      'tools/scripts/orchestration/validate-task-contract.ts',
    ],
    branch: 'fix/orch-002-task-contract-and-dispatch-guard',
    worktree: '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
    agentLeaseId: 'local_28109fae',
    leaseExpiry: '2026-07-26T22:00:00Z',
    allowedMutationScope: [
      '.specify/sprints/sprint-19/spec/AUTOMATION-004/**',
      'tools/scripts/orchestration/**',
      'docs/architecture/adr/ADR-070*.md',
    ],
    humanEscalationConditions: [
      'any Category C decision surfaces',
      'any gate failure exceeding retryBudget',
    ],
    ...overrides,
  } as TaskContract;
}

// ─── validateTaskContract — happy path ───────────────────────────────────────

describe('validateTaskContract — valid contract', () => {
  it('accepts a fully valid contract', () => {
    const result = validateTaskContract(makeValidContract());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts acceptanceCriteria as a single string', () => {
    const result = validateTaskContract(
      makeValidContract({ acceptanceCriteria: 'All 20 fields validated; guard exits 0' })
    );
    expect(result.valid).toBe(true);
  });

  it('accepts validationProfile as a string', () => {
    const result = validateTaskContract(makeValidContract({ validationProfile: 'full-preship' }));
    expect(result.valid).toBe(true);
  });

  it('accepts humanEscalationConditions as a string', () => {
    const result = validateTaskContract(
      makeValidContract({ humanEscalationConditions: 'any Category C decision' })
    );
    expect(result.valid).toBe(true);
  });

  it('accepts all valid riskClass values', () => {
    for (const rc of ['Low', 'Medium', 'High', 'Critical'] as const) {
      const result = validateTaskContract(makeValidContract({ riskClass: rc }));
      expect(result.valid, `riskClass: ${rc}`).toBe(true);
    }
  });

  it('accepts all valid priority values', () => {
    for (const p of ['low', 'medium', 'high', 'critical'] as const) {
      const result = validateTaskContract(makeValidContract({ priority: p }));
      expect(result.valid, `priority: ${p}`).toBe(true);
    }
  });

  it('accepts timeBudget in minutes, hours, and days', () => {
    for (const tb of ['30m', '2h', '1d', '90m', '48h']) {
      const result = validateTaskContract(makeValidContract({ timeBudget: tb }));
      expect(result.valid, `timeBudget: ${tb}`).toBe(true);
    }
  });

  it('accepts retryBudget of 0', () => {
    const result = validateTaskContract(makeValidContract({ retryBudget: 0 }));
    expect(result.valid).toBe(true);
  });

  it('accepts abbreviated baselineMainSha (7 chars)', () => {
    const result = validateTaskContract(makeValidContract({ baselineMainSha: '1810a93' }));
    expect(result.valid).toBe(true);
  });
});

// ─── validateTaskContract — missing fields ────────────────────────────────────

describe('validateTaskContract — missing required fields', () => {
  const REQUIRED_FIELDS = [
    'taskId',
    'approvedOutcome',
    'acceptanceCriteria',
    'baselineMainSha',
    'specHash',
    'policyVersion',
    'dependencySnapshot',
    'riskClass',
    'priority',
    'estimatedEffort',
    'timeBudget',
    'retryBudget',
    'validationProfile',
    'expectedArtifacts',
    'branch',
    'worktree',
    'agentLeaseId',
    'leaseExpiry',
    'allowedMutationScope',
    'humanEscalationConditions',
  ] as const;

  for (const field of REQUIRED_FIELDS) {
    it(`rejects contract missing '${field}'`, () => {
      const contract = makeValidContract();

      delete (contract as any)[field];
      const result = validateTaskContract(contract);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === field)).toBe(true);
    });
  }

  it('rejects null (non-object) contract', () => {
    const result = validateTaskContract(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('(root)');
  });

  it('rejects array contract', () => {
    const result = validateTaskContract([]);
    expect(result.valid).toBe(false);
  });

  it('rejects string contract', () => {
    const result = validateTaskContract('not a contract');
    expect(result.valid).toBe(false);
  });
});

// ─── validateTaskContract — wrong-type fields ─────────────────────────────────

describe('validateTaskContract — wrong-type fields', () => {
  it('rejects riskClass not in enum', () => {
    const result = validateTaskContract(makeValidContract({ riskClass: 'low' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'riskClass')).toBe(true);
  });

  it('rejects priority not in enum', () => {
    const result = validateTaskContract(makeValidContract({ priority: 'HIGH' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'priority')).toBe(true);
  });

  it('rejects retryBudget as negative integer', () => {
    const result = validateTaskContract(makeValidContract({ retryBudget: -1 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'retryBudget')).toBe(true);
  });

  it('rejects retryBudget as float', () => {
    const result = validateTaskContract(makeValidContract({ retryBudget: 1.5 }));
    expect(result.valid).toBe(false);
  });

  it('rejects retryBudget as string', () => {
    const result = validateTaskContract(makeValidContract({ retryBudget: '2' }));
    expect(result.valid).toBe(false);
  });

  it('rejects timeBudget without unit suffix', () => {
    const result = validateTaskContract(makeValidContract({ timeBudget: '2' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'timeBudget')).toBe(true);
  });

  it('rejects timeBudget with unsupported unit', () => {
    const result = validateTaskContract(makeValidContract({ timeBudget: '2s' }));
    expect(result.valid).toBe(false);
  });

  it('rejects baselineMainSha with uppercase chars', () => {
    const result = validateTaskContract(makeValidContract({ baselineMainSha: '1810A937' }));
    expect(result.valid).toBe(false);
  });

  it('rejects baselineMainSha shorter than 7 chars', () => {
    const result = validateTaskContract(makeValidContract({ baselineMainSha: 'abc12' }));
    expect(result.valid).toBe(false);
  });

  it('rejects leaseExpiry without timezone', () => {
    const result = validateTaskContract(makeValidContract({ leaseExpiry: '2026-07-26T22:00:00' }));
    expect(result.valid).toBe(false);
  });

  it('rejects leaseExpiry as date-only string', () => {
    const result = validateTaskContract(makeValidContract({ leaseExpiry: '2026-07-26' }));
    expect(result.valid).toBe(false);
  });

  it('rejects expectedArtifacts as empty array', () => {
    const result = validateTaskContract(makeValidContract({ expectedArtifacts: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects allowedMutationScope as empty array', () => {
    const result = validateTaskContract(makeValidContract({ allowedMutationScope: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects taskId that does not match the pattern', () => {
    const result = validateTaskContract(makeValidContract({ taskId: 'orch-002' }));
    expect(result.valid).toBe(false);
  });

  it('rejects branch with spaces', () => {
    const result = validateTaskContract(makeValidContract({ branch: 'fix/ bad branch' }));
    expect(result.valid).toBe(false);
  });

  it('rejects empty approvedOutcome string', () => {
    const result = validateTaskContract(makeValidContract({ approvedOutcome: '   ' }));
    expect(result.valid).toBe(false);
  });
});

// ─── checkDuplicateLease ─────────────────────────────────────────────────────

describe('checkDuplicateLease', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLeases(dir: string, records: LeaseRecord[]): string {
    const filePath = path.join(dir, 'active-leases.jsonl');
    fs.writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return filePath;
  }

  it('returns false when leases file does not exist', () => {
    expect(checkDuplicateLease('any-lease-id', path.join(tmpDir, 'nonexistent.jsonl'))).toBe(false);
  });

  it('returns false when lease file is empty', () => {
    const p = path.join(tmpDir, 'leases.jsonl');
    fs.writeFileSync(p, '');
    expect(checkDuplicateLease('my-lease', p)).toBe(false);
  });

  it('returns true when the same agentLeaseId is active', () => {
    const p = writeLeases(tmpDir, [
      {
        agentLeaseId: 'local_abc123',
        taskId: 'IFC-001',
        acquiredAt: '2026-07-26T10:00:00Z',
        status: 'active',
      },
    ]);
    expect(checkDuplicateLease('local_abc123', p)).toBe(true);
  });

  it('returns false when same leaseId is released', () => {
    const p = writeLeases(tmpDir, [
      {
        agentLeaseId: 'local_abc123',
        taskId: 'IFC-001',
        acquiredAt: '2026-07-26T10:00:00Z',
        status: 'released',
      },
    ]);
    expect(checkDuplicateLease('local_abc123', p)).toBe(false);
  });

  it('returns false when same leaseId is expired', () => {
    const p = writeLeases(tmpDir, [
      {
        agentLeaseId: 'local_abc123',
        taskId: 'IFC-001',
        acquiredAt: '2026-07-26T10:00:00Z',
        status: 'expired',
      },
    ]);
    expect(checkDuplicateLease('local_abc123', p)).toBe(false);
  });

  it('returns false when different leaseId is active', () => {
    const p = writeLeases(tmpDir, [
      {
        agentLeaseId: 'local_xyz',
        taskId: 'IFC-002',
        acquiredAt: '2026-07-26T11:00:00Z',
        status: 'active',
      },
    ]);
    expect(checkDuplicateLease('local_abc123', p)).toBe(false);
  });

  it('skips malformed JSONL lines without throwing', () => {
    const p = path.join(tmpDir, 'leases.jsonl');
    fs.writeFileSync(p, 'not-json\n{"agentLeaseId":"local_abc123","status":"active"}\n');
    expect(checkDuplicateLease('local_abc123', p)).toBe(true);
  });
});

// ─── validateContractWithLeaseCheck — duplicate-lease rejection ───────────────

describe('validateContractWithLeaseCheck — duplicate lease', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects valid contract when agentLeaseId is already active', () => {
    const leasesPath = path.join(tmpDir, 'active-leases.jsonl');
    const lease: LeaseRecord = {
      agentLeaseId: 'local_28109fae',
      taskId: 'ORCH-001',
      acquiredAt: '2026-07-26T09:00:00Z',
      status: 'active',
    };
    fs.writeFileSync(leasesPath, JSON.stringify(lease) + '\n');

    const result = validateContractWithLeaseCheck(makeValidContract(), leasesPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'agentLeaseId')).toBe(true);
    expect(result.errors[0].message).toMatch(/duplicate active lease/);
  });

  it('accepts valid contract with no prior leases file', () => {
    const result = validateContractWithLeaseCheck(
      makeValidContract(),
      path.join(tmpDir, 'no-such-file.jsonl')
    );
    expect(result.valid).toBe(true);
  });

  it('does not check lease if contract itself is invalid', () => {
    const leasesPath = path.join(tmpDir, 'active-leases.jsonl');
    const lease: LeaseRecord = {
      agentLeaseId: 'local_28109fae',
      taskId: 'ORCH-001',
      acquiredAt: '2026-07-26T09:00:00Z',
      status: 'active',
    };
    fs.writeFileSync(leasesPath, JSON.stringify(lease) + '\n');

    const badContract = makeValidContract({ retryBudget: -5 });
    const result = validateContractWithLeaseCheck(badContract, leasesPath);
    // Should fail on retryBudget, not on lease check
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'retryBudget')).toBe(true);
    // Lease error should NOT be present (short-circuit on invalid contract)
    expect(result.errors.some((e) => e.field === 'agentLeaseId')).toBe(false);
  });
});

// ─── verifyDispatchBinding ────────────────────────────────────────────────────

describe('verifyDispatchBinding', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-binding-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeContract(dir: string, overrides: Partial<Record<string, unknown>> = {}): string {
    const contract = {
      taskId: 'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
      agentLeaseId: 'local_28109fae',
      branch: 'fix/orch-002-task-contract-and-dispatch-guard',
      worktree: '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
      ...overrides,
    };
    const p = path.join(dir, 'contract.json');
    fs.writeFileSync(p, JSON.stringify(contract));
    return p;
  }

  const validInput = (): BindingCheckInput => ({
    contractPath: '', // set per test
    intendedTaskId: 'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
    sessionId: 'local_28109fae',
    branch: 'fix/orch-002-task-contract-and-dispatch-guard',
    worktree: '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
  });

  it('returns ok=true when all 4 dimensions match', () => {
    const contractPath = writeContract(tmpDir);
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('returns ok=false with mismatch on taskId', () => {
    const contractPath = writeContract(tmpDir, { taskId: 'DIFFERENT-TASK' });
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.dimension === 'taskId')).toBe(true);
  });

  it('returns ok=false with mismatch on agentLeaseId / sessionId', () => {
    const contractPath = writeContract(tmpDir, { agentLeaseId: 'local_other_session' });
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.dimension === 'agentLeaseId')).toBe(true);
  });

  it('returns ok=false with mismatch on branch', () => {
    const contractPath = writeContract(tmpDir, { branch: 'main' });
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.dimension === 'branch')).toBe(true);
  });

  it('returns ok=false with mismatch on worktree', () => {
    const contractPath = writeContract(tmpDir, {
      worktree: '/c/Users/talys/projects/wrong-worktree',
    });
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.dimension === 'worktree')).toBe(true);
  });

  it('normalises Windows backslash paths in worktree comparison', () => {
    const contractPath = writeContract(tmpDir, {
      worktree: 'C:\\Users\\talys\\projects\\iflow-orch-002-contract-and-guard',
    });
    const result = verifyDispatchBinding({
      ...validInput(),
      contractPath,
      worktree: 'C:/Users/talys/projects/iflow-orch-002-contract-and-guard',
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with all 4 mismatches when contract is completely wrong', () => {
    const contractPath = writeContract(tmpDir, {
      taskId: 'WRONG-TASK',
      agentLeaseId: 'wrong_session',
      branch: 'wrong-branch',
      worktree: '/wrong/path',
    });
    const result = verifyDispatchBinding({ ...validInput(), contractPath });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(4);
  });

  it('returns ok=false when contract file does not exist', () => {
    const result = verifyDispatchBinding({
      ...validInput(),
      contractPath: path.join(tmpDir, 'nonexistent.json'),
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches[0].dimension).toBe('taskId');
    expect(result.mismatches[0].actual).toMatch(/Error reading/);
  });
});

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('returns null when --contract is missing', () => {
    expect(
      parseArgs(['--task-id', 'ORCH-002', '--session-id', 's1', '--branch', 'fix/x'])
    ).toBeNull();
  });

  it('returns null when --task-id is missing', () => {
    expect(
      parseArgs(['--contract', 'c.json', '--session-id', 's1', '--branch', 'fix/x'])
    ).toBeNull();
  });

  it('returns null when --session-id is missing', () => {
    expect(
      parseArgs(['--contract', 'c.json', '--task-id', 'ORCH-002', '--branch', 'fix/x'])
    ).toBeNull();
  });

  it('returns null when --branch is missing', () => {
    expect(
      parseArgs(['--contract', 'c.json', '--task-id', 'ORCH-002', '--session-id', 's1'])
    ).toBeNull();
  });

  it('returns parsed input with all required args', () => {
    const result = parseArgs([
      '--contract',
      'c.json',
      '--task-id',
      'ORCH-002',
      '--session-id',
      'local_abc',
      '--branch',
      'fix/orch-002',
    ]);
    expect(result).not.toBeNull();
    expect(result?.contractPath).toBe('c.json');
    expect(result?.intendedTaskId).toBe('ORCH-002');
    expect(result?.sessionId).toBe('local_abc');
    expect(result?.branch).toBe('fix/orch-002');
  });

  it('uses --worktree when provided', () => {
    const result = parseArgs([
      '--contract',
      'c.json',
      '--task-id',
      'ORCH-002',
      '--session-id',
      's1',
      '--branch',
      'fix/x',
      '--worktree',
      '/custom/path',
    ]);
    expect(result?.worktree).toBe('/custom/path');
  });

  it('falls back to CWD when --worktree is absent', () => {
    const result = parseArgs([
      '--contract',
      'c.json',
      '--task-id',
      'ORCH-002',
      '--session-id',
      's1',
      '--branch',
      'fix/x',
    ]);
    // Worktree should be set (either CWD or normalised CWD)
    expect(typeof result?.worktree).toBe('string');
    expect(result?.worktree.length).toBeGreaterThan(0);
  });
});

// ─── resolveCurrentBranch ─────────────────────────────────────────────────────

describe('resolveCurrentBranch', () => {
  it('returns trimmed branch name when execFn succeeds', () => {
    const branch = resolveCurrentBranch('/some/path', () => 'fix/orch-002\n');
    expect(branch).toBe('fix/orch-002');
  });

  it('returns null when execFn throws', () => {
    const branch = resolveCurrentBranch('/not-a-git-repo', () => {
      throw new Error('not a git repo');
    });
    expect(branch).toBeNull();
  });

  it('returns branch without trailing newlines', () => {
    const branch = resolveCurrentBranch('/path', () => 'main\r\n');
    expect(branch).toBe('main');
  });
});

// ─── runValidateCli ───────────────────────────────────────────────────────────

describe('runValidateCli', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcli-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeIO(): {
    out: string;
    err: string;
    exitCode: number;
    io: Parameters<typeof runValidateCli>[1];
  } {
    let out = '';
    let err = '';
    let exitCode = -1;
    const io: Parameters<typeof runValidateCli>[1] = {
      stdout: (s) => {
        out += s;
      },
      stderr: (s) => {
        err += s;
      },
      exit: (code) => {
        exitCode = code;
        throw new Error(`__exit__${code}`);
      },
    };
    return {
      get out() {
        return out;
      },
      get err() {
        return err;
      },
      get exitCode() {
        return exitCode;
      },
      io,
    };
  }

  function runCli(args: string[]): ReturnType<typeof makeIO> {
    const state = makeIO();
    try {
      runValidateCli(args, state.io);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
    return state;
  }

  it('exits 1 with usage when --contract is missing', () => {
    const s = runCli([]);
    expect(s.exitCode).toBe(1);
    expect(s.err).toMatch(/Usage/);
  });

  it('exits 1 when contract file does not exist', () => {
    const s = runCli(['--contract', path.join(tmpDir, 'no.json')]);
    expect(s.exitCode).toBe(1);
    expect(s.err).toMatch(/Error reading/);
  });

  it('exits 1 when contract has missing fields', () => {
    const p = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(p, JSON.stringify({ taskId: 'ORCH-002' }));
    const s = runCli(['--contract', p]);
    expect(s.exitCode).toBe(1);
    expect(s.err).toMatch(/INVALID/);
  });

  it('exits 0 when contract is valid', () => {
    const p = path.join(tmpDir, 'good.json');
    fs.writeFileSync(p, JSON.stringify(makeValidContract()));
    const s = runCli(['--contract', p]);
    expect(s.exitCode).toBe(0);
    expect(s.out).toMatch(/valid/);
  });

  it('exits 1 when contract JSON is malformed', () => {
    const p = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(p, 'not-json');
    const s = runCli(['--contract', p]);
    expect(s.exitCode).toBe(1);
  });
});

// ─── runBindingCli ────────────────────────────────────────────────────────────

describe('runBindingCli', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcli-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeIO(): {
    out: string;
    err: string;
    exitCode: number;
    io: Parameters<typeof runBindingCli>[1];
  } {
    let out = '';
    let err = '';
    let exitCode = -1;
    const io: Parameters<typeof runBindingCli>[1] = {
      stdout: (s) => {
        out += s;
      },
      stderr: (s) => {
        err += s;
      },
      exit: (code) => {
        exitCode = code;
        throw new Error(`__exit__${code}`);
      },
    };
    return {
      get out() {
        return out;
      },
      get err() {
        return err;
      },
      get exitCode() {
        return exitCode;
      },
      io,
    };
  }

  function runCli(args: string[]): ReturnType<typeof makeIO> {
    const state = makeIO();
    try {
      runBindingCli(args, state.io);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
    return state;
  }

  function writeContract(overrides: Partial<Record<string, unknown>> = {}): string {
    const c = {
      taskId: 'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
      agentLeaseId: 'local_28109fae',
      branch: 'fix/orch-002-task-contract-and-dispatch-guard',
      worktree: '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
      ...overrides,
    };
    const p = path.join(tmpDir, 'contract.json');
    fs.writeFileSync(p, JSON.stringify(c));
    return p;
  }

  it('exits 1 with usage when required args are missing', () => {
    const s = runCli([]);
    expect(s.exitCode).toBe(1);
    expect(s.err).toMatch(/Usage/);
  });

  it('exits 0 and prints confirmation when binding is valid', () => {
    const p = writeContract();
    const s = runCli([
      '--contract',
      p,
      '--task-id',
      'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
      '--session-id',
      'local_28109fae',
      '--branch',
      'fix/orch-002-task-contract-and-dispatch-guard',
      '--worktree',
      '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
    ]);
    expect(s.exitCode).toBe(0);
    expect(s.out).toMatch(/verified/);
  });

  it('exits 1 and prints mismatches when binding fails', () => {
    const p = writeContract({ taskId: 'WRONG-TASK' });
    const s = runCli([
      '--contract',
      p,
      '--task-id',
      'AUTOMATION-004-task-contract-schema-and-dispatch-guard',
      '--session-id',
      'local_28109fae',
      '--branch',
      'fix/orch-002-task-contract-and-dispatch-guard',
      '--worktree',
      '/c/Users/talys/projects/iflow-orch-002-contract-and-guard',
    ]);
    expect(s.exitCode).toBe(1);
    expect(s.err).toMatch(/FAILED/);
    expect(s.err).toMatch(/STOP/);
  });
});
