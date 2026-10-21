/**
 * Shared tRPC error helpers (PG-199). One `errorCode` for every settings page that
 * degrades calmly when an older API does not have its procedures yet (NOT_FOUND).
 */
import { describe, it, expect } from 'vitest';
import { errorCode } from '../trpc-errors';

describe('errorCode', () => {
  it('reads the tRPC error code from error.data.code', () => {
    expect(errorCode({ data: { code: 'NOT_FOUND' } })).toBe('NOT_FOUND');
    expect(errorCode(Object.assign(new Error('x'), { data: { code: 'CONFLICT' } }))).toBe(
      'CONFLICT'
    );
  });

  it('is undefined for anything that is not a tRPC error with a string code', () => {
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
    expect(errorCode('NOT_FOUND')).toBeUndefined();
    expect(errorCode({ data: { code: 42 } })).toBeUndefined();
    expect(errorCode({ data: null })).toBeUndefined();
  });
});
