/**
 * @vitest-environment happy-dom
 */
/**
 * Signup Rate Limiter Tests
 *
 * Tests for PG-016 signup rate limiting functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkSignupRateLimit,
  recordSignupAttempt,
  clearSignupRateLimit,
  getSignupRateLimitInfo,
} from '../signup-rate-limiter';

describe('Signup Rate Limiter', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('checkSignupRateLimit', () => {
    it('allows first attempt', () => {
      const result = checkSignupRateLimit('test@example.com');

      expect(result.canAttempt).toBe(true);
      expect(result.attemptsRemaining).toBe(5);
      expect(result.lockedUntil).toBeNull();
      expect(result.secondsRemaining).toBe(0);
    });

    it('tracks multiple attempts', () => {
      recordSignupAttempt('test@example.com');
      recordSignupAttempt('test@example.com');
      recordSignupAttempt('test@example.com');

      const result = checkSignupRateLimit('test@example.com');

      expect(result.canAttempt).toBe(true);
      expect(result.attemptsRemaining).toBe(2);
    });

    it('locks out after max attempts', () => {
      const email = 'test@example.com';

      // Record 5 attempts
      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email);
      }

      const result = checkSignupRateLimit(email);

      expect(result.canAttempt).toBe(false);
      expect(result.attemptsRemaining).toBe(0);
      expect(result.lockedUntil).not.toBeNull();
      expect(result.message).toMatch(/too many signup attempts/i);
    });

    it('shows warning when attempts are low', () => {
      const email = 'test@example.com';

      // Record 3 attempts (2 remaining)
      for (let i = 0; i < 3; i++) {
        recordSignupAttempt(email);
      }

      const result = checkSignupRateLimit(email);

      expect(result.canAttempt).toBe(true);
      expect(result.attemptsRemaining).toBe(2);
      expect(result.message).toMatch(/2 attempts remaining/i);
    });

    it('shows warning for last attempt', () => {
      const email = 'test@example.com';

      // Record 4 attempts (1 remaining)
      for (let i = 0; i < 4; i++) {
        recordSignupAttempt(email);
      }

      const result = checkSignupRateLimit(email);

      expect(result.canAttempt).toBe(true);
      expect(result.attemptsRemaining).toBe(1);
      expect(result.message).toMatch(/1 attempt remaining/i);
    });

    it('unlocks after lockout expires', () => {
      const email = 'test@example.com';

      // Lock out
      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email);
      }

      // Verify locked
      expect(checkSignupRateLimit(email).canAttempt).toBe(false);

      // Advance time past lockout (15 minutes)
      vi.advanceTimersByTime(16 * 60 * 1000);

      // Should be unlocked now
      const result = checkSignupRateLimit(email);
      expect(result.canAttempt).toBe(true);
      expect(result.attemptsRemaining).toBe(5);
    });

    it('isolates rate limits by email', () => {
      const email1 = 'user1@example.com';
      const email2 = 'user2@example.com';

      // Lock out email1
      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email1);
      }

      // email2 should not be affected
      expect(checkSignupRateLimit(email1).canAttempt).toBe(false);
      expect(checkSignupRateLimit(email2).canAttempt).toBe(true);
    });

    it('normalizes email for comparison', () => {
      const email1 = 'Test@Example.com';
      const email2 = 'test@example.com';

      recordSignupAttempt(email1);
      recordSignupAttempt(email1);

      // Both should show same count
      const result1 = checkSignupRateLimit(email1);
      const result2 = checkSignupRateLimit(email2);

      expect(result1.attemptsRemaining).toBe(3);
      expect(result2.attemptsRemaining).toBe(3);
    });

    it('supports custom configuration', () => {
      const email = 'test@example.com';
      const config = { maxAttempts: 3, lockoutMinutes: 5, windowMinutes: 10 };

      // 3 attempts with custom config
      for (let i = 0; i < 3; i++) {
        recordSignupAttempt(email, config);
      }

      const result = checkSignupRateLimit(email, config);
      expect(result.canAttempt).toBe(false);
    });

    it('cleans up old attempts outside window', () => {
      const email = 'test@example.com';

      // Record 3 attempts
      for (let i = 0; i < 3; i++) {
        recordSignupAttempt(email);
      }

      // Advance time past window (30 minutes)
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Old attempts should be cleared
      const result = checkSignupRateLimit(email);
      expect(result.attemptsRemaining).toBe(5);
    });
  });

  describe('recordSignupAttempt', () => {
    it('increments attempt count', () => {
      const email = 'test@example.com';

      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(5);

      recordSignupAttempt(email);
      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(4);

      recordSignupAttempt(email);
      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(3);
    });

    it('does not record while locked', () => {
      const email = 'test@example.com';

      // Lock out
      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email);
      }

      // Try to record more - should not add
      recordSignupAttempt(email);
      recordSignupAttempt(email);

      // After lockout expires, should start fresh
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(5);
    });
  });

  describe('clearSignupRateLimit', () => {
    it('resets attempt count', () => {
      const email = 'test@example.com';

      recordSignupAttempt(email);
      recordSignupAttempt(email);
      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(3);

      clearSignupRateLimit(email);
      expect(checkSignupRateLimit(email).attemptsRemaining).toBe(5);
    });

    it('clears lockout', () => {
      const email = 'test@example.com';

      // Lock out
      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email);
      }
      expect(checkSignupRateLimit(email).canAttempt).toBe(false);

      clearSignupRateLimit(email);
      expect(checkSignupRateLimit(email).canAttempt).toBe(true);
    });
  });

  describe('getSignupRateLimitInfo', () => {
    it('returns not limited when no attempts', () => {
      const info = getSignupRateLimitInfo('test@example.com');

      expect(info.isLimited).toBe(false);
      expect(info.message).toBe('');
    });

    it('returns limited when locked out', () => {
      const email = 'test@example.com';

      for (let i = 0; i < 5; i++) {
        recordSignupAttempt(email);
      }

      const info = getSignupRateLimitInfo(email);
      expect(info.isLimited).toBe(true);
      expect(info.message).toMatch(/too many/i);
    });

    it('returns warning when attempts are low', () => {
      const email = 'test@example.com';

      for (let i = 0; i < 4; i++) {
        recordSignupAttempt(email);
      }

      const info = getSignupRateLimitInfo(email);
      expect(info.isLimited).toBe(false);
      expect(info.message).toMatch(/1 attempt remaining/i);
    });
  });

  describe('Edge cases', () => {
    it('handles empty email', () => {
      const result = checkSignupRateLimit('');
      expect(result.canAttempt).toBe(true);
    });

    it('handles special characters in email', () => {
      const email = 'user+test@example.com';
      recordSignupAttempt(email);
      const result = checkSignupRateLimit(email);
      expect(result.attemptsRemaining).toBe(4);
    });

    it('handles localStorage errors gracefully', () => {
      // Mock localStorage.setItem to throw
      const originalSetItem = localStorage.setItem;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      localStorage.setItem = () => {
        throw new Error('QuotaExceeded');
      };

      // Should not throw
      expect(() => recordSignupAttempt('test@example.com')).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      localStorage.setItem = originalSetItem;
      consoleWarnSpy.mockRestore();
    });

    it('handles corrupted localStorage data', () => {
      // Store invalid JSON
      localStorage.setItem('intelliflow_signup_rate_limit_test', 'invalid json');

      // Should handle gracefully
      const result = checkSignupRateLimit('test@example.com');
      expect(result.canAttempt).toBe(true);
    });
  });
});
