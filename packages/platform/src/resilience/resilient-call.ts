/**
 * Resilient Call - Combines circuit breaker + retry for comprehensive fault tolerance
 *
 * @module @intelliflow/platform/resilience/resilient-call
 * @see IFC-122: Circuit breaker and retry policies for external service calls
 */

import type { CircuitBreaker } from './circuit-breaker';
import type { FallbackFn } from './circuit-breaker';
import { withRetry } from './retry-policy';
import type { RetryPolicyConfig, RetryOptions } from './retry-policy';

/**
 * Execute a function with both circuit breaker protection and retry logic.
 *
 * The retry wraps the circuit breaker: each retry attempt goes through
 * the circuit breaker. If the circuit is open, CircuitBreakerOpenError
 * is thrown immediately (not retryable by default).
 *
 * @param fn - The async function to execute
 * @param breaker - Circuit breaker instance
 * @param retryConfig - Retry policy configuration
 * @param fallback - Optional fallback if all attempts fail
 */
export async function resilientCall<T>(
  fn: () => Promise<T>,
  breaker: CircuitBreaker,
  retryConfig?: Partial<RetryPolicyConfig>,
  fallback?: FallbackFn<T>,
  retryOptions?: RetryOptions<T>
): Promise<T> {
  return withRetry(
    () => breaker.execute(fn, fallback),
    retryConfig,
    retryOptions
  );
}
