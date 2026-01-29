/**
 * Rate limiter for adapter API calls
 * Implements sliding window rate limiting
 *
 * Extracted from calendar/shared/RetryHandler.ts for reuse across all adapters
 */

export interface RateLimiterConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in window */
  maxRequests: number;
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  windowMs: 60000, // 1 minute default
  maxRequests: 100, // 100 requests per window
};

/**
 * Sliding window rate limiter
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private requests: number[] = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    const merged = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.windowMs = merged.windowMs;
    this.maxRequests = merged.maxRequests;
  }

  /**
   * Check if request is allowed
   */
  canMakeRequest(): boolean {
    this.cleanup();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Get time until next request is allowed (in ms)
   */
  getTimeUntilAllowed(): number {
    if (this.canMakeRequest()) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    const expiresAt = oldestRequest + this.windowMs;
    return Math.max(0, expiresAt - Date.now());
  }

  /**
   * Get current request count in window
   */
  getCurrentCount(): number {
    this.cleanup();
    return this.requests.length;
  }

  /**
   * Get remaining requests in window
   */
  getRemainingRequests(): number {
    return Math.max(0, this.maxRequests - this.getCurrentCount());
  }

  /**
   * Cleanup expired requests
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter((ts) => ts > cutoff);
  }

  /**
   * Reset limiter (for testing)
   */
  reset(): void {
    this.requests = [];
  }
}

/**
 * Multi-tier rate limiter for APIs with multiple rate limit tiers
 * (e.g., Slack has tier 1-4 rate limits)
 */
export class TieredRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor(
    private readonly tiers: Record<string, RateLimiterConfig>
  ) {
    for (const [tier, config] of Object.entries(tiers)) {
      this.limiters.set(tier, new RateLimiter(config));
    }
  }

  /**
   * Check if request is allowed for a specific tier
   */
  canMakeRequest(tier: string): boolean {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      return true; // Unknown tier, allow by default
    }
    return limiter.canMakeRequest();
  }

  /**
   * Record a request for a specific tier
   */
  recordRequest(tier: string): void {
    const limiter = this.limiters.get(tier);
    if (limiter) {
      limiter.recordRequest();
    }
  }

  /**
   * Get time until allowed for a specific tier
   */
  getTimeUntilAllowed(tier: string): number {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      return 0;
    }
    return limiter.getTimeUntilAllowed();
  }

  /**
   * Reset all tiers (for testing)
   */
  reset(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }
}
