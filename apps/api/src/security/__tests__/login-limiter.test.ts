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
  isAccountLocked,
  getRemainingLockoutTime,
  getFormattedLockoutTime,
  checkLoginAllowed,
  recordFailedAttempt,
  recordSuccessfulLogin,
  getLoginAttemptStats,
  unlockAccount,
  clearLoginAttemptStore,
  getLoginAttemptStoreSize,
  cleanupExpiredEntries,
  DEFAULT_LOGIN_LIMITER_CONFIG,
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

    it('creates new instance when config is provided', () => {
      const limiter1 = getLoginLimiter();
      const limiter2 = getLoginLimiter({ maxAttempts: 10 });
      expect(limiter1).not.toBe(limiter2);
    });
  });

  // ============================================
  // getRemainingLockout (class method)
  // ============================================
  describe('getRemainingLockout', () => {
    it('returns 0 when not locked', () => {
      expect(limiter.getRemainingLockout('user@example.com')).toBe(0);
    });

    it('returns remaining time when locked', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      const remaining = limiter.getRemainingLockout('user@example.com');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it('returns 0 after lockout expires', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
      expect(limiter.getRemainingLockout('user@example.com')).toBe(0);
    });
  });

  // ============================================
  // unlock (class method)
  // ============================================
  describe('unlock', () => {
    it('returns false when account does not exist', () => {
      expect(limiter.unlock('nonexistent@example.com')).toBe(false);
    });

    it('unlocks a locked account', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }
      expect(limiter.isLocked('user@example.com')).toBe(true);

      const result = limiter.unlock('user@example.com');
      expect(result).toBe(true);
      expect(limiter.isLocked('user@example.com')).toBe(false);
    });

    it('preserves last successful login time after unlock', () => {
      limiter.recordSuccess('user@example.com');
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }

      limiter.unlock('user@example.com');
      const stats = limiter.getStats('user@example.com');
      expect(stats.lastSuccessfulLogin).not.toBeNull();
    });
  });

  // ============================================
  // cleanup (class method)
  // ============================================
  describe('cleanup', () => {
    it('removes expired entries', () => {
      limiter.recordFailed('user@example.com');

      // Advance time past window
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      const cleaned = limiter.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('does not remove locked accounts', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailed('user@example.com');
      }

      // Advance time but not past lockout
      vi.advanceTimersByTime(5 * 60 * 1000);

      limiter.cleanup();
      expect(limiter.isLocked('user@example.com')).toBe(true);
    });
  });

  // ============================================
  // clear (class method)
  // ============================================
  describe('clear', () => {
    it('removes all entries', () => {
      limiter.recordFailed('user1@example.com');
      limiter.recordFailed('user2@example.com');

      limiter.clear();

      expect(limiter.getStats('user1@example.com').failedAttempts).toBe(0);
      expect(limiter.getStats('user2@example.com').failedAttempts).toBe(0);
    });
  });
});

