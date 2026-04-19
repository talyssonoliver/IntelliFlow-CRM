/**
 * CircuitBreaker — zero-dependency implementation.
 *
 * Extracted from retry.ts so it can be imported by llm-factory.ts without
 * triggering retry.ts's module-level aiConfig read (which fails in tests
 * that mock ai.config via vi.doMock).
 *
 * @module ai-worker/utils/circuit-breaker
 * @task H9 (2026-04-17 audit remediation)
 */
import type pino from 'pino';
import { createLogger } from './logger';

// Lazy-initialized logger — avoids triggering pino.stdTimeFunctions at import
// time in test environments that use a minimal pino mock.
let _logger: pino.Logger | null = null;
function getLogger(): pino.Logger {
  if (!_logger) _logger = createLogger('circuit-breaker');
  return _logger;
}

/**
 * Circuit breaker pattern for preventing cascading failures.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (probing reset).
 *
 * @param failureThreshold - failures before tripping (default 5)
 * @param resetTimeout     - ms before attempting HALF_OPEN reset (default 60 s)
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 60_000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should attempt reset
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime > this.resetTimeout) {
      getLogger().info('Circuit breaker entering HALF_OPEN state');
      this.state = 'HALF_OPEN';
      this.failureCount = 0;
    }

    // Reject immediately when open
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - too many failures');
    }

    try {
      const result = await fn();

      // Reset on success in HALF_OPEN
      if (this.state === 'HALF_OPEN') {
        getLogger().info('Circuit breaker reset to CLOSED state');
        this.state = 'CLOSED';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        getLogger().error(
          { failureCount: this.failureCount, threshold: this.failureThreshold },
          'Circuit breaker opened due to too many failures'
        );
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
