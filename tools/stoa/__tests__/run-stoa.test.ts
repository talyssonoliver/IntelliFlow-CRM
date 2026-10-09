import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  loadAuditMatrix: vi.fn(),
  getToolById: vi.fn(),
  loadTaskFromCsv: vi.fn(),
  runGates: vi.fn(),
  summarizeGateResults: vi.fn(),
  generateRunId: vi.fn(),
  getEvidenceDir: vi.fn(),
  ensureEvidenceDirs: vi.fn(),
  createWaiverRecord: vi.fn(),
  saveWaivers: vi.fn(),
  generateStoaVerdict: vi.fn(),
  writeStoaVerdict: vi.fn(),
  isStrictMode: vi.fn(),
  log: vi.fn(),
  logHeader: vi.fn(),
  logSection: vi.fn(),
  findRepoRoot: vi.fn(),
}));

vi.mock('../../scripts/lib/stoa/gate-selection.js', () => ({
  loadAuditMatrix: m.loadAuditMatrix,
  getToolById: m.getToolById,
  selectGates: vi.fn(),
}));
vi.mock('../../scripts/lib/stoa/orchestrator.js', () => ({ loadTaskFromCsv: m.loadTaskFromCsv }));
vi.mock('../../scripts/lib/stoa/stoa-assignment.js', () => ({ assignStoas: vi.fn() }));
vi.mock('../../scripts/lib/stoa/gate-runner.js', () => ({
  runGates: m.runGates,
  summarizeGateResults: m.summarizeGateResults,
}));
vi.mock('../../scripts/lib/stoa/evidence.js', () => ({
  generateRunId: m.generateRunId,
  getEvidenceDir: m.getEvidenceDir,
  ensureEvidenceDirs: m.ensureEvidenceDirs,
}));
vi.mock('../../scripts/lib/stoa/waiver.js', () => ({
  createWaiverRecord: m.createWaiverRecord,
  saveWaivers: m.saveWaivers,
}));
vi.mock('../../scripts/lib/stoa/verdict.js', () => ({
  generateStoaVerdict: m.generateStoaVerdict,
  writeStoaVerdict: m.writeStoaVerdict,
}));
vi.mock('../../scripts/lib/validation-utils.js', () => ({
  isStrictMode: m.isStrictMode,
  log: m.log,
  logHeader: m.logHeader,
  logSection: m.logSection,
  findRepoRoot: m.findRepoRoot,
}));

import {
  STOA_GATE_PROFILES,
  main,
  parseArgs,
  runStoa,
  showHelp,
  type CliArgs,
} from '../run-stoa.js';

type Tool = { enabled: boolean; required: boolean; requires_env?: string[] };

const ENV_VAR = 'RUN_STOA_TEST_ENV_VAR';

function logged(): string[] {
  return m.log.mock.calls.map((c) => c[0] as string);
}

function setTools(tools: Record<string, Tool | undefined>): void {
  m.getToolById.mockImplementation((_matrix: unknown, id: string) => tools[id]);
}

function baseArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    stoa: 'Intelligence',
    taskId: 'T-1',
    runId: 'run-1',
    dryRun: false,
    strictMode: false,
    ...overrides,
  };
}

