/**
 * Resilience patterns for fault tolerance
 *
 * Exports circuit breaker and related utilities for building
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
