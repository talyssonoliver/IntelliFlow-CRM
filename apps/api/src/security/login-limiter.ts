/**
 * Login Rate Limiter
 *
 * Prevents brute force attacks by tracking failed login attempts.
 * Implements account lockout after too many failed attempts.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - Track failed login attempts per email/IP
 * - Lockout after 5 failed attempts for 15 minutes
 * - Reset counter on successful login
 * - Progressive lockout (optional future enhancement)
 */

import { TRPCError } from '@trpc/server';

/**
 * Configuration for login rate limiting
 */
export interface LoginLimiterConfig {
  /** Maximum failed attempts before lockout */
  maxAttempts: number;
  /** Lockout duration in milliseconds */
  lockoutDurationMs: number;
  /** Sliding window for counting attempts in milliseconds */
  windowMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_LOGIN_LIMITER_CONFIG: LoginLimiterConfig = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  windowMs: 15 * 60 * 1000, // 15 minute window
};

/**
 * State for tracking login attempts
 */
interface LoginAttemptState {
  /** Number of failed attempts in current window */
  failedAttempts: number;
  /** Timestamps of failed attempts */
  attemptTimestamps: number[];
  /** Lockout expiration timestamp (if locked) */
  lockedUntil: number | null;
  /** Last successful login timestamp */
  lastSuccessfulLogin: number | null;
}

/**
 * In-memory store for login attempts
 * Key format: `${email}:${ip}` or `email:${email}` for email-only tracking
 *
 * Note: In production, use Redis for distributed rate limiting
 */
const loginAttemptStore = new Map<string, LoginAttemptState>();

/**
 * Get the key for storing login attempts
 */
function getAttemptKey(email: string, ip?: string): string {
  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase().trim();

  if (ip) {
    return `${normalizedEmail}:${ip}`;
  }
  return `email:${normalizedEmail}`;
}

/**
 * Clean up old attempts from the window
 */
function cleanupOldAttempts(state: LoginAttemptState, windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Remove attempts older than the window
  state.attemptTimestamps = state.attemptTimestamps.filter((ts) => ts > cutoff);
  state.failedAttempts = state.attemptTimestamps.length;
}

/**
 * Check if an account is currently locked
 */
export function isAccountLocked(email: string, ip?: string): boolean {
  const key = getAttemptKey(email, ip);
  const state = loginAttemptStore.get(key);

  if (!state?.lockedUntil) {
    return false;
  }

  const now = Date.now();

  // Check if lockout has expired
  if (now >= state.lockedUntil) {
    // Clear the lockout
    state.lockedUntil = null;
    return false;
  }

  return true;
}

/**
 * Get remaining lockout time in milliseconds
 */
export function getRemainingLockoutTime(email: string, ip?: string): number {
  const key = getAttemptKey(email, ip);
  const state = loginAttemptStore.get(key);

  if (!state?.lockedUntil) {
    return 0;
  }

  const now = Date.now();
  const remaining = state.lockedUntil - now;

  return Math.max(0, remaining);
}

/**
 * Get remaining lockout time formatted as string
 */
export function getFormattedLockoutTime(email: string, ip?: string): string {
  const remainingMs = getRemainingLockoutTime(email, ip);

  if (remainingMs === 0) {
    return '0 seconds';
  }

  const minutes = Math.ceil(remainingMs / 60000);

  if (minutes === 1) {
    return '1 minute';
  }

  return `${minutes} minutes`;
}

/**
 * Check if login is allowed and throw if not
 *
 * @throws TRPCError with TOO_MANY_REQUESTS code if locked
 */
export function checkLoginAllowed(
  email: string,
  ip?: string,
  config: LoginLimiterConfig = DEFAULT_LOGIN_LIMITER_CONFIG
): void {
  const key = getAttemptKey(email, ip);
  const state = loginAttemptStore.get(key);

  if (!state) {
    // No history, login allowed
    return;
  }

  const now = Date.now();

  // Check if account is locked
  if (state.lockedUntil && now < state.lockedUntil) {
    const remainingTime = getFormattedLockoutTime(email, ip);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime}.`,
    });
  }

  // Clean up old attempts
  cleanupOldAttempts(state, config.windowMs);

  // Check if at limit (but not locked yet - they get one more try)
  if (state.failedAttempts >= config.maxAttempts) {
    // Should have been locked, re-lock
    state.lockedUntil = now + config.lockoutDurationMs;
    const remainingTime = getFormattedLockoutTime(email, ip);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime}.`,
    });
  }
}

/**
 * Record a failed login attempt
 *
 * @returns Object indicating if account is now locked and remaining attempts
 */
export function recordFailedAttempt(
  email: string,
  ip?: string,
  config: LoginLimiterConfig = DEFAULT_LOGIN_LIMITER_CONFIG
): { isLocked: boolean; remainingAttempts: number; lockoutDuration?: number } {
  const key = getAttemptKey(email, ip);
  const now = Date.now();

  let state = loginAttemptStore.get(key);

  if (!state) {
    state = {
      failedAttempts: 0,
      attemptTimestamps: [],
      lockedUntil: null,
      lastSuccessfulLogin: null,
    };
    loginAttemptStore.set(key, state);
  }

  // Clean up old attempts first
  cleanupOldAttempts(state, config.windowMs);

  // Record new attempt
  state.attemptTimestamps.push(now);
  state.failedAttempts = state.attemptTimestamps.length;

  // Check if we should lock the account
  if (state.failedAttempts >= config.maxAttempts) {
    state.lockedUntil = now + config.lockoutDurationMs;
    return {
      isLocked: true,
      remainingAttempts: 0,
      lockoutDuration: config.lockoutDurationMs,
    };
  }

  return {
    isLocked: false,
    remainingAttempts: config.maxAttempts - state.failedAttempts,
  };
}

