/**
 * Tests for scripts/lib/preship-typecheck.mjs — the commands behind pre-ship's
 * typecheck step (#1100). Locally the turbo typecheck runs with a bounded
 * concurrency, because all packages at once was the memory peak that got the
 * gate killed; under CI it keeps turbo's default parallelism.
 */
import { describe, it, expect } from 'vitest';

import {
  DEFAULT_LOCAL_TYPECHECK_CONCURRENCY,
  CONCURRENCY_ENV,
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
