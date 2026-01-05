/**
 * Login Rate Limiter Tests
 *
 * Tests for the login attempt rate limiting functionality.
 *
 * IMPLEMENTS: PG-015 (Sign In page)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  LoginLimiter,
  getLoginLimiter,
  resetLoginLimiter,
} from '../login-limiter';

describe('LoginLimiter', () => {
  let limiter: LoginLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    resetLoginLimiter();
    limiter = getLoginLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      lockoutDurationMs: 15 * 60 * 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // checkAllowed
  // ============================================
  describe('checkAllowed', () => {
    it('allows login when no previous attempts', () => {
      expect(() => limiter.checkAllowed('user@example.com')).not.toThrow();
    });

    it('allows login after successful previous login', () => {
      limiter.recordSuccess('user@example.com');
      expect(() => limiter.checkAllowed('user@example.com')).not.toThrow();
    });

    it('allows login with less than max failed attempts', () => {
      for (let i = 0; i < 4; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(() => limiter.checkAllowed('user@example.com')).not.toThrow();
    });

    it('throws TRPCError after max failed attempts', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(() => limiter.checkAllowed('user@example.com')).toThrow(TRPCError);
    });

    it('includes correct error details', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      try {
        limiter.checkAllowed('user@example.com');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe('TOO_MANY_REQUESTS');
        expect((error as TRPCError).message).toContain('locked');
      }
    });
  });

  // ============================================
  // recordFailed
  // ============================================
  describe('recordFailed', () => {
    it('increments attempt count', () => {
      let result = limiter.recordFailed('user@example.com');
      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(4);

      result = limiter.recordFailed('user@example.com');
      expect(result.remainingAttempts).toBe(3);
    });

    it('locks account after max attempts', () => {
      for (let i = 0; i < 4; i++) {
        limiter.recordFailed('user@example.com');
      }
      const result = limiter.recordFailed('user@example.com');
      expect(result.isLocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
    });

    it('tracks by email', () => {
      limiter.recordFailed('user1@example.com');
      limiter.recordFailed('user1@example.com');
      const result = limiter.recordFailed('user2@example.com');
      expect(result.remainingAttempts).toBe(4);
    });

    it('tracks by email and IP combination', () => {
      limiter.recordFailed('user@example.com', '192.168.1.1');
      const result = limiter.recordFailed('user@example.com', '192.168.1.1');
      expect(result.remainingAttempts).toBe(3);
    });
  });

  // ============================================
  // recordSuccess
  // ============================================
  describe('recordSuccess', () => {
    it('resets attempt count', () => {
      limiter.recordFailed('user@example.com');
      limiter.recordFailed('user@example.com');
      limiter.recordSuccess('user@example.com');

      const result = limiter.recordFailed('user@example.com');
      expect(result.remainingAttempts).toBe(4);
    });

    it('unlocks locked account', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(limiter.isLocked('user@example.com')).toBe(true);

      limiter.recordSuccess('user@example.com');
      expect(limiter.isLocked('user@example.com')).toBe(false);
    });

    it('resets both email and IP tracking', () => {
      limiter.recordFailed('user@example.com', '192.168.1.1');
      limiter.recordFailed('user@example.com', '192.168.1.1');
      limiter.recordSuccess('user@example.com', '192.168.1.1');

      expect(() => limiter.checkAllowed('user@example.com', '192.168.1.1')).not.toThrow();
    });
  });

  // ============================================
  // isLocked
  // ============================================
  describe('isLocked', () => {
    it('returns false when not locked', () => {
      expect(limiter.isLocked('user@example.com')).toBe(false);
    });

    it('returns true when locked', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(limiter.isLocked('user@example.com')).toBe(true);
    });

    it('returns false after lockout expires', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(limiter.isLocked('user@example.com')).toBe(true);

      // Advance time past the lockout window
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      expect(limiter.isLocked('user@example.com')).toBe(false);
    });
  });

  // ============================================
  // getStats
  // ============================================
  describe('getStats', () => {
    it('returns correct stats when no failures', () => {
      const stats = limiter.getStats('user@example.com');
      expect(stats.failedAttempts).toBe(0);
      expect(stats.remainingAttempts).toBe(5);
      expect(stats.isLocked).toBe(false);
    });

    it('returns correct stats after failures', () => {
      limiter.recordFailed('user@example.com');
      const stats = limiter.getStats('user@example.com');
      expect(stats.failedAttempts).toBe(1);
      expect(stats.remainingAttempts).toBe(4);
    });

    it('returns 0 remaining when locked', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      const stats = limiter.getStats('user@example.com');
      expect(stats.remainingAttempts).toBe(0);
      expect(stats.isLocked).toBe(true);
    });
  });

  // ============================================
  // Time-based expiry
  // ============================================
  describe('time-based expiry', () => {
    it('resets attempts after window expires', () => {
      limiter.recordFailed('user@example.com');
      limiter.recordFailed('user@example.com');

      // Advance time past the window
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      const result = limiter.recordFailed('user@example.com');
      expect(result.remainingAttempts).toBe(4);
    });

    it('unlocks account after block duration', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }

      // Advance time past the block duration
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      expect(() => limiter.checkAllowed('user@example.com')).not.toThrow();
    });
  });

  // ============================================
  // Singleton behavior
  // ============================================
  describe('getLoginLimiter', () => {
    it('returns same instance when called multiple times', () => {
      const limiter1 = getLoginLimiter();
      const limiter2 = getLoginLimiter();
      expect(limiter1).toBe(limiter2);
    });

    it('returns new instance after reset', () => {
      const limiter1 = getLoginLimiter();
      resetLoginLimiter();
      const limiter2 = getLoginLimiter();
      expect(limiter1).not.toBe(limiter2);
    });
  });
});
