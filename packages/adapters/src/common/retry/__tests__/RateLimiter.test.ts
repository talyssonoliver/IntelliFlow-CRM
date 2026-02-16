/**
 * RateLimiter Tests
 *
 * Tests for the sliding window rate limiter and tiered rate limiter.
 * Covers all public methods, edge cases, window expiration, and
 * multi-tier rate limiting logic.
 *
 * Coverage target: 100% of RateLimiter.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, TieredRateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from '../RateLimiter';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const limiter = new RateLimiter();

      // Default: 100 requests per 60000ms
      expect(limiter.getRemainingRequests()).toBe(100);
    });

    it('should accept partial config and merge with defaults', () => {
      const limiter = new RateLimiter({ maxRequests: 5 });

      expect(limiter.getRemainingRequests()).toBe(5);
    });

    it('should accept full config', () => {
      const limiter = new RateLimiter({ windowMs: 30000, maxRequests: 10 });

      expect(limiter.getRemainingRequests()).toBe(10);
    });
  });

  describe('DEFAULT_RATE_LIMITER_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RATE_LIMITER_CONFIG.windowMs).toBe(60000);
      expect(DEFAULT_RATE_LIMITER_CONFIG.maxRequests).toBe(100);
    });
  });

  describe('canMakeRequest()', () => {
    it('should return true when under limit', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should return false when at limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.canMakeRequest()).toBe(false);
    });

    it('should return true again after window expires', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      limiter.recordRequest();
      limiter.recordRequest();
      expect(limiter.canMakeRequest()).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(1001);

      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should clean up expired requests during check', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      limiter.recordRequest();
      vi.advanceTimersByTime(500);
      limiter.recordRequest();

      // First request should expire
      vi.advanceTimersByTime(501);

      expect(limiter.canMakeRequest()).toBe(true);
      expect(limiter.getCurrentCount()).toBe(1);
    });
  });

  describe('recordRequest()', () => {
    it('should increment the request count', () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });

      expect(limiter.getCurrentCount()).toBe(0);

      limiter.recordRequest();
      expect(limiter.getCurrentCount()).toBe(1);

      limiter.recordRequest();
      expect(limiter.getCurrentCount()).toBe(2);
    });

    it('should allow recording beyond max (no enforcement in recordRequest)', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest(); // Over limit

      expect(limiter.getCurrentCount()).toBe(3);
    });
  });

  describe('getTimeUntilAllowed()', () => {
    it('should return 0 when requests are allowed', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

      expect(limiter.getTimeUntilAllowed()).toBe(0);
    });

    it('should return positive time when at limit', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10000 });

      limiter.recordRequest();
      limiter.recordRequest();

      const timeUntilAllowed = limiter.getTimeUntilAllowed();
      expect(timeUntilAllowed).toBeGreaterThan(0);
      expect(timeUntilAllowed).toBeLessThanOrEqual(10000);
    });

    it('should return 0 after window expires', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });

      limiter.recordRequest();
      expect(limiter.getTimeUntilAllowed()).toBeGreaterThan(0);

      vi.advanceTimersByTime(1001);

      expect(limiter.getTimeUntilAllowed()).toBe(0);
    });

    it('should calculate correctly based on oldest request', () => {
      vi.useFakeTimers({ now: 10000 });
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 5000 });

      limiter.recordRequest(); // at t=10000
      vi.advanceTimersByTime(1000); // t=11000
      limiter.recordRequest(); // at t=11000

      // At limit, oldest request is at t=10000, window is 5000ms
      // So oldest expires at t=15000, current time is t=11000
      const waitTime = limiter.getTimeUntilAllowed();
      expect(waitTime).toBe(4000); // 15000 - 11000
    });
  });

  describe('getCurrentCount()', () => {
    it('should return 0 when no requests recorded', () => {
      const limiter = new RateLimiter();

      expect(limiter.getCurrentCount()).toBe(0);
    });

    it('should return correct count after recording requests', () => {
      const limiter = new RateLimiter();

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.getCurrentCount()).toBe(3);
    });

    it('should exclude expired requests', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 2000 });

      limiter.recordRequest(); // t=0
      limiter.recordRequest(); // t=0
      vi.advanceTimersByTime(2001);
      limiter.recordRequest(); // t=2001

      expect(limiter.getCurrentCount()).toBe(1); // First two expired
    });
  });

  describe('getRemainingRequests()', () => {
    it('should return maxRequests when no requests made', () => {
      const limiter = new RateLimiter({ maxRequests: 50, windowMs: 60000 });

      expect(limiter.getRemainingRequests()).toBe(50);
    });

    it('should return correct remaining after requests', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('should return 0 when at limit', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.getRemainingRequests()).toBe(0);
    });

    it('should return 0 when over limit (not negative)', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest(); // Over limit

      expect(limiter.getRemainingRequests()).toBe(0);
    });

    it('should recover remaining after requests expire', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();
      expect(limiter.getRemainingRequests()).toBe(0);

      vi.advanceTimersByTime(1001);

      expect(limiter.getRemainingRequests()).toBe(3);
    });
  });

  describe('reset()', () => {
    it('should clear all recorded requests', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();
      expect(limiter.getCurrentCount()).toBe(3);

      limiter.reset();

      expect(limiter.getCurrentCount()).toBe(0);
      expect(limiter.canMakeRequest()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(5);
    });
  });

  describe('sliding window behavior', () => {
    it('should handle progressive request expiration', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 3000 });

      // Record at different times
      limiter.recordRequest(); // t=0
      vi.advanceTimersByTime(1000);
      limiter.recordRequest(); // t=1000
      vi.advanceTimersByTime(1000);
      limiter.recordRequest(); // t=2000

      expect(limiter.getCurrentCount()).toBe(3);
      expect(limiter.canMakeRequest()).toBe(false);

      // First request expires at t=3000
      vi.advanceTimersByTime(1001); // t=3001

      expect(limiter.getCurrentCount()).toBe(2);
      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should handle burst then gradual expiration', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 2000 });

      // Burst of 5 at t=0
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }
      expect(limiter.canMakeRequest()).toBe(false);

      // All expire at once after window
      vi.advanceTimersByTime(2001);
      expect(limiter.getCurrentCount()).toBe(0);
      expect(limiter.canMakeRequest()).toBe(true);
    });
  });
});

describe('TieredRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const createTestTiers = () => ({
    tier1: { windowMs: 1000, maxRequests: 1 },
    tier2: { windowMs: 5000, maxRequests: 20 },
    tier3: { windowMs: 60000, maxRequests: 100 },
  });

  describe('constructor', () => {
    it('should create limiters for each tier', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      expect(tiered.canMakeRequest('tier1')).toBe(true);
      expect(tiered.canMakeRequest('tier2')).toBe(true);
      expect(tiered.canMakeRequest('tier3')).toBe(true);
    });
  });

  describe('canMakeRequest()', () => {
    it('should return true when tier is under limit', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      expect(tiered.canMakeRequest('tier2')).toBe(true);
    });

    it('should return false when tier is at limit', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      tiered.recordRequest('tier1'); // tier1 max is 1

      expect(tiered.canMakeRequest('tier1')).toBe(false);
    });

    it('should return true for unknown tier (allow by default)', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      expect(tiered.canMakeRequest('unknown-tier')).toBe(true);
    });

    it('should track tiers independently', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      tiered.recordRequest('tier1');
      // tier1 at limit, but tier2 should still be fine
      expect(tiered.canMakeRequest('tier1')).toBe(false);
      expect(tiered.canMakeRequest('tier2')).toBe(true);
    });
  });

  describe('recordRequest()', () => {
    it('should record request for specific tier', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      tiered.recordRequest('tier2');
      tiered.recordRequest('tier2');

      // tier2 has max 20, so 18 remaining
      expect(tiered.canMakeRequest('tier2')).toBe(true);
    });

    it('should not throw for unknown tier', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      // Should silently ignore unknown tiers
      expect(() => tiered.recordRequest('unknown-tier')).not.toThrow();
    });

    it('should not affect other tiers', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      tiered.recordRequest('tier1');

      expect(tiered.canMakeRequest('tier2')).toBe(true);
      expect(tiered.canMakeRequest('tier3')).toBe(true);
    });
  });

  describe('getTimeUntilAllowed()', () => {
    it('should return 0 when tier is under limit', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      expect(tiered.getTimeUntilAllowed('tier1')).toBe(0);
    });

    it('should return positive time when tier is at limit', () => {
      vi.useFakeTimers();
      const tiered = new TieredRateLimiter(createTestTiers());

      tiered.recordRequest('tier1');

      const timeUntilAllowed = tiered.getTimeUntilAllowed('tier1');
      expect(timeUntilAllowed).toBeGreaterThan(0);
      expect(timeUntilAllowed).toBeLessThanOrEqual(1000);
    });

    it('should return 0 for unknown tier', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      expect(tiered.getTimeUntilAllowed('unknown-tier')).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should reset all tiers', () => {
      const tiered = new TieredRateLimiter(createTestTiers());

      // Fill up tiers
      tiered.recordRequest('tier1');
      tiered.recordRequest('tier2');
      tiered.recordRequest('tier3');

      expect(tiered.canMakeRequest('tier1')).toBe(false);

      tiered.reset();

      expect(tiered.canMakeRequest('tier1')).toBe(true);
      expect(tiered.canMakeRequest('tier2')).toBe(true);
      expect(tiered.canMakeRequest('tier3')).toBe(true);
    });
  });

  describe('multi-tier interaction patterns', () => {
    it('should support API rate limiting pattern (e.g., Slack-like tiers)', () => {
      vi.useFakeTimers();
      const slackLikeLimiter = new TieredRateLimiter({
        'tier-1': { windowMs: 60000, maxRequests: 1 }, // 1 per minute
        'tier-2': { windowMs: 60000, maxRequests: 20 }, // 20 per minute
        'tier-3': { windowMs: 60000, maxRequests: 50 }, // 50 per minute
      });

      // Use tier-1 (strictest)
      slackLikeLimiter.recordRequest('tier-1');
      expect(slackLikeLimiter.canMakeRequest('tier-1')).toBe(false);

      // tier-2 still available
      expect(slackLikeLimiter.canMakeRequest('tier-2')).toBe(true);

      // Wait for tier-1 to reset
      vi.advanceTimersByTime(60001);
      expect(slackLikeLimiter.canMakeRequest('tier-1')).toBe(true);
    });
  });
});
