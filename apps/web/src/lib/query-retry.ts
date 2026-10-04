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
 * True when the server produced a response. A TRPCClientError built from an
 * HTTP response carries `data` (with `httpStatus`/`code`); a failed fetch does
 * not.
 */
function serverResponded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  return data !== null && data !== undefined;
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isAuthError(error)) return false;
  return failureCount < MAX_RETRIES;
}

export function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  if (isAuthError(error) || serverResponded(error)) return false;
  return failureCount < MAX_RETRIES;
}
