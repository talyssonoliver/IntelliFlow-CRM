/**
 * Account Activation Service
 *
 * Utilities for generating, validating, and managing email verification tokens.
 *
 * IMPLEMENTS: PG-023 (Email Verification page)
 *
 * Features:
 * - Secure token generation
 * - Token validation and expiry
 * - Rate limiting for resend
 * - Token storage abstraction
 * - Security best practices
 *
 * Pattern: Follows reset-token.ts implementation
 */

import { randomBytes, createHash } from 'crypto';

// ============================================
// Types
// ============================================

export interface VerificationToken {
  token: string;
  hashedToken: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
}

export type VerificationTokenResult =
  | { ok: true; value: VerificationToken }
  | { ok: false; error: VerificationTokenError };

export interface VerificationTokenError {
  code: 'EXPIRED' | 'INVALID' | 'ALREADY_USED' | 'RATE_LIMITED' | 'GENERATION_FAILED';
  message: string;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  isLimited: boolean;
}

export interface TokenTimeRemaining {
  expired: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
}

// ============================================
// Constants
// ============================================

const TOKEN_LENGTH = 32; // 256 bits = 64 hex characters
export const TOKEN_EXPIRY_HOURS = 24; // 24 hours for email verification
export const MAX_RESEND_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

// In-memory token store (use database in production)
const tokenStore = new Map<string, VerificationToken>();

// ============================================
// Token Generation
// ============================================

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(length: number = TOKEN_LENGTH): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new email verification token
 */
export function createVerificationToken(email: string): VerificationTokenResult {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit
    const rateLimit = checkResendRateLimit(normalizedEmail);
    if (rateLimit.isLimited) {
      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many verification requests. Please try again in ${Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000)} minutes.`,
        },
      };
    }

    // Invalidate previous tokens for this email
    invalidateTokensForEmail(normalizedEmail);

    // Generate token
    const token = generateSecureToken();
    const hashedToken = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const verificationToken: VerificationToken = {
      token,
      hashedToken,
      email: normalizedEmail,
      expiresAt,
      createdAt: now,
    };

    // Store the token (hashed) - don't store plaintext
    tokenStore.set(hashedToken, { ...verificationToken, token: '' });

    // Update rate limit
    incrementRateLimit(normalizedEmail);

    return { ok: true, value: verificationToken };
  } catch (error) {
    console.error('[AccountActivation] Token generation failed:', error);
    return {
      ok: false,
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate verification token. Please try again.',
      },
    };
  }
}

// ============================================
// Token Validation
// ============================================

/**
 * Validate an email verification token
 */
export function validateVerificationToken(token: string): VerificationTokenResult {
  const hashedToken = hashToken(token);
  const storedToken = tokenStore.get(hashedToken);

  if (!storedToken) {
    return {
      ok: false,
      error: {
        code: 'INVALID',
        message: 'This verification link is invalid or has already been used.',
      },
    };
  }

  if (storedToken.verifiedAt) {
    return {
      ok: false,
      error: {
        code: 'ALREADY_USED',
        message: 'This email has already been verified. Please log in.',
      },
    };
  }

  if (new Date() > storedToken.expiresAt) {
    return {
      ok: false,
      error: {
        code: 'EXPIRED',
        message: 'This verification link has expired. Please request a new one.',
      },
    };
  }

  return { ok: true, value: { ...storedToken, token } };
}

/**
 * Mark email as verified
 */
export function markEmailVerified(token: string): boolean {
  const hashedToken = hashToken(token);
  const storedToken = tokenStore.get(hashedToken);

  if (!storedToken) {
    return false;
  }

  if (storedToken.verifiedAt) {
    return false; // Already verified
  }

  storedToken.verifiedAt = new Date();
  tokenStore.set(hashedToken, storedToken);
  return true;
}

/**
 * Invalidate all tokens for an email
 */
function invalidateTokensForEmail(email: string): number {
  const normalizedEmail = email.toLowerCase().trim();
  let invalidatedCount = 0;

  tokenStore.forEach((token, key) => {
    if (token.email === normalizedEmail && !token.verifiedAt) {
      token.verifiedAt = new Date(); // Mark as used
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
 * Check if an email is rate limited for resend
 */
export function checkResendRateLimit(email: string): RateLimitInfo {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const record = rateLimitStore.get(normalizedEmail);

  if (!record) {
    return {
      remaining: MAX_RESEND_PER_HOUR,
      resetAt: new Date(now + RATE_LIMIT_WINDOW_MS),
      isLimited: false,
    };
  }

  // Check if window has expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.delete(normalizedEmail);
    return {
      remaining: MAX_RESEND_PER_HOUR,
      resetAt: new Date(now + RATE_LIMIT_WINDOW_MS),
      isLimited: false,
    };
  }

  const remaining = Math.max(0, MAX_RESEND_PER_HOUR - record.count);
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
 * Build the email verification URL
 */
export function buildVerificationUrl(token: string, baseUrl?: string): string {
  const base =
    baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://intelliflow-crm.com');
  return `${base}/auth/verify-email/${token}`;
}

// ============================================
// Token Expiry Helpers
// ============================================

/**
 * Get remaining time until token expires
 */
export function getTokenTimeRemaining(token: VerificationToken): TokenTimeRemaining {
  const now = new Date();
  const diff = token.expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return { expired: true, hours: 0, minutes: 0, seconds: 0, formatted: 'Expired' };
  }

  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);

  return {
    expired: false,
    hours,
    minutes,
    seconds,
    formatted: `${hours}h ${minutes}m`,
  };
}

/**
 * Check if token is expiring soon (within 1 hour)
 */
export function isTokenExpiringSoon(token: VerificationToken): boolean {
  const remaining = getTokenTimeRemaining(token);
  return !remaining.expired && remaining.hours < 1;
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
    if (token.expiresAt < now || token.verifiedAt) {
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
