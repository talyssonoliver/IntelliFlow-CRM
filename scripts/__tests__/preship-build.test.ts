/**
 * Tests for scripts/lib/preship-build.mjs — the local memory limits of pre-ship's
 * build and test steps (#1111). On 2026-10-31 a full pre-ship was killed by the
 * host's low-memory reaper during `build`: `next build` reached 5.7 GB with at
 * least nine page workers, on top of other packages building alongside it. The
 * push recipe's NODE_OPTIONS=--max-old-space-size=8192 was inherited by every
 * child, test workers included. Under CI nothing changes.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

import {
  BUILD_HEAP_ENV,
  DEFAULT_LOCAL_BUILD_HEAP_MB,
  DEFAULT_LOCAL_NEXT_CPUS,
  NEXT_CPUS_ENV,
  buildPlan,
  runBuild,
  stripHeapCap,
  testStepEnv,
} from '../lib/preship-build.mjs';

describe('stripHeapCap', () => {
  it.each([
    ['--max-old-space-size=8192', ''],
    ['--max_old_space_size=8192', ''],
    [
      '--expose-gc --max-old-space-size=8192 --enable-source-maps',
      '--expose-gc --enable-source-maps',
    ],
    ['--enable-source-maps', '--enable-source-maps'],
    ['', ''],
    [undefined, ''],
  ])('%j → %j', (input, expected) => {
    expect(stripHeapCap(input)).toBe(expected);
  });
});

describe('buildPlan', () => {
  it('builds one package at a time locally, with two Next page workers and a 4 GB heap', () => {
    expect(DEFAULT_LOCAL_NEXT_CPUS).toBe(2);
    expect(DEFAULT_LOCAL_BUILD_HEAP_MB).toBe(4096);

    const plan = buildPlan({
      isCI: false,
      env: { NODE_OPTIONS: '--max-old-space-size=8192 --enable-source-maps' },
    });

    expect(plan.bin).toBe('turbo');
    expect(plan.args).toEqual(['run', 'build', '--concurrency=1']);
    expect(plan.env.NEXT_BUILD_CPUS).toBe('2');
    // The inherited 8 GB cap is replaced, other flags are kept.
    expect(plan.env.NODE_OPTIONS).toBe('--enable-source-maps --max-old-space-size=4096');
  });

  it('takes the overrides', () => {
    expect(NEXT_CPUS_ENV).toBe('PRESHIP_NEXT_CPUS');
    expect(BUILD_HEAP_ENV).toBe('PRESHIP_BUILD_HEAP_MB');

    const plan = buildPlan({
      isCI: false,
      env: { [NEXT_CPUS_ENV]: ' 3 ', [BUILD_HEAP_ENV]: '6144' },
    });

    expect(plan.env.NEXT_BUILD_CPUS).toBe('3');
    expect(plan.env.NODE_OPTIONS).toBe('--max-old-space-size=6144');
  });

  it.each([
    [NEXT_CPUS_ENV, '0'],
    [NEXT_CPUS_ENV, '1.5'],
    [NEXT_CPUS_ENV, 'two'],
    [BUILD_HEAP_ENV, '-1'],
    [BUILD_HEAP_ENV, '4g'],
  ])('rejects %s=%j instead of falling back', (name, value) => {
    expect(() => buildPlan({ isCI: false, env: { [name]: value } })).toThrow(name);
  });

  it('leaves CI exactly as before: pnpm run build, no extra env', () => {
    const plan = buildPlan({
      isCI: true,
      env: { [NEXT_CPUS_ENV]: '3', NODE_OPTIONS: '--max-old-space-size=4096' },
    });

    expect(plan).toEqual({ bin: 'pnpm', args: ['run', 'build'], env: {} });
  });
});

describe('testStepEnv', () => {
  it('drops an inherited heap cap locally, so test workers do not inherit it', () => {
    expect(
      testStepEnv({
        isCI: false,
        env: { NODE_OPTIONS: '--max-old-space-size=8192 --trace-warnings' },
      })
    ).toEqual({ NODE_OPTIONS: '--trace-warnings' });
  });

  it('changes nothing when no cap is inherited, or under CI', () => {
    expect(testStepEnv({ isCI: false, env: {} })).toEqual({});
    expect(testStepEnv({ isCI: false, env: { NODE_OPTIONS: '--trace-warnings' } })).toEqual({});
    expect(testStepEnv({ isCI: true, env: { NODE_OPTIONS: '--max-old-space-size=8192' } })).toEqual(
      {}
    );
  });
});

describe('runBuild', () => {
  const root = path.join('repo', 'root');
  const ok = { status: 0 };

  it('runs turbo through node locally, with the build env merged in', () => {
    const spawn = vi.fn().mockReturnValue(ok);

    const code = runBuild({
      isCI: false,
      env: { PATH: 'p', NODE_OPTIONS: '--max-old-space-size=8192' },
      root,
      spawn,
      log: () => {},
      execPath: 'node-bin',
    });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('node-bin');
    expect(args).toEqual([
      path.join(root, 'node_modules', 'turbo', 'bin', 'turbo'),
      'run',
      'build',
      '--concurrency=1',
    ]);
    expect(opts.env).toMatchObject({
      PATH: 'p',
      NEXT_BUILD_CPUS: '2',
      NODE_OPTIONS: '--max-old-space-size=4096',
    });
    expect(opts.cwd).toBe(root);
  });

  it('runs pnpm run build under CI, with a shell on win32', () => {
    const spawn = vi.fn().mockReturnValue(ok);

    runBuild({ isCI: true, env: {}, root, spawn, log: () => {}, platform: 'win32' });

    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('pnpm');
    expect(args).toEqual(['run', 'build']);
    expect(opts.shell).toBe(true);
  });

  it('returns the build exit code, 1 for a missing code or a spawn error', () => {
    const run = (result: unknown) =>
      runBuild({
        isCI: false,
        env: {},
        root,
        spawn: vi.fn().mockReturnValue(result),
        log: () => {},
        logError: () => {},
      });

    expect(run({ status: 2 })).toBe(2);
    expect(run({ status: null })).toBe(1);
    expect(run({ error: new Error('ENOENT') })).toBe(1);
  });

  it('fails without building when an override is malformed', () => {
    const spawn = vi.fn();
    const logError = vi.fn();

    const code = runBuild({
      isCI: false,
      env: { [NEXT_CPUS_ENV]: 'many' },
      root,
      spawn,
      log: () => {},
      logError,
    });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(logError.mock.calls[0][0]).toContain(NEXT_CPUS_ENV);
  });
});
