import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { isAuthError, MUTATION_RETRY, shouldRetryQuery } from '../query-retry';

/** A TRPCClientError as built from a server response (it carries `data`). */
function serverError(code: string, httpStatus: number) {
  return TRPCClientError.from({
    error: { message: code, code: -32000, data: { code, httpStatus } },
  } as never);
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

describe('shouldRetryQuery', () => {
  it('retries non-auth failures up to 3 times, auth failures never', () => {
    expect(shouldRetryQuery(0, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(true);
    expect(shouldRetryQuery(2, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(true);
    expect(shouldRetryQuery(3, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(false);
    expect(shouldRetryQuery(0, serverError('UNAUTHORIZED', 401))).toBe(false);
  });
});

describe('mutation retry policy', () => {
  it('runs a failing mutation exactly once, whatever the error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: MUTATION_RETRY } },
    });

    // Every shape that can follow a write the server already committed:
    // a server envelope, a proxy's non-JSON 502, and a dropped connection.
    const failures = [
      serverError('INTERNAL_SERVER_ERROR', 500),
      serverError('TOO_MANY_REQUESTS', 429),
      TRPCClientError.from(new SyntaxError('Unexpected token < in JSON')),
      TRPCClientError.from(new TypeError('Failed to fetch')),
    ];

    for (const failure of failures) {
      let calls = 0;
      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationFn: async () => {
          calls++;
          throw failure;
        },
      });
      await expect(mutation.execute(undefined)).rejects.toBe(failure);
      expect(calls).toBe(1);
    }
  });
});
