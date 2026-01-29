/**
 * Common adapter utilities
 * Shared infrastructure for all external service adapters
 *
 * This module provides:
 * - Error base classes (AdapterError, RateLimitError, AuthenticationError)
 * - Retry handling with exponential backoff
 * - Rate limiting (sliding window and tiered)
 * - Idempotency management for duplicate prevention
 */

// Error classes
export {
  AdapterError,
  UnexpectedAdapterError,
  RateLimitError,
  AuthenticationError,
} from './errors';

// Retry and rate limiting
export {
  RetryHandler,
  DEFAULT_RETRY_CONFIG,
  RateLimiter,
  TieredRateLimiter,
  DEFAULT_RATE_LIMITER_CONFIG,
} from './retry';
export type { RetryConfig, RetryContext, RateLimiterConfig } from './retry';

// Idempotency
export {
  IdempotencyManager,
  DEFAULT_IDEMPOTENCY_CONFIG,
  InMemoryIdempotencyStore,
  calculateContentHash,
} from './idempotency';
export type {
  IdempotencyConfig,
  IdempotencyStore,
  IdempotencyRecord,
} from './idempotency';
