import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import {
  isAuthError,
  isRateLimitError,
  MUTATION_RETRY,
  queryRetryDelay,
  shouldRetryQuery,
} from '../query-retry';

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

  // Were asserted on a copy in app/__tests__/providers.test.ts (#1216).
  it('matches the message case-insensitively and ignores non-objects', () => {
    expect(isAuthError({ message: 'User is UNAUTHORIZED' })).toBe(true);
    expect(isAuthError({ data: { code: 'UNAUTHORIZED' }, message: '' })).toBe(true);
    expect(isAuthError({ data: { code: 'NOT_FOUND' } })).toBe(false);
    expect(isAuthError({ message: 'Something went wrong' })).toBe(false);
    expect(isAuthError({})).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError(42)).toBe(false);
    expect(isAuthError(true)).toBe(false);
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

/** A rate-limit error as the API now sends it: Retry-After in the body, and optionally the header. */
function rateLimited(retryAfterSeconds: number | null, header?: string) {
  return {
    data: { code: 'TOO_MANY_REQUESTS', httpStatus: 429, retryAfterSeconds },
    meta: header
      ? {
          response: {
            status: 429,
            headers: { get: (n: string) => (n === 'retry-after' ? header : null) },
          },
        }
      : undefined,
  };
}

describe('429 handling for queries (MVP-007)', () => {
  it('recognises a 429 by code, by status and by response', () => {
    expect(isRateLimitError(serverError('TOO_MANY_REQUESTS', 429))).toBe(true);
    expect(isRateLimitError({ data: { httpStatus: 429 } })).toBe(true);
    expect(isRateLimitError({ meta: { response: { status: 429 } } })).toBe(true);
    expect(isRateLimitError(serverError('INTERNAL_SERVER_ERROR', 500))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError('429')).toBe(false);
  });

  it('retries a rate-limited read up to 5 times instead of rendering the error', () => {
    expect(shouldRetryQuery(0, rateLimited(3))).toBe(true);
    expect(shouldRetryQuery(4, rateLimited(3))).toBe(true);
    expect(shouldRetryQuery(5, rateLimited(3))).toBe(false);
  });

  it('waits for the Retry-After in the error body, plus jitter', () => {
    expect(queryRetryDelay(0, rateLimited(7), () => 0)).toBe(7000);
    expect(queryRetryDelay(0, rateLimited(7), () => 0.5)).toBe(7500);
  });

  it('falls back to the Retry-After header, then to exponential seconds', () => {
    expect(queryRetryDelay(0, rateLimited(null, '12'), () => 0)).toBe(12_000);
    expect(queryRetryDelay(3, rateLimited(null), () => 0)).toBe(8000);
    expect(queryRetryDelay(0, rateLimited(null, 'soon'), () => 0)).toBe(1000);
  });

  it('never waits longer than 30 seconds', () => {
    expect(queryRetryDelay(0, rateLimited(600), () => 0.99)).toBe(30_000);
  });

  it('keeps exponential backoff for other errors', () => {
    expect(queryRetryDelay(0, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(1000);
    expect(queryRetryDelay(2, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(4000);
    expect(queryRetryDelay(9, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(30_000);
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
