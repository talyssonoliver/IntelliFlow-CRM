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

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isAuthError(error)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/** Mutations are never retried automatically — see the module comment. */
export const MUTATION_RETRY = false;
