/**
 * Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern for fault tolerance in external service calls.
 * Prevents cascading failures by failing fast when a service is unhealthy.
 *
 * @module @intelliflow/platform/resilience
 * @see IFC-122: Circuit breaker and retry policies for external service calls
 */

import { z } from 'zod';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Circuit is closed, requests flow normally */
  CLOSED = 'CLOSED',
  /** Circuit is open, requests are rejected immediately */
  OPEN = 'OPEN',
  /** Circuit is testing if service has recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration schema
 */
export const circuitBreakerConfigSchema = z.object({
  /** Number of failures before opening the circuit */
  failureThreshold: z.number().min(1).default(5),
  /** Number of successful calls in HALF_OPEN to close the circuit */
  successThreshold: z.number().min(1).default(2),
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN */
  resetTimeoutMs: z.number().min(100).default(30000),
  /** Time window in ms to count failures */
  failureWindowMs: z.number().min(100).default(60000),
  /** Maximum number of requests allowed in HALF_OPEN state */
  halfOpenMaxCalls: z.number().min(1).default(3),
  /** Optional name for the circuit breaker (for logging/metrics) */
  name: z.string().optional(),
});

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  failureWindowMs: 60000,
  halfOpenMaxCalls: 3,
};

/**
 * Circuit breaker state snapshot
 */
export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalFailures: number;
  totalSuccesses: number;
  consecutiveSuccesses: number;
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  readonly code = 'CIRCUIT_BREAKER_OPEN';
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Fallback function type
 */
export type FallbackFn<T> = (error: Error) => T | Promise<T>;

/**
 * Event types for circuit breaker
 */
export type CircuitBreakerEvent =
  | { type: 'state_change'; from: CircuitState; to: CircuitState; timestamp: number }
  | { type: 'success'; state: CircuitState; duration: number; timestamp: number }
  | { type: 'failure'; state: CircuitState; error: Error; timestamp: number }
  | { type: 'rejected'; state: CircuitState; timestamp: number };

/**
 * Event listener type
 */
export type CircuitBreakerEventListener = (event: CircuitBreakerEvent) => void;

/**
 * Failure record for sliding window
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit Breaker
 *
 * Implements a state machine with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests are rejected
 * - HALF_OPEN: Testing if service has recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 *
 * const result = await breaker.execute(async () => {
 *   return await externalService.call();
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private successCount = 0;
  private consecutiveSuccesses = 0;
  private halfOpenCalls = 0;
  private lastStateChange: number = Date.now();
  private lastFailureTime: number | null = null;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly listeners: Set<CircuitBreakerEventListener> = new Set();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    const parsed = circuitBreakerConfigSchema.safeParse({
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    });

    if (!parsed.success) {
      throw new Error(`Invalid circuit breaker config: ${parsed.error.message}`);
    }

    this.config = parsed.data;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: FallbackFn<T>): Promise<T> {
    // Clean up old failures outside the window
    this.cleanupFailures();

    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : Infinity;

      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }

    // Reject if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      const retryAfterMs = this.lastFailureTime
        ? this.config.resetTimeoutMs - (Date.now() - this.lastFailureTime)
        : this.config.resetTimeoutMs;

      this.emit({
        type: 'rejected',
        state: this.state,
        timestamp: Date.now(),
      });

      const error = new CircuitBreakerOpenError(
        `Circuit breaker is OPEN${this.config.name ? ` (${this.config.name})` : ''} - service is unhealthy`,
        Math.max(0, retryAfterMs)
      );

      if (fallback) {
        return fallback(error);
      }

      throw error;
    }

    // Check HALF_OPEN limit
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        const error = new CircuitBreakerOpenError(
          'Circuit breaker HALF_OPEN limit reached - waiting for test calls to complete',
          1000
        );

        if (fallback) {
          return fallback(error);
        }

        throw error;
      }
      this.halfOpenCalls++;
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onFailure(err);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(duration: number): void {
    this.totalSuccesses++;
    this.consecutiveSuccesses++;
    this.successCount++;

    this.emit({
      type: 'success',
      state: this.state,
      duration,
      timestamp: Date.now(),
    });

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    const now = Date.now();
    this.totalFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = now;

    this.failures.push({ timestamp: now, error });

    this.emit({
      type: 'failure',
      state: this.state,
      error,
      timestamp: now,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    // Check if we've exceeded the failure threshold
    const recentFailures = this.getRecentFailureCount();
    if (recentFailures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Get the count of failures within the failure window
   */
  private getRecentFailureCount(): number {
    const cutoff = Date.now() - this.config.failureWindowMs;
    return this.failures.filter((f) => f.timestamp > cutoff).length;
  }

  /**
   * Clean up failures outside the window
   */
  private cleanupFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();

    // Reset counters based on state
    if (newState === CircuitState.CLOSED) {
      this.failures = [];
      this.successCount = 0;
      this.halfOpenCalls = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.consecutiveSuccesses = 0;
    }

    this.emit({
      type: 'state_change',
      from: oldState,
      to: newState,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: CircuitBreakerEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    });
  }

  /**
   * Get current circuit breaker state snapshot
   */
  getSnapshot(): CircuitBreakerSnapshot {
    this.cleanupFailures();

    return {
      state: this.state,
      failureCount: this.getRecentFailureCount(),
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    // Check for automatic transition
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this.state;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.totalFailures = 0;
    this.totalSuccesses = 0;
  }

  /**
   * Manually force the circuit to OPEN state
   */
  forceOpen(): void {
    this.lastFailureTime = Date.now();
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Subscribe to circuit breaker events
   */
  subscribe(listener: CircuitBreakerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check if the circuit breaker allows requests
   */
  isCallPermitted(): boolean {
    const state = this.getState();
    if (state === CircuitState.CLOSED) return true;
    if (state === CircuitState.OPEN) return false;
    // HALF_OPEN
    return this.halfOpenCalls < this.config.halfOpenMaxCalls;
  }
}

/**
 * Create a circuit breaker with the given configuration
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Decorator for adding circuit breaker protection to async methods
 */
export function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fallback?: FallbackFn<T>
) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return breaker.execute(() => originalMethod.apply(this, args), fallback);
    };

    return descriptor;
  };
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...config, name });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breaker snapshots
   */
  getAllSnapshots(): Record<string, CircuitBreakerSnapshot> {
    const snapshots: Record<string, CircuitBreakerSnapshot> = {};
    this.breakers.forEach((breaker, name) => {
      snapshots[name] = breaker.getSnapshot();
    });
    return snapshots;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.reset();
    });
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

/**
 * Global circuit breaker registry instance
 */
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();
