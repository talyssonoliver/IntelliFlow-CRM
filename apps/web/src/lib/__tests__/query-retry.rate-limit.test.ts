import { describe, it, expect } from 'vitest';
import { TRPCClientError } from '@trpc/client';
import { isRateLimitError, queryRetryDelay, shouldRetryQuery } from '../query-retry';

// MVP-007. Kept apart from query-retry.test.ts: that file is on the node-env list
// (vitest.node-env-files.txt), and the gate's related-mode coverage counts only the jsdom run.

/** A TRPCClientError as built from a server response (it carries `data`). */
function serverError(code: string, httpStatus: number) {
  return TRPCClientError.from({
    error: { message: code, code: -32000, data: { code, httpStatus } },
  } as never);
}

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

  it('honours a long wait the server asked for in full, and caps only its own guess', () => {
    // Retrying earlier would land inside the restriction and use up the attempts.
    expect(queryRetryDelay(0, rateLimited(600), () => 0)).toBe(600_000);
    expect(queryRetryDelay(0, rateLimited(600), () => 0.5)).toBe(600_500);
    expect(queryRetryDelay(9, rateLimited(null), () => 0.99)).toBe(30_000);
  });

  it('keeps exponential backoff for other errors', () => {
    expect(queryRetryDelay(0, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(1000);
    expect(queryRetryDelay(2, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(4000);
    expect(queryRetryDelay(9, serverError('INTERNAL_SERVER_ERROR', 500))).toBe(30_000);
  });
});
