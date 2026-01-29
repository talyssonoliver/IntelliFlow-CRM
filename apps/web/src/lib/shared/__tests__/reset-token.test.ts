/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateSecureToken,
  hashToken,
  createResetToken,
  validateResetToken,
  markTokenUsed,
  invalidateTokensForEmail,
  checkRateLimit,
  buildResetUrl,
  extractTokenFromUrl,
  getTokenTimeRemaining,
  isTokenExpiringSoon,
  cleanupExpiredTokens,
  clearAllTokens,
  clearRateLimits,
  getTokenStoreSize,
} from '../reset-token';

describe('reset-token', () => {
  beforeEach(() => {
    clearAllTokens();
    clearRateLimits();
  });

  afterEach(() => {
    clearAllTokens();
    clearRateLimits();
  });

  describe('generateSecureToken', () => {
    it('generates token of correct length', () => {
      const token = generateSecureToken();
      // 32 bytes = 64 hex characters
      expect(token).toHaveLength(64);
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('generates hex string', () => {
      const token = generateSecureToken();
      expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
    });

    it('respects custom length', () => {
      const token = generateSecureToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });

  describe('hashToken', () => {
    it('creates consistent hashes', () => {
      const token = 'test-token-123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('creates different hashes for different tokens', () => {
      const hash1 = hashToken('token1');
      const hash2 = hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character SHA256 hash', () => {
      const hash = hashToken('any-token');
      expect(hash).toHaveLength(64);
    });
  });

  describe('createResetToken', () => {
    it('creates token successfully', () => {
      const result = createResetToken('test@example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.token).toBeDefined();
        expect(result.value.hashedToken).toBeDefined();
        expect(result.value.email).toBe('test@example.com');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
        expect(result.value.createdAt).toBeInstanceOf(Date);
      }
    });

    it('normalizes email to lowercase', () => {
      const result = createResetToken('TEST@EXAMPLE.COM');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe('test@example.com');
      }
    });

    it('trims whitespace from email', () => {
      const result = createResetToken('  test@example.com  ');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe('test@example.com');
      }
    });

    it('increments token store', () => {
      expect(getTokenStoreSize()).toBe(0);

      createResetToken('test@example.com');
      expect(getTokenStoreSize()).toBe(1);

      createResetToken('test2@example.com');
      expect(getTokenStoreSize()).toBe(2);
    });

    it('rate limits after max requests', () => {
      const email = 'ratelimit@example.com';

      // First 3 requests should succeed
      expect(createResetToken(email).ok).toBe(true);
      expect(createResetToken(email).ok).toBe(true);
      expect(createResetToken(email).ok).toBe(true);

      // 4th request should be rate limited
      const result = createResetToken(email);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('validateResetToken', () => {
    it('validates valid token', () => {
      const createResult = createResetToken('test@example.com');
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const validateResult = validateResetToken(createResult.value.token);
      expect(validateResult.ok).toBe(true);
    });

    it('rejects invalid token', () => {
      const result = validateResetToken('invalid-token-12345');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID');
      }
    });

    it('rejects used token', () => {
      const createResult = createResetToken('test@example.com');
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Mark as used
      markTokenUsed(createResult.value.token);

      // Try to validate
      const validateResult = validateResetToken(createResult.value.token);
      expect(validateResult.ok).toBe(false);
      if (!validateResult.ok) {
        expect(validateResult.error.code).toBe('ALREADY_USED');
      }
    });
  });

  describe('markTokenUsed', () => {
    it('marks token as used', () => {
      const createResult = createResetToken('test@example.com');
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const marked = markTokenUsed(createResult.value.token);
      expect(marked).toBe(true);

      // Should now be invalid
      const validateResult = validateResetToken(createResult.value.token);
      expect(validateResult.ok).toBe(false);
    });

    it('returns false for invalid token', () => {
      const marked = markTokenUsed('nonexistent-token');
      expect(marked).toBe(false);
    });
  });

  describe('invalidateTokensForEmail', () => {
    it('invalidates all tokens for email', () => {
      createResetToken('test@example.com');
      createResetToken('test@example.com');
      createResetToken('other@example.com');

      const count = invalidateTokensForEmail('test@example.com');
      expect(count).toBe(2);
    });

    it('returns 0 when no tokens exist', () => {
      const count = invalidateTokensForEmail('nonexistent@example.com');
      expect(count).toBe(0);
    });
  });

  describe('checkRateLimit', () => {
    it('returns full limit for new email', () => {
      const result = checkRateLimit('new@example.com');

      expect(result.remaining).toBe(3);
      expect(result.isLimited).toBe(false);
    });

    it('decrements remaining after requests', () => {
      const email = 'test@example.com';

      createResetToken(email);
      const result = checkRateLimit(email);

      expect(result.remaining).toBe(2);
    });

    it('sets isLimited when exhausted', () => {
      const email = 'limited@example.com';

      createResetToken(email);
      createResetToken(email);
      createResetToken(email);

      const result = checkRateLimit(email);
      expect(result.remaining).toBe(0);
      expect(result.isLimited).toBe(true);
    });
  });

  describe('buildResetUrl', () => {
    it('builds URL with token', () => {
      const url = buildResetUrl('abc123', 'https://app.example.com');
      expect(url).toBe('https://app.example.com/reset-password/abc123');
    });

    it('uses empty base when not provided in node env', () => {
      const url = buildResetUrl('abc123');
      expect(url).toBe('/reset-password/abc123');
    });
  });

  describe('extractTokenFromUrl', () => {
    it('extracts token from URL', () => {
      const token = extractTokenFromUrl('https://app.example.com/reset-password/abc123def456');
      expect(token).toBe('abc123def456');
    });

    it('returns null for invalid URL', () => {
      const token = extractTokenFromUrl('https://app.example.com/other-page');
      expect(token).toBeNull();
    });

    it('handles URL with query params', () => {
      const token = extractTokenFromUrl('https://app.example.com/reset-password/abc123?foo=bar');
      expect(token).toBe('abc123');
    });
  });

  describe('getTokenTimeRemaining', () => {
    it('returns time remaining for valid token', () => {
      const createResult = createResetToken('test@example.com');
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const remaining = getTokenTimeRemaining(createResult.value);

      expect(remaining.expired).toBe(false);
      expect(remaining.minutes).toBeGreaterThan(50); // Should be ~60 minutes
      expect(remaining.formatted).toContain('m');
    });

    it('returns expired for past date', () => {
      const token = {
        token: 'test',
        hashedToken: 'hash',
        email: 'test@example.com',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      };

      const remaining = getTokenTimeRemaining(token);

      expect(remaining.expired).toBe(true);
      expect(remaining.formatted).toBe('Expired');
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('returns false for fresh token', () => {
      const createResult = createResetToken('test@example.com');
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      expect(isTokenExpiringSoon(createResult.value)).toBe(false);
    });

    it('returns true for token expiring in less than 10 minutes', () => {
      const token = {
        token: 'test',
        hashedToken: 'hash',
        email: 'test@example.com',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        createdAt: new Date(),
      };

      expect(isTokenExpiringSoon(token)).toBe(true);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('removes expired tokens', () => {
      createResetToken('test@example.com');
      expect(getTokenStoreSize()).toBe(1);

      // This won't remove the token since it's not expired
      const cleaned = cleanupExpiredTokens();
      expect(cleaned).toBe(0);
      expect(getTokenStoreSize()).toBe(1);
    });

    it('removes used tokens', () => {
      const result = createResetToken('test@example.com');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      markTokenUsed(result.value.token);

      const cleaned = cleanupExpiredTokens();
      expect(cleaned).toBe(1);
      expect(getTokenStoreSize()).toBe(0);
    });
  });

  describe('clearAllTokens', () => {
    it('clears all tokens', () => {
      createResetToken('test1@example.com');
      createResetToken('test2@example.com');
      expect(getTokenStoreSize()).toBe(2);

      clearAllTokens();
      expect(getTokenStoreSize()).toBe(0);
    });
  });
});