let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
const originalArgv = process.argv;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[ENV_VAR];
  m.findRepoRoot.mockReturnValue('/repo');
  m.isStrictMode.mockReturnValue(false);
  m.generateRunId.mockReturnValue('generated-run');
  m.loadTaskFromCsv.mockReturnValue({ targetSprint: '7' });
  m.getEvidenceDir.mockReturnValue('/evidence');
  m.ensureEvidenceDirs.mockResolvedValue(undefined);
  m.loadAuditMatrix.mockReturnValue({ tools: [] });
  m.runGates.mockResolvedValue([]);
  m.summarizeGateResults.mockReturnValue({ passed: 1, total: 1, failedGates: [] });
  m.createWaiverRecord.mockImplementation((id: string) => ({ toolId: id, reason: 'why' }));
  m.saveWaivers.mockResolvedValue(undefined);
  m.generateStoaVerdict.mockReturnValue({ verdict: 'PASS', rationale: 'ok' });
  m.writeStoaVerdict.mockReturnValue('/evidence/verdict.json');
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('returns null when stoa or task id is missing', () => {
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(['foundation'])).toBeNull();
  });

  it('rejects an unknown STOA and lists valid ones', () => {
    expect(parseArgs(['bogus', 'T-1'])).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('Unknown STOA: bogus');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('foundation, security'));
  });

  it('normalises the STOA name case-insensitively and uses the given run id', () => {
    expect(parseArgs(['SECURITY', 'T-9', 'abc'])).toEqual({
      stoa: 'Security',
      taskId: 'T-9',
      runId: 'abc',
      dryRun: false,
      strictMode: false,
    });
    expect(m.generateRunId).not.toHaveBeenCalled();
  });

  it('generates a run id when none is given and reads flags', () => {
    const parsed = parseArgs(['quality', 'T-2', '--dry-run', '--strict']);
    expect(parsed).toMatchObject({
      stoa: 'Quality',
      runId: 'generated-run',
      dryRun: true,
      strictMode: true,
    });
  });

  it('falls back to the environment strict mode', () => {
    m.isStrictMode.mockReturnValue(true);
    expect(parseArgs(['domain', 'T-3'])?.strictMode).toBe(true);
  });

  it('maps every STOA name', () => {
    for (const name of ['foundation', 'intelligence', 'domain', 'automation']) {
      expect(parseArgs([name, 'T'])).not.toBeNull();
    }
  });
});

describe('showHelp', () => {
  it('prints usage', () => {
    showHelp();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Individual STOA Runner'));
  });
});

describe('runStoa gate selection', () => {
  it('throws when the task is not found', async () => {
    m.loadTaskFromCsv.mockReturnValue(undefined);
    await expect(runStoa(baseArgs())).rejects.toThrow('Task T-1 not found in Sprint_plan.csv');
  });

  it('defaults the sprint to 0 when targetSprint is missing', async () => {
    m.loadTaskFromCsv.mockReturnValue({});
    setTools({ 'turbo-test-coverage': { enabled: true, required: true } });
    await runStoa(baseArgs());
    expect(logged()).toContain('Sprint: 0');
    expect(m.getEvidenceDir).toHaveBeenCalledWith('/repo', 0, 'T-1', 'run-1');
  });

  it('logs run header information', async () => {
    setTools({ 'turbo-test-coverage': { enabled: true, required: true } });
    await runStoa(baseArgs({ strictMode: true, dryRun: true }));
    expect(m.logHeader).toHaveBeenCalledWith('Intelligence STOA Sub-Agent');
    expect(logged()).toEqual(
      expect.arrayContaining([
        'Task: T-1',
        'Run ID: run-1',
        'Strict Mode: Yes',
        'Dry Run: Yes',
        'Sprint: 7',
        'Gate profile for Intelligence: 1 gates',
      ])
    );
    expect(m.ensureEvidenceDirs).toHaveBeenCalledWith('/evidence');
  });

  it('skips tools missing from the audit matrix', async () => {
    setTools({});
    await runStoa(baseArgs());
    expect(logged()).toContain('  [SKIP] turbo-test-coverage: Not in audit-matrix');
    expect(m.runGates).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ repoRoot: '/repo', evidenceDir: '/evidence', dryRun: false })
    );
  });

  it('skips a disabled optional tool', async () => {
    setTools({ 'turbo-test-coverage': { enabled: false, required: false } });
    await runStoa(baseArgs());
    expect(logged()).toContain('  [SKIP] turbo-test-coverage: Disabled');
    expect(m.saveWaivers).not.toHaveBeenCalled();
  });

  it('requires a waiver for a disabled required tool', async () => {
    setTools({ 'turbo-test-coverage': { enabled: false, required: true } });
    await runStoa(baseArgs());
    expect(logged()).toContain('  [WAIVER] turbo-test-coverage: Required but disabled');
    expect(m.logSection).toHaveBeenCalledWith('Waiver Creation');
    expect(logged()).toContain('Created waiver: turbo-test-coverage (why)');
    expect(m.createWaiverRecord).toHaveBeenCalledWith(
      'turbo-test-coverage',
      { enabled: false, required: true },
      'run-1'
    );
    expect(m.saveWaivers).toHaveBeenCalledWith('/evidence', [
      { toolId: 'turbo-test-coverage', reason: 'why' },
    ]);
  });

  it('requires a waiver when a required tool misses env vars', async () => {
    setTools({
      'turbo-test-coverage': { enabled: true, required: true, requires_env: [ENV_VAR] },
    });
    await runStoa(baseArgs());
    expect(logged()).toContain(`  [WAIVER] turbo-test-coverage: Missing env vars (${ENV_VAR})`);
    expect(m.runGates).toHaveBeenCalledWith([], expect.anything());
  });

  it('skips an optional tool that misses env vars', async () => {
    setTools({
      'turbo-test-coverage': { enabled: true, required: false, requires_env: [ENV_VAR] },
    });
    await runStoa(baseArgs());
    expect(logged()).toContain(`  [SKIP] turbo-test-coverage: Missing env vars (${ENV_VAR})`);
  });

  it('runs a tool whose env vars are present', async () => {
    process.env[ENV_VAR] = 'x';
    setTools({
      'turbo-test-coverage': { enabled: true, required: true, requires_env: [ENV_VAR] },
    });
    await runStoa(baseArgs());
    expect(logged()).toContain('  [RUN] turbo-test-coverage');
    expect(m.runGates).toHaveBeenCalledWith(['turbo-test-coverage'], expect.anything());
  });

  it('runs a tool with an empty requires_env list', async () => {
    setTools({ 'turbo-test-coverage': { enabled: true, required: true, requires_env: [] } });
    await runStoa(baseArgs());
    expect(logged()).toContain('  [RUN] turbo-test-coverage');
  });

  it('does not save waivers when the waived tool vanishes on lookup', async () => {
    let calls = 0;
    m.getToolById.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? { enabled: false, required: true } : undefined;
    });
    await runStoa(baseArgs());
    expect(m.createWaiverRecord).not.toHaveBeenCalled();
    expect(m.saveWaivers).toHaveBeenCalledWith('/evidence', []);
  });
});