/**
 * Record a successful login and reset the counter
 */
export function recordSuccessfulLogin(email: string, ip?: string): void {
  const key = getAttemptKey(email, ip);
  const now = Date.now();

  // Reset the state for this key
  loginAttemptStore.set(key, {
    failedAttempts: 0,
    attemptTimestamps: [],
    lockedUntil: null,
    lastSuccessfulLogin: now,
  });

  // Also check email-only key if IP was provided
  if (ip) {
    const emailOnlyKey = getAttemptKey(email);
    const emailState = loginAttemptStore.get(emailOnlyKey);
    if (emailState) {
      loginAttemptStore.set(emailOnlyKey, {
        failedAttempts: 0,
        attemptTimestamps: [],
        lockedUntil: null,
        lastSuccessfulLogin: now,
      });
    }
  }
}

/**
 * Get login attempt statistics for an email
 */
export function getLoginAttemptStats(
  email: string,
  ip?: string,
  config: LoginLimiterConfig = DEFAULT_LOGIN_LIMITER_CONFIG
): {
  failedAttempts: number;
  remainingAttempts: number;
  isLocked: boolean;
  lockedUntilMs: number | null;
  lastSuccessfulLogin: number | null;
} {
  const key = getAttemptKey(email, ip);
  const state = loginAttemptStore.get(key);

  if (!state) {
    return {
      failedAttempts: 0,
      remainingAttempts: config.maxAttempts,
      isLocked: false,
      lockedUntilMs: null,
      lastSuccessfulLogin: null,
    };
  }

  // Clean up old attempts
  cleanupOldAttempts(state, config.windowMs);

  const now = Date.now();
  const isLocked = state.lockedUntil !== null && now < state.lockedUntil;

  return {
    failedAttempts: state.failedAttempts,
    remainingAttempts: Math.max(0, config.maxAttempts - state.failedAttempts),
    isLocked,
    lockedUntilMs: isLocked ? state.lockedUntil : null,
    lastSuccessfulLogin: state.lastSuccessfulLogin,
  };
}

/**
 * Manually unlock an account (for admin use)
 */
export function unlockAccount(email: string, ip?: string): boolean {
  const key = getAttemptKey(email, ip);
  const state = loginAttemptStore.get(key);

  if (!state) {
    return false;
  }

  // Reset the state
  loginAttemptStore.set(key, {
    failedAttempts: 0,
    attemptTimestamps: [],
    lockedUntil: null,
    lastSuccessfulLogin: state.lastSuccessfulLogin,
  });

  return true;
}

/**
 * Clear all login attempt data (for testing)
 */
export function clearLoginAttemptStore(): void {
  loginAttemptStore.clear();
}

/**
 * Get the current size of the login attempt store (for monitoring)
 */
export function getLoginAttemptStoreSize(): number {
  return loginAttemptStore.size;
}

/**
 * Cleanup expired entries from the store (call periodically)
 */
export function cleanupExpiredEntries(
  config: LoginLimiterConfig = DEFAULT_LOGIN_LIMITER_CONFIG
): number {
  const now = Date.now();
  const cutoff = now - config.windowMs;
  let cleanedCount = 0;

  for (const [key, state] of loginAttemptStore.entries()) {
    // Remove entries that have no recent attempts and are not locked
    const hasRecentAttempts = state.attemptTimestamps.some((ts) => ts > cutoff);
    const isLocked = state.lockedUntil !== null && now < state.lockedUntil;

    if (!hasRecentAttempts && !isLocked) {
      loginAttemptStore.delete(key);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Login limiter class for dependency injection
 */
export class LoginLimiter {
  private config: LoginLimiterConfig;

  constructor(config: Partial<LoginLimiterConfig> = {}) {
    this.config = {
      ...DEFAULT_LOGIN_LIMITER_CONFIG,
      ...config,
    };
  }

  checkAllowed(email: string, ip?: string): void {
    checkLoginAllowed(email, ip, this.config);
  }

  recordFailed(email: string, ip?: string) {
    return recordFailedAttempt(email, ip, this.config);
  }

  recordSuccess(email: string, ip?: string): void {
    recordSuccessfulLogin(email, ip);
  }

  isLocked(email: string, ip?: string): boolean {
    return isAccountLocked(email, ip);
  }

  getRemainingLockout(email: string, ip?: string): number {
    return getRemainingLockoutTime(email, ip);
  }

  getStats(email: string, ip?: string) {
    return getLoginAttemptStats(email, ip, this.config);
  }

  unlock(email: string, ip?: string): boolean {
    return unlockAccount(email, ip);
  }

  cleanup(): number {
    return cleanupExpiredEntries(this.config);
  }

  clear(): void {
    clearLoginAttemptStore();
  }
}

/**
 * Singleton instance for default configuration
 */
let loginLimiterInstance: LoginLimiter | null = null;

export function getLoginLimiter(config?: Partial<LoginLimiterConfig>): LoginLimiter {
  if (!loginLimiterInstance || config) {
    loginLimiterInstance = new LoginLimiter(config);
  }
  return loginLimiterInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetLoginLimiter(): void {
  loginLimiterInstance = null;
  clearLoginAttemptStore();
}
