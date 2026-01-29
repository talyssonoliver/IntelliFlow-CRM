/**
 * Shared Calendar Adapter Utilities
 * Common functionality for calendar integrations
 *
 * Note: RetryHandler, RateLimiter, and IdempotencyManager have been
 * extracted to packages/adapters/src/common/ for reuse across all adapters.
 * This file re-exports them for backward compatibility.
 */

// Re-export from common for backward compatibility
export { RetryHandler, DEFAULT_RETRY_CONFIG, RateLimiter } from '../../common/retry';
export type { RetryConfig, RetryContext } from '../../common/retry';

export { IdempotencyManager, InMemoryIdempotencyStore } from '../../common/idempotency';
export type { IdempotencyStore, IdempotencyRecord } from '../../common/idempotency';

// Calendar-specific utilities
export * from './ConflictResolver';

// Legacy re-exports for calculateAppointmentHash
export { calculateContentHash as calculateAppointmentHash } from '../../common/idempotency';
