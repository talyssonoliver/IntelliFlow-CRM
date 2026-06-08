/**
 * EnvValidator tests — guards the cognitive-complexity refactor of
 * validateVariable/validate (extracted validateSchema / validateCustom /
 * printErrors / printWarnings) and the DATABASE_POOL_SIZE → DATABASE_POOL_MAX
 * rename. Issue #316.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnvValidator } from '../validate-env';

describe('EnvValidator (validate-env, issue #316)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flags a missing required variable', () => {
    const result = new EnvValidator('production').validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'missing')).toBe(true);
  });

  it('accepts a valid DATABASE_POOL_MAX and rejects an out-of-range one', () => {
    const ok = new EnvValidator('development').validate({ DATABASE_POOL_MAX: '20' });
    expect(ok.errors.some((e) => e.variable === 'DATABASE_POOL_MAX')).toBe(false);

    const bad = new EnvValidator('development').validate({ DATABASE_POOL_MAX: '99999' });
    expect(
      bad.errors.some((e) => e.variable === 'DATABASE_POOL_MAX' && e.type === 'invalid_format')
    ).toBe(true);
  });

  it('rejects a DATABASE_URL that fails the custom validator', () => {
    const result = new EnvValidator('development').validate({ DATABASE_URL: 'mysql://x' });
    expect(
      result.errors.some((e) => e.variable === 'DATABASE_URL' && e.type === 'invalid_value')
    ).toBe(true);
  });
});
