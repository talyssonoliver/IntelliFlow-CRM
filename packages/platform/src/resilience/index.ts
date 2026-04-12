/**
 * Resilience patterns for fault tolerance
 *
 * Exports circuit breaker and retry policies for building
 * resilient external service calls.
 *
 * @module @intelliflow/platform/resilience
 * @see IFC-122: Circuit breaker and retry policies
 */

export {
  // Core circuit breaker
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  globalCircuitBreakerRegistry,
  createCircuitBreaker,
  withCircuitBreaker,
  // Configuration
  circuitBreakerConfigSchema,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  // Types
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
  type CircuitBreakerEvent,
  type CircuitBreakerEventListener,
  type FallbackFn,
} from './circuit-breaker';

export {
  // Retry policy
  RetryPolicy,
  withRetry,
  createRetryPolicy,
  Retry,
  RetryPolicies,
  // Error classes
  RetryableError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  MaxRetriesExceededError,
  // Utilities
  isRetryableError,
  calculateBackoff,
  retryPolicyConfigSchema,
  DEFAULT_RETRY_CONFIG,
  // Types
  type RetryPolicyConfig,
  type RetryContext,
  type RetryEvent,
  type RetryEventListener,
  type RetryOptions,
  type ResilientCallOptions,
} from './retry-policy';

export { resilientCall } from './resilient-call';
