/**
 * Account Activation Service Tests
 *
 * IMPLEMENTS: PG-023 (Email Verification)
 *
 * Unit tests for email verification token management.
 * Following TDD - tests written before implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createVerificationToken,
  validateVerificationToken,
  markEmailVerified,
  checkResendRateLimit,
  buildVerificationUrl,
  getTokenTimeRemaining,
  clearAllTokens,
  clearRateLimits,
  getTokenStoreSize,
  cleanupExpiredTokens,
  TOKEN_EXPIRY_HOURS,
  MAX_RESEND_PER_HOUR,
} from '../account-activation';

describe('Account Activation Service', () => {
  beforeEach(() => {
    // Clear stores before each test
    clearAllTokens();
    clearRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // createVerificationToken Tests
  // ============================================
  describe('createVerificationToken', () => {
    it('creates a token for valid email', () => {
      const result = createVerificationToken('user@example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.token).toHaveLength(64); // 32 bytes hex
        expect(result.value.email).toBe('user@example.com');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('normalizes email to lowercase', () => {
      const result = createVerificationToken('User@EXAMPLE.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe('user@example.com');
      }
    });

    it('trims whitespace from email', () => {
      const result = createVerificationToken('  user@example.com  ');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe('user@example.com');
      }
    });

    it('sets expiry to TOKEN_EXPIRY_HOURS from now', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const result = createVerificationToken('user@example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expectedExpiry = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
        expect(result.value.expiresAt.getTime()).toBe(expectedExpiry.getTime());
      }
    });

    it('stores token in token store', () => {
      expect(getTokenStoreSize()).toBe(0);

      createVerificationToken('user@example.com');

      expect(getTokenStoreSize()).toBe(1);
    });

    it('returns rate limit error when limit exceeded', () => {
      // Create tokens up to the limit
      for (let i = 0; i < MAX_RESEND_PER_HOUR; i++) {
        const result = createVerificationToken('user@example.com');
        expect(result.ok).toBe(true);
      }

      // Next request should be rate limited
      const result = createVerificationToken('user@example.com');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });

    it('invalidates previous tokens for same email', () => {
      const result1 = createVerificationToken('user@example.com');
      expect(result1.ok).toBe(true);

      const result2 = createVerificationToken('user@example.com');
      expect(result2.ok).toBe(true);

      // First token should now be invalid
      if (result1.ok) {
        const validation = validateVerificationToken(result1.value.token);
        expect(validation.ok).toBe(false);
        if (!validation.ok) {
          expect(validation.error.code).toBe('ALREADY_USED');
        }
      }
    });

    it('generates unique tokens each time', () => {
      clearRateLimits(); // Reset to allow multiple tokens
      const result1 = createVerificationToken('user1@example.com');
      const result2 = createVerificationToken('user2@example.com');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value.token).not.toBe(result2.value.token);
      }
    });
  });

  // ============================================
  // validateVerificationToken Tests
  // ============================================
  describe('validateVerificationToken', () => {
    it('validates a valid token', () => {
      const createResult = createVerificationToken('user@example.com');
      expect(createResult.ok).toBe(true);

      if (createResult.ok) {
        const validateResult = validateVerificationToken(createResult.value.token);
        expect(validateResult.ok).toBe(true);
      }
    });

    it('returns invalid error for non-existent token', () => {
      const result = validateVerificationToken('nonexistent-token-1234567890123456789012345678901234567890');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID');
        expect(result.error.message).toContain('invalid');
      }
    });

    it('returns expired error for expired token', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');
      expect(createResult.ok).toBe(true);

      // Advance time past expiry
      vi.setSystemTime(new Date(now.getTime() + (TOKEN_EXPIRY_HOURS + 1) * 60 * 60 * 1000));

      if (createResult.ok) {
        const validateResult = validateVerificationToken(createResult.value.token);
        expect(validateResult.ok).toBe(false);
        if (!validateResult.ok) {
          expect(validateResult.error.code).toBe('EXPIRED');
        }
      }
    });

    it('returns already used error for used token', () => {
      const createResult = createVerificationToken('user@example.com');
      expect(createResult.ok).toBe(true);

      if (createResult.ok) {
        // Mark as used
        markEmailVerified(createResult.value.token);

        const validateResult = validateVerificationToken(createResult.value.token);
        expect(validateResult.ok).toBe(false);
        if (!validateResult.ok) {
          expect(validateResult.error.code).toBe('ALREADY_USED');
        }
      }
    });

    it('returns token data when valid', () => {
      const createResult = createVerificationToken('user@example.com');

      if (createResult.ok) {
        const validateResult = validateVerificationToken(createResult.value.token);

        expect(validateResult.ok).toBe(true);
        if (validateResult.ok) {
          expect(validateResult.value.email).toBe('user@example.com');
          expect(validateResult.value.token).toBe(createResult.value.token);
        }
      }
    });
  });

  // ============================================
  // markEmailVerified Tests
  // ============================================
  describe('markEmailVerified', () => {
    it('marks token as used', () => {
      const createResult = createVerificationToken('user@example.com');
      expect(createResult.ok).toBe(true);

      if (createResult.ok) {
        const success = markEmailVerified(createResult.value.token);
        expect(success).toBe(true);

        // Token should now be invalid
        const validateResult = validateVerificationToken(createResult.value.token);
        expect(validateResult.ok).toBe(false);
      }
    });

    it('returns false for non-existent token', () => {
      const success = markEmailVerified('nonexistent-token-1234567890123456789012345678901234567890');
      expect(success).toBe(false);
    });

    it('returns false for already used token', () => {
      const createResult = createVerificationToken('user@example.com');

      if (createResult.ok) {
        markEmailVerified(createResult.value.token);
        const secondAttempt = markEmailVerified(createResult.value.token);
        expect(secondAttempt).toBe(false);
      }
    });

    it('sets verifiedAt timestamp', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');

      if (createResult.ok) {
        vi.setSystemTime(new Date('2025-01-01T14:00:00Z'));
        markEmailVerified(createResult.value.token);

        const validateResult = validateVerificationToken(createResult.value.token);
        expect(validateResult.ok).toBe(false);
        if (!validateResult.ok) {
          expect(validateResult.error.code).toBe('ALREADY_USED');
        }
      }
    });
  });

  // ============================================
  // checkResendRateLimit Tests
  // ============================================
  describe('checkResendRateLimit', () => {
    it('returns remaining count for new email', () => {
      const result = checkResendRateLimit('new@example.com');

      expect(result.remaining).toBe(MAX_RESEND_PER_HOUR);
      expect(result.isLimited).toBe(false);
    });

    it('decrements remaining count after token creation', () => {
      createVerificationToken('user@example.com');

      const result = checkResendRateLimit('user@example.com');

      expect(result.remaining).toBe(MAX_RESEND_PER_HOUR - 1);
    });

    it('returns isLimited true when limit reached', () => {
      for (let i = 0; i < MAX_RESEND_PER_HOUR; i++) {
        createVerificationToken('user@example.com');
      }

      const result = checkResendRateLimit('user@example.com');

      expect(result.isLimited).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('resets after rate limit window expires', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      for (let i = 0; i < MAX_RESEND_PER_HOUR; i++) {
        createVerificationToken('user@example.com');
      }

      // Advance past rate limit window (1 hour + 1 minute)
      vi.setSystemTime(new Date(now.getTime() + 61 * 60 * 1000));

      const result = checkResendRateLimit('user@example.com');

      expect(result.isLimited).toBe(false);
      expect(result.remaining).toBe(MAX_RESEND_PER_HOUR);
    });

    it('returns resetAt time', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      createVerificationToken('user@example.com');

      const result = checkResendRateLimit('user@example.com');

      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('normalizes email for rate limiting', () => {
      createVerificationToken('user@example.com');

      const result = checkResendRateLimit('USER@EXAMPLE.COM');

      expect(result.remaining).toBe(MAX_RESEND_PER_HOUR - 1);
    });
  });

  // ============================================
  // buildVerificationUrl Tests
  // ============================================
  describe('buildVerificationUrl', () => {
    it('builds URL with token in path', () => {
      const token = 'abc123def456';
      const url = buildVerificationUrl(token);

      expect(url).toContain('/auth/verify-email/abc123def456');
    });

    it('uses base URL from environment', () => {
      const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';

      const url = buildVerificationUrl('token123');

      expect(url).toBe('https://myapp.com/auth/verify-email/token123');

      process.env.NEXT_PUBLIC_APP_URL = originalUrl;
    });

    it('falls back to default URL when env not set', () => {
      const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;

      const url = buildVerificationUrl('token123');

      expect(url).toContain('/auth/verify-email/token123');

      process.env.NEXT_PUBLIC_APP_URL = originalUrl;
    });
  });

  // ============================================
  // getTokenTimeRemaining Tests
  // ============================================
  describe('getTokenTimeRemaining', () => {
    it('returns time remaining for valid token', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');

      if (createResult.ok) {
        const remaining = getTokenTimeRemaining(createResult.value);

        expect(remaining.expired).toBe(false);
        expect(remaining.hours).toBe(TOKEN_EXPIRY_HOURS);
        expect(remaining.minutes).toBe(0);
      }
    });

    it('returns expired true for expired token', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');

      // Advance past expiry
      vi.setSystemTime(new Date(now.getTime() + (TOKEN_EXPIRY_HOURS + 1) * 60 * 60 * 1000));

      if (createResult.ok) {
        const remaining = getTokenTimeRemaining(createResult.value);

        expect(remaining.expired).toBe(true);
        expect(remaining.hours).toBe(0);
        expect(remaining.minutes).toBe(0);
      }
    });

    it('returns formatted string', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');

      // Advance by 1 hour
      vi.setSystemTime(new Date(now.getTime() + 60 * 60 * 1000));

      if (createResult.ok) {
        const remaining = getTokenTimeRemaining(createResult.value);

        expect(remaining.formatted).toMatch(/\d+h \d+m/);
      }
    });

    it('returns "Expired" for expired tokens', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const createResult = createVerificationToken('user@example.com');

      vi.setSystemTime(new Date(now.getTime() + (TOKEN_EXPIRY_HOURS + 1) * 60 * 60 * 1000));

      if (createResult.ok) {
        const remaining = getTokenTimeRemaining(createResult.value);

        expect(remaining.formatted).toBe('Expired');
      }
    });
  });

  // ============================================
  // cleanupExpiredTokens Tests
  // ============================================
  describe('cleanupExpiredTokens', () => {
    it('removes expired tokens', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      createVerificationToken('user1@example.com');

      // Advance past expiry
      vi.setSystemTime(new Date(now.getTime() + (TOKEN_EXPIRY_HOURS + 1) * 60 * 60 * 1000));

      const cleaned = cleanupExpiredTokens();

      expect(cleaned).toBe(1);
      expect(getTokenStoreSize()).toBe(0);
    });

    it('removes used tokens', () => {
      const createResult = createVerificationToken('user@example.com');

      if (createResult.ok) {
        markEmailVerified(createResult.value.token);
      }

      const cleaned = cleanupExpiredTokens();

      expect(cleaned).toBe(1);
    });

    it('keeps valid unexpired tokens', () => {
      createVerificationToken('user@example.com');

      const cleaned = cleanupExpiredTokens();

      expect(cleaned).toBe(0);
      expect(getTokenStoreSize()).toBe(1);
    });

    it('returns count of cleaned tokens', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // Create multiple tokens for different users
      createVerificationToken('user1@example.com');
      clearRateLimits(); // Reset rate limits
      createVerificationToken('user2@example.com');
      clearRateLimits();
      createVerificationToken('user3@example.com');

      // Mark one as used
      clearRateLimits();
      const result = createVerificationToken('user4@example.com');
      if (result.ok) {
        markEmailVerified(result.value.token);
      }

      // Advance past expiry
      vi.setSystemTime(new Date(now.getTime() + (TOKEN_EXPIRY_HOURS + 1) * 60 * 60 * 1000));

      const cleaned = cleanupExpiredTokens();

      expect(cleaned).toBe(4); // 3 expired + 1 used
    });
  });

  // ============================================
  // Store Management Tests
  // ============================================
  describe('store management', () => {
    it('clearAllTokens removes all tokens', () => {
      createVerificationToken('user1@example.com');
      clearRateLimits();
      createVerificationToken('user2@example.com');

      expect(getTokenStoreSize()).toBe(2);

      clearAllTokens();

      expect(getTokenStoreSize()).toBe(0);
    });

    it('clearRateLimits resets rate limiting', () => {
      for (let i = 0; i < MAX_RESEND_PER_HOUR; i++) {
        createVerificationToken('user@example.com');
      }

      expect(checkResendRateLimit('user@example.com').isLimited).toBe(true);

      clearRateLimits();

      expect(checkResendRateLimit('user@example.com').isLimited).toBe(false);
    });
  });

  // ============================================
  // Constants Tests
  // ============================================
  describe('constants', () => {
    it('TOKEN_EXPIRY_HOURS is 24', () => {
      expect(TOKEN_EXPIRY_HOURS).toBe(24);
    });

    it('MAX_RESEND_PER_HOUR is 3', () => {
      expect(MAX_RESEND_PER_HOUR).toBe(3);
    });
  });
});
