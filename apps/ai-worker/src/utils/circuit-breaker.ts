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
import { AsyncLocalStorage } from 'node:async_hooks';
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
  /**
   * Failures that say nothing about the provider this breaker guards (for example a tenant's
   * own BYOK key being rejected, registered by lib/byok.ts): they are rethrown and never
   * counted, in every breaker, so no caller can forget the exemption. Breakers are shared by
   * every tenant, so counting one customer's failure would stop the others.
   */
  private static readonly ignoredFailures: Array<(error: unknown) => boolean> = [];

  /**
   * Per-call scope: a call that ended up answered by something other than the platform
   * provider this breaker guards (a tenant's own BYOK model, lib/byok.ts) marks itself with
   * `markCallNotPlatform(true)`, so its outcome is not counted either way: its success cannot
   * close a half-open breaker. The mark is cleared (`false`) if the call then falls back to the
   * platform, whose answer is the one that counts.
   */
  private static readonly callScope = new AsyncLocalStorage<{ notPlatform: boolean }>();

  static markCallNotPlatform(notPlatform: boolean): void {
    const scope = CircuitBreaker.callScope.getStore();
    if (scope) scope.notPlatform = notPlatform;
  }

  static ignoreFailuresMatching(predicate: (error: unknown) => boolean): void {
    if (!CircuitBreaker.ignoredFailures.includes(predicate)) {
      CircuitBreaker.ignoredFailures.push(predicate);
    }
  }

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

    const scope = { notPlatform: false };
    try {
      const result = await CircuitBreaker.callScope.run(scope, fn);

      // Reset on success in HALF_OPEN (only the platform's own answer counts)
      if (this.state === 'HALF_OPEN' && !scope.notPlatform) {
        getLogger().info('Circuit breaker reset to CLOSED state');
        this.state = 'CLOSED';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      if (scope.notPlatform || CircuitBreaker.ignoredFailures.some((matches) => matches(error))) {
        throw error;
      }
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
