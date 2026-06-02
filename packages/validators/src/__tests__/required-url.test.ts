import { describe, it, expect, afterEach } from 'vitest';
import { requiredProdEnv, isProductionEnv } from '../required-url';

/**
 * Tests for the production-safe URL resolver (#228). The helper must:
 *  - return an explicitly-set value,
 *  - return the dev default outside production,
 *  - THROW in production when the value is missing (no silent localhost),
 *  - treat empty string as missing,
 *  - NOT throw during the Next.js production *build* (NEXT_PHASE guard).
 */
describe('requiredProdEnv / isProductionEnv (#228)', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origPhase = process.env.NEXT_PHASE;

  afterEach(() => {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = origPhase;
  });

  it('returns the explicit value when set (even in production)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    expect(requiredProdEnv('X', 'https://real.example.com', 'http://localhost:3000')).toBe(
      'https://real.example.com'
    );
  });

  it('returns the dev default outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PHASE;
    expect(requiredProdEnv('X', undefined, 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('throws in production when the value is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    expect(() => requiredProdEnv('REDIS_HOST', undefined, 'localhost')).toThrow(
      /REDIS_HOST must be set in production/
    );
  });

  it('treats empty string as missing (throws in production)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    expect(() => requiredProdEnv('X', '', 'localhost')).toThrow(/must be set in production/);
  });

  it('does NOT throw during the Next.js production build (NEXT_PHASE guard)', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = 'phase-production-build';
    expect(isProductionEnv()).toBe(false);
    expect(requiredProdEnv('REDIS_HOST', undefined, 'localhost')).toBe('localhost');
  });

  it('appends the hint to the production error', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    expect(() =>
      requiredProdEnv('TEMPORAL_ADDRESS', undefined, 'localhost:7233', 'See ADR-034.')
    ).toThrow(/See ADR-034\./);
  });
});
