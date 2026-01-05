/**
 * Reset Token Service
 *
 * Utilities for generating, validating, and managing password reset tokens.
 *
 * IMPLEMENTS: PG-019 (Forgot Password page)
 *
 * Features:
 * - Secure token generation
 * - Token validation and expiry
 * - Rate limiting support
 * - Token storage abstraction
 * - Security best practices
 */

import { randomBytes, createHash } from 'crypto';

// ============================================
// Types
// ============================================

export interface ResetToken {
  token: string;
  hashedToken: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

export type ResetTokenResult = {
  ok: true;
  value: ResetToken;
} | {
  ok: false;
  error: ResetTokenError;
};

export interface ResetTokenError {
  code: 'EXPIRED' | 'INVALID' | 'ALREADY_USED' | 'RATE_LIMITED' | 'GENERATION_FAILED';
  message: string;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  isLimited: boolean;
}

// ============================================
// Constants
// ============================================

const TOKEN_LENGTH = 32; // 256 bits
const TOKEN_EXPIRY_MINUTES = 60; // 1 hour
const MAX_REQUESTS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

// In-memory token store (use database in production)
const tokenStore = new Map<string, ResetToken>();

// ============================================
// Token Generation
// ============================================

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = TOKEN_LENGTH): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new password reset token
 */
export function createResetToken(email: string): ResetTokenResult {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit
    const rateLimit = checkRateLimit(normalizedEmail);
    if (rateLimit.isLimited) {
      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many reset requests. Please try again in ${Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000)} minutes.`,
        },
      };
    }

    // Generate token
    const token = generateSecureToken();
    const hashedToken = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    const resetToken: ResetToken = {
      token,
      hashedToken,
      email: normalizedEmail,
      expiresAt,
      createdAt: now,
    };

    // Store the token (hashed)
    tokenStore.set(hashedToken, { ...resetToken, token: '' }); // Don't store plaintext token

    // Update rate limit
    incrementRateLimit(normalizedEmail);

    return { ok: true, value: resetToken };
  } catch (error) {
    console.error('[ResetToken] Generation failed:', error);
    return {
      ok: false,
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate reset token. Please try again.',
      },
    };
  }
}

// ============================================
// Token Validation
// ============================================

/**
 * Validate a password reset token
 */
export function validateResetToken(token: string): ResetTokenResult {
  const hashedToken = hashToken(token);
  const storedToken = tokenStore.get(hashedToken);

  if (!storedToken) {
    return {
      ok: false,
      error: {
        code: 'INVALID',
        message: 'This reset link is invalid or has already been used.',
      },
    };
  }

  if (storedToken.usedAt) {
    return {
      ok: false,
      error: {
        code: 'ALREADY_USED',
        message: 'This reset link has already been used. Please request a new one.',
      },
    };
  }

  if (new Date() > storedToken.expiresAt) {
    return {
      ok: false,
      error: {
        code: 'EXPIRED',
        message: 'This reset link has expired. Please request a new one.',
      },
    };
  }

  return { ok: true, value: { ...storedToken, token } };
}

/**
 * Mark a token as used
 */
export function markTokenUsed(token: string): boolean {
  const hashedToken = hashToken(token);
  const storedToken = tokenStore.get(hashedToken);

  if (!storedToken) {
    return false;
  }

  storedToken.usedAt = new Date();
  tokenStore.set(hashedToken, storedToken);
  return true;
}

/**
 * Invalidate all tokens for an email
 */
export function invalidateTokensForEmail(email: string): number {
  const normalizedEmail = email.toLowerCase().trim();
  let invalidatedCount = 0;

  tokenStore.forEach((token, key) => {
    if (token.email === normalizedEmail && !token.usedAt) {
      token.usedAt = new Date();
      tokenStore.set(key, token);
      invalidatedCount++;
    }
  });

  return invalidatedCount;
}

// ============================================
// Rate Limiting
// ============================================

/**
 * Check if an email is rate limited
 */
export function checkRateLimit(email: string): RateLimitInfo {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const record = rateLimitStore.get(normalizedEmail);

  if (!record) {
    return {
      remaining: MAX_REQUESTS_PER_HOUR,
      resetAt: new Date(now + RATE_LIMIT_WINDOW_MS),
      isLimited: false,
    };
  }

  // Check if window has expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.delete(normalizedEmail);
    return {
      remaining: MAX_REQUESTS_PER_HOUR,
      resetAt: new Date(now + RATE_LIMIT_WINDOW_MS),
      isLimited: false,
    };
  }

  const remaining = Math.max(0, MAX_REQUESTS_PER_HOUR - record.count);
  const resetAt = new Date(record.windowStart + RATE_LIMIT_WINDOW_MS);

  return {
    remaining,
    resetAt,
    isLimited: remaining === 0,
  };
}

/**
 * Increment the rate limit counter for an email
 */
function incrementRateLimit(email: string): void {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const record = rateLimitStore.get(normalizedEmail);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(normalizedEmail, { count: 1, windowStart: now });
  } else {
    record.count++;
    rateLimitStore.set(normalizedEmail, record);
  }
}

// ============================================
// URL Generation
// ============================================

/**
 * Build the password reset URL
 */
export function buildResetUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/reset-password/${token}`;
}

/**
 * Extract token from reset URL
 */
export function extractTokenFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/reset-password\/([a-f0-9]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ============================================
// Token Expiry Helpers
// ============================================

/**
 * Get remaining time until token expires
 */
export function getTokenTimeRemaining(token: ResetToken): {
  expired: boolean;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  const now = new Date();
  const diff = token.expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return { expired: true, minutes: 0, seconds: 0, formatted: 'Expired' };
  }

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return {
    expired: false,
    minutes,
    seconds,
    formatted: `${minutes}m ${seconds}s`,
  };
}

/**
 * Check if token is expiring soon (within 10 minutes)
 */
export function isTokenExpiringSoon(token: ResetToken): boolean {
  const remaining = getTokenTimeRemaining(token);
  return !remaining.expired && remaining.minutes < 10;
}

// ============================================
// Cleanup (for testing/development)
// ============================================

/**
 * Clear expired tokens (should run periodically in production)
 */
export function cleanupExpiredTokens(): number {
  const now = new Date();
  let cleanedCount = 0;

  tokenStore.forEach((token, key) => {
    if (token.expiresAt < now || token.usedAt) {
      tokenStore.delete(key);
      cleanedCount++;
    }
  });

  return cleanedCount;
}

/**
 * Clear all tokens (for testing)
 */
export function clearAllTokens(): void {
  tokenStore.clear();
}

/**
 * Clear rate limit store (for testing)
 */
export function clearRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Get token store size (for testing/monitoring)
 */
export function getTokenStoreSize(): number {
  return tokenStore.size;
}
