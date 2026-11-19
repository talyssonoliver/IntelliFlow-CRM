/**
 * React Query retry policy for the tRPC client (used by app/providers.tsx).
 *
 * Queries are reads, so a failed one is retried (never on an auth error, which
 * only re-authentication fixes).
 *
 * Mutations are NEVER retried automatically. They are not idempotent, and no
 * client-side error shape proves the server did not already run one: a 429/500
 * envelope, a proxy's HTML 502 and even a fetch TypeError ("Failed to fetch",
 * also raised when the connection drops after the server received the request)
 * can all follow a committed write. A retry could create a second lead, send a
 * second email or register a second account; the user retries by hand instead.
 */

const MAX_QUERY_RETRIES = 3;

/** True for errors that only re-authentication can fix. */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // Check tRPC error shape
  const err = error as { data?: { code?: string }; message?: string };
  if (err.data?.code === 'UNAUTHORIZED') return true;

  // Check error message
  const message = err.message?.toLowerCase() ?? '';
  return message.includes('unauthorized') || message.includes('authentication required');
}

/** Rate-limited reads wait for the server's Retry-After, so they are given more attempts. */
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 30_000;

type TrpcErrorShape = {
  data?: { code?: string; httpStatus?: number; retryAfterSeconds?: number | null };
  meta?: { response?: { status?: number; headers?: { get(name: string): string | null } } };
};

/** True for a 429 (the API's TOO_MANY_REQUESTS). */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as TrpcErrorShape;
  return (
    err.data?.code === 'TOO_MANY_REQUESTS' ||
    err.data?.httpStatus === 429 ||
    err.meta?.response?.status === 429
  );
}

/** Seconds the server asked us to wait: the error body first, then the Retry-After header. */
function retryAfterSeconds(error: unknown): number | null {
  const err = error as TrpcErrorShape;
  const fromBody = err.data?.retryAfterSeconds;
  if (typeof fromBody === 'number' && fromBody > 0) return fromBody;
  const header = Number(err.meta?.response?.headers?.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header : null;
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isAuthError(error)) return false;
  if (isRateLimitError(error)) return failureCount < MAX_RATE_LIMIT_RETRIES;
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * Wait before the next try. A 429 waits for the server's Retry-After (plus up to one second of
 * jitter so the calls of one page do not all come back in the same instant); anything else keeps
 * React Query's exponential default.
 */
export function queryRetryDelay(
  failureCount: number,
  error: unknown,
  random: () => number = Math.random
): number {
  if (isRateLimitError(error)) {
    const jitter = Math.floor(random() * 1000);
    const asked = retryAfterSeconds(error);
    // A wait the server asked for is honoured in full (a shorter one would retry before the limit
    // lifts and use up the attempts); only our own exponential guess is capped.
    if (asked !== null) return asked * 1000 + jitter;
    return Math.min(MAX_RETRY_DELAY_MS, 2 ** failureCount * 1000 + jitter);
  }
  return Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}

/** Mutations are never retried automatically — see the module comment. */
export const MUTATION_RETRY = false;