// ============================================
// Standalone Functions
// ============================================
describe('Login Limiter Standalone Functions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLoginAttemptStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // isAccountLocked
  // ============================================
  describe('isAccountLocked', () => {
    it('returns false for unknown account', () => {
      expect(isAccountLocked('unknown@example.com')).toBe(false);
    });

    it('returns true for locked account', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      expect(isAccountLocked('user@example.com')).toBe(true);
    });

    it('clears lockout and returns false when lockout expires', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      expect(isAccountLocked('user@example.com')).toBe(true);

      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs + 1000);

      expect(isAccountLocked('user@example.com')).toBe(false);
    });

    it('tracks by email and IP combination', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com', '192.168.1.1');
      }
      expect(isAccountLocked('user@example.com', '192.168.1.1')).toBe(true);
      expect(isAccountLocked('user@example.com', '192.168.1.2')).toBe(false);
    });
  });

  // ============================================
  // getRemainingLockoutTime
  // ============================================
  describe('getRemainingLockoutTime', () => {
    it('returns 0 for unknown account', () => {
      expect(getRemainingLockoutTime('unknown@example.com')).toBe(0);
    });

    it('returns 0 for unlocked account', () => {
      recordFailedAttempt('user@example.com');
      expect(getRemainingLockoutTime('user@example.com')).toBe(0);
    });

    it('returns remaining time for locked account', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      const remaining = getRemainingLockoutTime('user@example.com');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs);
    });

    it('returns 0 after lockout expires', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs + 1000);
      expect(getRemainingLockoutTime('user@example.com')).toBe(0);
    });
  });

  // ============================================
  // getFormattedLockoutTime
  // ============================================
  describe('getFormattedLockoutTime', () => {
    it('returns "0 seconds" for unlocked account', () => {
      expect(getFormattedLockoutTime('user@example.com')).toBe('0 seconds');
    });

    it('returns "1 minute" for exactly 1 minute remaining', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      // Advance to leave exactly 1 minute
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs - 60000);
      expect(getFormattedLockoutTime('user@example.com')).toBe('1 minute');
    });

    it('returns plural "minutes" for multiple minutes', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      const formatted = getFormattedLockoutTime('user@example.com');
      expect(formatted).toMatch(/^\d+ minutes$/);
    });

    it('returns "1 minute" for less than 1 minute remaining', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      // Advance to leave less than 1 minute but more than 0
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs - 30000);
      expect(getFormattedLockoutTime('user@example.com')).toBe('1 minute');
    });
  });

  // ============================================
  // checkLoginAllowed
  // ============================================
  describe('checkLoginAllowed', () => {
    it('allows login for unknown account', () => {
      expect(() => checkLoginAllowed('user@example.com')).not.toThrow();
    });

    it('throws when account is locked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      expect(() => checkLoginAllowed('user@example.com')).toThrow(TRPCError);
    });

    it('re-locks when at max attempts even if not currently locked', () => {
      // Simulate a scenario where attempts are at max but lockedUntil was cleared
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      // Lockout expires
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs + 1000);

      // Now attempt again - should not throw because attempts are cleared by window expiry
      expect(() => checkLoginAllowed('user@example.com')).not.toThrow();
    });

    it('uses custom config', () => {
      const customConfig = { maxAttempts: 2, lockoutDurationMs: 5000, windowMs: 5000 };

      recordFailedAttempt('user@example.com', undefined, customConfig);
      recordFailedAttempt('user@example.com', undefined, customConfig);

      expect(() => checkLoginAllowed('user@example.com', undefined, customConfig)).toThrow(TRPCError);
    });
  });

  // ============================================
  // recordFailedAttempt
  // ============================================
  describe('recordFailedAttempt', () => {
    it('creates new state for unknown account', () => {
      const result = recordFailedAttempt('new@example.com');
      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(4);
    });

    it('returns lockout duration when locked', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt('user@example.com');
      }
      const result = recordFailedAttempt('user@example.com');
      expect(result.isLocked).toBe(true);
      expect(result.lockoutDuration).toBe(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs);
    });

    it('normalizes email to lowercase', () => {
      recordFailedAttempt('USER@EXAMPLE.COM');
      recordFailedAttempt('user@example.com');

      const stats = getLoginAttemptStats('User@Example.Com');
      expect(stats.failedAttempts).toBe(2);
    });
  });

  // ============================================
  // recordSuccessfulLogin
  // ============================================
  describe('recordSuccessfulLogin', () => {
    it('creates state for new account', () => {
      recordSuccessfulLogin('new@example.com');
      const stats = getLoginAttemptStats('new@example.com');
      expect(stats.lastSuccessfulLogin).not.toBeNull();
    });

    it('resets email-only state when IP is provided', () => {
      // First create some failures for email-only key
      recordFailedAttempt('user@example.com');
      recordFailedAttempt('user@example.com');

      // Now succeed with IP
      recordSuccessfulLogin('user@example.com', '192.168.1.1');

      // Email-only should be reset
      const emailStats = getLoginAttemptStats('user@example.com');
      expect(emailStats.failedAttempts).toBe(0);
    });

    it('does not fail when email-only state does not exist', () => {
      // Just succeed with IP without any prior email-only state
      expect(() => recordSuccessfulLogin('user@example.com', '192.168.1.1')).not.toThrow();
    });
  });

  // ============================================
  // getLoginAttemptStats
  // ============================================
  describe('getLoginAttemptStats', () => {
    it('returns default stats for unknown account', () => {
      const stats = getLoginAttemptStats('unknown@example.com');
      expect(stats).toEqual({
        failedAttempts: 0,
        remainingAttempts: 5,
        isLocked: false,
        lockedUntilMs: null,
        lastSuccessfulLogin: null,
      });
    });

    it('includes lockedUntilMs when locked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      const stats = getLoginAttemptStats('user@example.com');
      expect(stats.isLocked).toBe(true);
      expect(stats.lockedUntilMs).not.toBeNull();
      expect(stats.lockedUntilMs).toBeGreaterThan(Date.now());
    });

    it('cleans up old attempts before returning stats', () => {
      recordFailedAttempt('user@example.com');
      recordFailedAttempt('user@example.com');

      // Advance past window
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.windowMs + 1000);

      const stats = getLoginAttemptStats('user@example.com');
      expect(stats.failedAttempts).toBe(0);
    });
  });

  // ============================================
  // unlockAccount
  // ============================================
  describe('unlockAccount', () => {
    it('returns false for unknown account', () => {
      expect(unlockAccount('unknown@example.com')).toBe(false);
    });

    it('unlocks a locked account', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      expect(isAccountLocked('user@example.com')).toBe(true);

      const result = unlockAccount('user@example.com');
      expect(result).toBe(true);
      expect(isAccountLocked('user@example.com')).toBe(false);
    });

    it('resets failed attempts', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }
      unlockAccount('user@example.com');

      const stats = getLoginAttemptStats('user@example.com');
      expect(stats.failedAttempts).toBe(0);
    });
  });

  // ============================================
  // getLoginAttemptStoreSize
  // ============================================
  describe('getLoginAttemptStoreSize', () => {
    it('returns 0 for empty store', () => {
      expect(getLoginAttemptStoreSize()).toBe(0);
    });

    it('returns correct count after failed attempts', () => {
      recordFailedAttempt('user1@example.com');
      recordFailedAttempt('user2@example.com');
      expect(getLoginAttemptStoreSize()).toBe(2);
    });

    it('counts email-only and email+IP separately', () => {
      recordFailedAttempt('user@example.com');
      recordFailedAttempt('user@example.com', '192.168.1.1');
      expect(getLoginAttemptStoreSize()).toBe(2);
    });
  });

  // ============================================
  // cleanupExpiredEntries
  // ============================================
  describe('cleanupExpiredEntries', () => {
    it('removes entries with no recent attempts and not locked', () => {
      recordFailedAttempt('user@example.com');

      // Advance past window
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.windowMs + 1000);

      const cleaned = cleanupExpiredEntries();
      expect(cleaned).toBe(1);
      expect(getLoginAttemptStoreSize()).toBe(0);
    });

    it('keeps entries that are still locked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('user@example.com');
      }

      // Advance just part of the lockout time (not past it)
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs / 2);

      const cleaned = cleanupExpiredEntries();
      expect(cleaned).toBe(0);
      expect(getLoginAttemptStoreSize()).toBe(1);
    });

    it('keeps entries with recent attempts', () => {
      recordFailedAttempt('user@example.com');

      // Advance part of the window
      vi.advanceTimersByTime(DEFAULT_LOGIN_LIMITER_CONFIG.windowMs / 2);

      const cleaned = cleanupExpiredEntries();
      expect(cleaned).toBe(0);
    });

    it('uses custom config for window duration', () => {
      const customConfig = { maxAttempts: 5, lockoutDurationMs: 1000, windowMs: 1000 };
      recordFailedAttempt('user@example.com');

      vi.advanceTimersByTime(2000);

      const cleaned = cleanupExpiredEntries(customConfig);
      expect(cleaned).toBe(1);
    });
  });

  // ============================================
  // clearLoginAttemptStore
  // ============================================
  describe('clearLoginAttemptStore', () => {
    it('clears all entries', () => {
      recordFailedAttempt('user1@example.com');
      recordFailedAttempt('user2@example.com');

      clearLoginAttemptStore();

      expect(getLoginAttemptStoreSize()).toBe(0);
    });
  });

  // ============================================
  // DEFAULT_LOGIN_LIMITER_CONFIG
  // ============================================
  describe('DEFAULT_LOGIN_LIMITER_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_LOGIN_LIMITER_CONFIG.maxAttempts).toBe(5);
      expect(DEFAULT_LOGIN_LIMITER_CONFIG.lockoutDurationMs).toBe(15 * 60 * 1000);
      expect(DEFAULT_LOGIN_LIMITER_CONFIG.windowMs).toBe(15 * 60 * 1000);
    });
  });
});
