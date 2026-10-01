import type { QuotaKey } from './QuotaRegistry';

/** Stable machine-readable code carried in the tRPC error `cause`. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED' as const;

/**
 * Thrown when an operation would take a tenant past its plan quota.
 * The API maps it to tRPC `PRECONDITION_FAILED` with
 * `cause: { code: 'QUOTA_EXCEEDED', key, used, limit }`.
 */
export class QuotaExceededError extends Error {
  readonly code = QUOTA_EXCEEDED_CODE;

  constructor(
    readonly key: QuotaKey,
    readonly used: number,
    readonly limit: number,
    readonly increment: number = 1
  ) {
    super(`Quota exceeded for ${key}: ${used} used of ${limit} allowed`);
    this.name = 'QuotaExceededError';
  }
}
