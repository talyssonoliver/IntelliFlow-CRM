/**
 * Retry Strategy with Exponential Backoff
 *
 * Implements configurable retry logic for BullMQ jobs with:
 * - Exponential backoff with jitter
 * - Fixed delay option
 * - Maximum delay cap
 * - Retry budget tracking
 */

import type { RetryBackoffConfig } from './types';

// ============================================================================
// Retry Delay Calculator
// ============================================================================

/**
 * Calculate delay for next retry attempt using exponential backoff
 *
 * @param attemptNumber - Current attempt number (1-based)
 * @param config - Backoff configuration
 * @returns Delay in milliseconds before next retry
 */
export function calculateBackoffDelay(attemptNumber: number, config: RetryBackoffConfig): number {
  const { type, delay, maxDelay, jitter = 0 } = config;

  let calculatedDelay: number;

  if (type === 'fixed') {
    calculatedDelay = delay;
  } else {
    // Exponential backoff: delay * 2^(attempt-1)
    calculatedDelay = delay * Math.pow(2, attemptNumber - 1);
  }

  // Apply maximum delay cap
  if (maxDelay !== undefined && calculatedDelay > maxDelay) {
    calculatedDelay = maxDelay;
  }

  // Apply jitter (randomness to prevent thundering herd)
  if (jitter > 0) {
    const jitterRange = calculatedDelay * jitter;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterRange;
    calculatedDelay = Math.max(0, calculatedDelay + randomJitter);
  }

  return Math.round(calculatedDelay);
}

// ============================================================================
// BullMQ Backoff Strategy
// ============================================================================

/**
 * Create a BullMQ-compatible backoff strategy function
 *
 * BullMQ expects backoff to be either:
 * - A simple object { type: 'exponential' | 'fixed', delay: number }
 * - A custom function (attemptsMade, type, err, job) => number
 *
 * This creates the custom function variant for advanced control.
 */
export function createBackoffStrategy(config: RetryBackoffConfig): (attemptsMade: number) => number {
  return (attemptsMade: number): number => {
    return calculateBackoffDelay(attemptsMade, config);
  };
}

// ============================================================================
// Retry Decision Logic
// ============================================================================

/**
 * Error categories for retry decisions
 */
export enum ErrorCategory {
  /** Transient errors that should always be retried */
  TRANSIENT = 'transient',
  /** Rate limit errors that should be retried with backoff */
  RATE_LIMITED = 'rate_limited',
  /** Client errors that should not be retried */
  CLIENT_ERROR = 'client_error',
  /** Server errors that may be retried */
  SERVER_ERROR = 'server_error',
  /** Unknown errors - retry with caution */
  UNKNOWN = 'unknown',
}

/**
 * Categorize an error for retry decision
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network/connection errors - always transient
  if (
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    name.includes('timeout')
  ) {
    return ErrorCategory.TRANSIENT;
  }

  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
    return ErrorCategory.RATE_LIMITED;
  }

  // Client errors (4xx) - usually should not retry
  if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
    return ErrorCategory.CLIENT_ERROR;
  }

  // Server errors (5xx) - may retry
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return ErrorCategory.SERVER_ERROR;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Determine if an error should be retried
 */
export function shouldRetry(error: Error, attemptsMade: number, maxAttempts: number): boolean {
  // Already exhausted retries
  if (attemptsMade >= maxAttempts) {
    return false;
  }

  const category = categorizeError(error);

  switch (category) {
    case ErrorCategory.TRANSIENT:
    case ErrorCategory.RATE_LIMITED:
    case ErrorCategory.SERVER_ERROR:
      return true;
    case ErrorCategory.CLIENT_ERROR:
      return false;
    case ErrorCategory.UNKNOWN:
      // Retry unknown errors up to half the max attempts
      return attemptsMade < Math.ceil(maxAttempts / 2);
    default:
      return false;
  }
}

// ============================================================================
// Retry Budget Tracker
// ============================================================================

/**
 * Tracks retry budgets to prevent runaway retries
 */
export class RetryBudgetTracker {
  private budgets: Map<string, { remaining: number; resetAt: number }> = new Map();

  constructor(
    private defaultBudget: number = 100,
    private windowMs: number = 60000
  ) {}

  /**
   * Check if retry is allowed within budget
   */
  canRetry(queueName: string): boolean {
    const budget = this.getBudget(queueName);
    return budget.remaining > 0;
  }

  /**
   * Consume a retry from the budget
   */
  consumeRetry(queueName: string): boolean {
    const budget = this.getBudget(queueName);

    if (budget.remaining <= 0) {
      return false;
    }

    budget.remaining--;
    return true;
  }

  /**
   * Get current budget for a queue
   */
  getBudget(queueName: string): { remaining: number; resetAt: number } {
    const now = Date.now();
    let budget = this.budgets.get(queueName);

    // Reset budget if window has passed
    if (!budget || budget.resetAt <= now) {
      budget = {
        remaining: this.defaultBudget,
        resetAt: now + this.windowMs,
      };
      this.budgets.set(queueName, budget);
    }

    return budget;
  }

  /**
   * Get budget statistics
   */
  getStats(): Record<string, { remaining: number; resetAt: string }> {
    const stats: Record<string, { remaining: number; resetAt: string }> = {};

    this.budgets.forEach((budget, queueName) => {
      stats[queueName] = {
        remaining: budget.remaining,
        resetAt: new Date(budget.resetAt).toISOString(),
      };
    });

    return stats;
  }

  /**
   * Reset all budgets
   */
  reset(): void {
    this.budgets.clear();
  }
}

// Singleton instance for global retry budget tracking
export const globalRetryBudget = new RetryBudgetTracker();

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Preset backoff configurations for common use cases
 */
export const BACKOFF_PRESETS: Record<string, RetryBackoffConfig> = {
  /** Aggressive retries for critical operations */
  aggressive: {
    type: 'exponential',
    delay: 500,
    maxDelay: 30000,
    jitter: 0.1,
  },
  /** Standard retries for normal operations */
  standard: {
    type: 'exponential',
    delay: 1000,
    maxDelay: 60000,
    jitter: 0.1,
  },
  /** Conservative retries for rate-limited APIs */
  conservative: {
    type: 'exponential',
    delay: 5000,
    maxDelay: 300000, // 5 minutes
    jitter: 0.2,
  },
  /** Fixed interval for predictable retry timing */
  fixed: {
    type: 'fixed',
    delay: 10000,
  },
};
