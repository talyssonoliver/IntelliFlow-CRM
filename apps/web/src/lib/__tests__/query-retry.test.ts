import { describe, it, expect } from 'vitest';
import { TRPCClientError } from '@trpc/client';
import { isAuthError, shouldRetryMutation, shouldRetryQuery } from '../query-retry';

/** A TRPCClientError as built from a server response (it carries `data`). */
function serverError(code: string, httpStatus: number) {
  return TRPCClientError.from({
    error: { message: code, code: -32000, data: { code, httpStatus } },
  } as never);
}

/** A TRPCClientError as built from a failed fetch (no response, no `data`). */
function networkError() {
  return TRPCClientError.from(new TypeError('Failed to fetch'));
}

describe('isAuthError', () => {
  it('detects UNAUTHORIZED by code and by message', () => {
    expect(isAuthError(serverError('UNAUTHORIZED', 401))).toBe(true);
    expect(isAuthError({ message: 'Authentication required. Please log in.' })).toBe(true);
    expect(isAuthError(serverError('INTERNAL_SERVER_ERROR', 500))).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError('boom')).toBe(false);
  });
});

describe('shouldRetryMutation', () => {
  it.each([
    ['TOO_MANY_REQUESTS', 429],
    ['INTERNAL_SERVER_ERROR', 500],
    ['BAD_REQUEST', 400],
    ['CONFLICT', 409],
  ])('never retries once the server answered (%s)', (code, status) => {
    expect(shouldRetryMutation(0, serverError(code, status))).toBe(false);
  });

  it('never retries an auth error', () => {
    expect(shouldRetryMutation(0, serverError('UNAUTHORIZED', 401))).toBe(false);
  });

  it('retries a network failure up to 3 times', () => {
    const err = networkError();
    expect(shouldRetryMutation(0, err)).toBe(true);
    expect(shouldRetryMutation(2, err)).toBe(true);
    expect(shouldRetryMutation(3, err)).toBe(false);
  });
});

describe('shouldRetryQuery', () => {
  it('retries non-auth failures up to 3 times, auth failures never', () => {
    expect(shouldRetryQuery(0, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(true);
    expect(shouldRetryQuery(3, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(false);
    expect(shouldRetryQuery(0, serverError('UNAUTHORIZED', 401))).toBe(false);
  });
});
