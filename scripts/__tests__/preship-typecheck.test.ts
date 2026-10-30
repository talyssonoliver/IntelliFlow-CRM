/**
 * Tests for scripts/lib/preship-typecheck.mjs — the commands behind pre-ship's
 * typecheck step (#1100). Locally the turbo typecheck runs with a bounded
 * concurrency, because all packages at once was the memory peak that got the
 * gate killed; under CI it keeps turbo's default parallelism.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

import {
  DEFAULT_LOCAL_TYPECHECK_CONCURRENCY,
  CONCURRENCY_ENV,
  runTypecheck,
  typecheckConcurrency,
  typecheckPlan,
} from '../lib/preship-typecheck.mjs';

describe('typecheckConcurrency', () => {
  it('defaults to 3 on a local run', () => {
    expect(DEFAULT_LOCAL_TYPECHECK_CONCURRENCY).toBe(3);
    expect(typecheckConcurrency({ isCI: false, env: {} })).toBe(3);
  });

  it('takes PRESHIP_TYPECHECK_CONCURRENCY on a local run', () => {
    expect(CONCURRENCY_ENV).toBe('PRESHIP_TYPECHECK_CONCURRENCY');
    expect(typecheckConcurrency({ isCI: false, env: { [CONCURRENCY_ENV]: '2' } })).toBe(2);
    expect(typecheckConcurrency({ isCI: false, env: { [CONCURRENCY_ENV]: ' 6 ' } })).toBe(6);
  });

  it('treats an empty override as unset', () => {
    expect(typecheckConcurrency({ isCI: false, env: { [CONCURRENCY_ENV]: '' } })).toBe(3);
  });

  it.each(['0', '-1', '2.5', 'abc', '3x'])('rejects the override %j', (value) => {
    expect(() => typecheckConcurrency({ isCI: false, env: { [CONCURRENCY_ENV]: value } })).toThrow(
      /PRESHIP_TYPECHECK_CONCURRENCY/
    );
  });

  it('leaves CI unbounded, even with the override set', () => {
    expect(typecheckConcurrency({ isCI: true, env: {} })).toBeNull();
    expect(typecheckConcurrency({ isCI: true, env: { [CONCURRENCY_ENV]: '2' } })).toBeNull();
  });
});

describe('typecheckPlan', () => {
  it('runs turbo with --concurrency on a local run, then the sonar guard', () => {
    const plan = typecheckPlan({ isCI: false, env: {} });

    expect(plan.map((s) => s.name)).toEqual(['turbo typecheck', 'sonar guard']);
    expect(plan[0].args).toEqual(['run', 'typecheck', '--concurrency=3']);
    expect(plan[1].args).toEqual(['run', 'lint:sonar:guard']);
  });

  it('passes the override through to turbo', () => {
    const plan = typecheckPlan({ isCI: false, env: { [CONCURRENCY_ENV]: '1' } });

    expect(plan[0].args).toEqual(['run', 'typecheck', '--concurrency=1']);
  });

  it('runs turbo without --concurrency under CI, then the sonar guard', () => {
    const plan = typecheckPlan({ isCI: true, env: {} });

    expect(plan[0].args).toEqual(['run', 'typecheck']);
    expect(plan[0].args.some((a: string) => a.startsWith('--concurrency'))).toBe(false);
    expect(plan[1].args).toEqual(['run', 'lint:sonar:guard']);
  });
});

describe('runTypecheck', () => {
  const root = path.join('repo', 'root');
  const turbo = path.join(root, 'node_modules', 'turbo', 'bin', 'turbo');

  function setup(results: Array<{ status?: number | null; error?: Error }> = []) {
    const spawn = vi.fn((_file: string, _args: string[], _opts: object) => {
      const r = results.shift() ?? { status: 0 };
      return { status: r.status === undefined ? 0 : r.status, error: r.error };
    });
    const log = vi.fn();
    const logError = vi.fn();
    return { spawn, log, logError };
  }

  it('runs turbo through node, then the sonar guard through pnpm, and returns 0', () => {
    const { spawn, log, logError } = setup();

    const code = runTypecheck({
      isCI: false,
      env: {},
      root,
      spawn,
      log,
      logError,
      execPath: 'node-bin',
      platform: 'linux',
    });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0]).toEqual([
      'node-bin',
      [turbo, 'run', 'typecheck', '--concurrency=3'],
      { cwd: root, stdio: 'inherit' },
    ]);
    expect(spawn.mock.calls[1]).toEqual([
      'pnpm',
      ['run', 'lint:sonar:guard'],
      { cwd: root, stdio: 'inherit', shell: false },
    ]);
    expect(logError).not.toHaveBeenCalled();
  });

  it('uses a shell for pnpm on win32', () => {
    const { spawn, log, logError } = setup();

    runTypecheck({ isCI: true, env: {}, root, spawn, log, logError, platform: 'win32' });

    expect(spawn.mock.calls[0][1]).toEqual([turbo, 'run', 'typecheck']);
    expect(spawn.mock.calls[1][2]).toMatchObject({ shell: true });
  });

  it('stops at a failing turbo typecheck and returns its exit code', () => {
    const { spawn, log, logError } = setup([{ status: 2 }]);

    const code = runTypecheck({ isCI: false, env: {}, root, spawn, log, logError });

    expect(code).toBe(2);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('returns 1 when a command ends without an exit code', () => {
    const { spawn, log, logError } = setup([{ status: 0 }, { status: null }]);

    expect(runTypecheck({ isCI: false, env: {}, root, spawn, log, logError })).toBe(1);
  });

  it('returns 1 when a command cannot start', () => {
    const { spawn, log, logError } = setup([{ status: null, error: new Error('ENOENT') }]);

    const code = runTypecheck({ isCI: false, env: {}, root, spawn, log, logError });

    expect(code).toBe(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('could not start turbo: ENOENT'));
  });

  it('returns 1 without running anything for a malformed override', () => {
    const { spawn, log, logError } = setup();

    const code = runTypecheck({
      isCI: false,
      env: { [CONCURRENCY_ENV]: 'abc' },
      root,
      spawn,
      log,
      logError,
    });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(CONCURRENCY_ENV));
  });
});