describe('runStoa execution tail', () => {
  it('reports results and failed gates', async () => {
    setTools({ 'turbo-test-coverage': { enabled: true, required: true } });
    m.summarizeGateResults.mockReturnValue({ passed: 0, total: 1, failedGates: ['a', 'b'] });
    await runStoa(baseArgs());
    expect(logged()).toContain('\nResults: 0/1 passed');
    expect(logged()).toContain('Failed: a, b');
  });

  it('omits the failed line when nothing failed', async () => {
    await runStoa(baseArgs());
    expect(logged().some((l) => l.startsWith('Failed:'))).toBe(false);
  });

  it('logs the additional validations for STOAs that have them', async () => {
    await runStoa(baseArgs({ stoa: 'Foundation' }));
    expect(m.logSection).toHaveBeenCalledWith('Additional Validations');
    expect(logged()).toContain('Running artifact-paths-lint...');
  });

  it('logs would-execute lines in dry-run mode', async () => {
    await runStoa(baseArgs({ stoa: 'Automation', dryRun: true }));
    expect(logged()).toContain('[DRY RUN] Would execute: tsx tools/scripts/sprint-validation.ts');
    expect(logged()).toContain(
      '[DRY RUN] Would execute: tsx tools/scripts/validate-sprint-data.ts'
    );
    expect(m.runGates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: true })
    );
  });

  it('skips the additional section when the STOA has none', async () => {
    await runStoa(baseArgs({ stoa: 'Security' }));
    expect(m.logSection).not.toHaveBeenCalledWith('Additional Validations');
  });

  it('builds the verdict from selection, results, waivers and strict mode', async () => {
    const results = [{ toolId: 'x', passed: true }];
    m.runGates.mockResolvedValue(results);
    setTools({ 'turbo-test-coverage': { enabled: true, required: true } });
    await runStoa(baseArgs({ strictMode: true }));
    expect(m.generateStoaVerdict).toHaveBeenCalledWith(
      'Intelligence',
      'T-1',
      { execute: ['turbo-test-coverage'], waiverRequired: [], skipped: [] },
      results,
      [],
      true
    );
    expect(m.writeStoaVerdict).toHaveBeenCalledWith('/evidence', {
      verdict: 'PASS',
      rationale: 'ok',
    });
  });

  it('computes skipped gates as profile minus available minus waived', async () => {
    setTools({
      'turbo-typecheck': { enabled: true, required: true },
      'turbo-build': { enabled: false, required: true },
    });
    await runStoa(baseArgs({ stoa: 'Automation' }));
    const selection = m.generateStoaVerdict.mock.calls[0][2];
    expect(selection.execute).toEqual(['turbo-typecheck']);
    expect(selection.waiverRequired).toEqual(['turbo-build']);
    expect(selection.skipped).toEqual(['turbo-test-coverage', 'eslint-max-warnings-0']);
  });

  it('prints the verdict and does not exit on PASS', async () => {
    await runStoa(baseArgs());
    expect(m.logSection).toHaveBeenCalledWith('Complete');
    expect(logged()).toEqual(
      expect.arrayContaining([
        'Intelligence STOA: PASS',
        'Rationale: ok',
        'Verdict file: /evidence/verdict.json',
      ])
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does not exit on WAIVERED or other verdicts', async () => {
    m.generateStoaVerdict.mockReturnValue({ verdict: 'WAIVERED', rationale: 'r' });
    await runStoa(baseArgs());
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 on FAIL', async () => {
    m.generateStoaVerdict.mockReturnValue({ verdict: 'FAIL', rationale: 'bad' });
    await runStoa(baseArgs());
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 2 on NEEDS_HUMAN', async () => {
    m.generateStoaVerdict.mockReturnValue({ verdict: 'NEEDS_HUMAN', rationale: 'ask' });
    await runStoa(baseArgs());
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('main', () => {
  class ExitError extends Error {}

  function throwingExit(): void {
    exitSpy.mockImplementation(((code?: number) => {
      throw new ExitError(`exit:${code}`);
    }) as never);
  }

  it('prints help and exits 0 for --help', async () => {
    throwingExit();
    process.argv = ['node', 'run-stoa.ts', '--help'];
    await expect(main()).rejects.toThrow('exit:0');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Individual STOA Runner'));
  });

  it('prints help for -h', async () => {
    throwingExit();
    process.argv = ['node', 'run-stoa.ts', '-h'];
    await expect(main()).rejects.toThrow('exit:0');
  });

  it('errors and exits 1 when required arguments are missing', async () => {
    throwingExit();
    process.argv = ['node', 'run-stoa.ts'];
    await expect(main()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Error: STOA and TASK_ID are required');
    expect(errorSpy).toHaveBeenCalledWith(
      'Usage: npx tsx tools/stoa/run-stoa.ts <STOA> <TASK_ID> [RUN_ID]'
    );
  });

  it('runs the STOA with parsed arguments', async () => {
    process.argv = ['node', 'run-stoa.ts', 'intelligence', 'T-5', 'rid', '--dry-run'];
    await main();
    expect(m.loadTaskFromCsv).toHaveBeenCalledWith('T-5', '/repo');
    expect(m.getEvidenceDir).toHaveBeenCalledWith('/repo', 7, 'T-5', 'rid');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reports an Error from runStoa by message and exits 1', async () => {
    m.loadTaskFromCsv.mockReturnValue(undefined);
    process.argv = ['node', 'run-stoa.ts', 'intelligence', 'T-5'];
    await main();
    expect(errorSpy).toHaveBeenCalledWith(
      'STOA execution failed:',
      'Task T-5 not found in Sprint_plan.csv'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('reports a non-Error rejection as-is and exits 1', async () => {
    m.loadTaskFromCsv.mockImplementation(() => {
      throw 'plain failure';
    });
    process.argv = ['node', 'run-stoa.ts', 'intelligence', 'T-5'];
    await main();
    expect(errorSpy).toHaveBeenCalledWith('STOA execution failed:', 'plain failure');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('propagates the FAIL exit code from the run', async () => {
    m.generateStoaVerdict.mockReturnValue({ verdict: 'FAIL', rationale: 'bad' });
    process.argv = ['node', 'run-stoa.ts', 'intelligence', 'T-5'];
    await main();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('profiles', () => {
  it('defines a profile for every STOA', () => {
    expect(Object.keys(STOA_GATE_PROFILES).sort()).toEqual(
      ['Automation', 'Domain', 'Foundation', 'Intelligence', 'Quality', 'Security'].sort()
    );
  });
});
