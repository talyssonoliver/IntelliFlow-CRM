/**
 * Shared tRPC client error helpers.
 *
 * Settings pages ship before the API that serves them is promoted, so each page reads
 * the tRPC code to tell "this API does not have the procedure yet" (NOT_FOUND) apart
 * from real failures and degrade calmly.
 */

/** The tRPC error code (`error.data.code`), or undefined for anything else. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } | null }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}
