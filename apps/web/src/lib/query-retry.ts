/**
 * React Query retry policy for the tRPC client (used by app/providers.tsx).
 *
 * Mutations are not idempotent: retrying one the server already answered can
 * create a second lead, send a second email or register a second account, and
 * retrying a 429 inside its window only burns more of the rate limit. So a
 * mutation is retried only when the server never responded (a network failure),
 * and never on an auth error.
 */

const MAX_RETRIES = 3;

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

/**
 * True only when the request never got a response: fetch rejects with a
 * TypeError ("Failed to fetch" / "NetworkError…" / "Load failed"), which
 * @trpc/client wraps as the error's `cause`. Every other shape means the server
 * (or a proxy in front of it) answered, or the caller aborted:
 * - a tRPC error envelope sets `data` (429, 500, BAD_REQUEST…);
 * - a non-JSON body, e.g. a proxy's HTML 502 after the server already acted,
 *   fails in `res.json()` with a SyntaxError cause;
 * - an abort has an AbortError cause.
 */
function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { data, cause } = error as { data?: unknown; cause?: unknown };
  if (data !== null && data !== undefined) return false;
  return cause instanceof TypeError;
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isAuthError(error)) return false;
  return failureCount < MAX_RETRIES;
}

export function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  if (isAuthError(error) || !isNetworkFailure(error)) return false;
  return failureCount < MAX_RETRIES;
}
