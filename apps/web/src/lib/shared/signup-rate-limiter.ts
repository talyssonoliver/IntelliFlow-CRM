/**
 * Signup Rate Limiter
 *
 * Client-side rate limiting for signup form submissions.
 * Uses localStorage to track attempts and provide UX feedback.
 *
 * IMPLEMENTS: PG-016 (Sign Up page security)
 *
 * Note: This is a client-side helper for UX. Server-side rate limiting
 * is the actual security enforcement.
 */

// ============================================
// Types
// ============================================

export interface SignupRateLimitResult {
  /** Whether the user can attempt signup */
  canAttempt: boolean;
  /** Number of attempts remaining before lockout */
  attemptsRemaining: number;
  /** When the lockout expires (null if not locked) */
  lockedUntil: Date | null;
  /** Seconds until the lockout expires */
  secondsRemaining: number;
  /** Human-readable message for the user */
  message: string;
}

export interface SignupRateLimitConfig {
  /** Maximum attempts before lockout */
  maxAttempts: number;
  /** Lockout duration in minutes */
  lockoutMinutes: number;
  /** Window for counting attempts in minutes */
  windowMinutes: number;
}

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'intelliflow_signup_rate_limit';

const DEFAULT_CONFIG: SignupRateLimitConfig = {
  maxAttempts: 5,
  lockoutMinutes: 15,
  windowMinutes: 30,
};

// ============================================
// Internal Storage Types
// ============================================

interface StoredRateLimitData {
  attempts: number[];
  lockedUntil: string | null;
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if a signup attempt is allowed
 *
 * @param email - The email being used for signup
 * @param config - Optional configuration overrides
 * @returns Rate limit status
 *
 * @example
 * ```typescript
 * const status = checkSignupRateLimit('user@example.com');
 * if (!status.canAttempt) {
 *   showError(status.message);
 *   return;
 * }
 * ```
 */
export function checkSignupRateLimit(
  email: string,
  config: Partial<SignupRateLimitConfig> = {}
): SignupRateLimitResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (typeof window === 'undefined') {
    return createSuccessResult(cfg.maxAttempts);
  }

  const key = getStorageKey(email);
  const data = loadData(key);

  // Check if currently locked out
  if (data.lockedUntil) {
    const lockedUntil = new Date(data.lockedUntil);
    const now = new Date();

    if (lockedUntil > now) {
      const secondsRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
      return {
        canAttempt: false,
        attemptsRemaining: 0,
        lockedUntil,
        secondsRemaining,
        message: `Too many signup attempts. Please try again in ${formatTimeRemaining(secondsRemaining)}.`,
      };
    } else {
      // Lockout expired, clear data
      clearData(key);
      return createSuccessResult(cfg.maxAttempts);
    }
  }

  // Clean old attempts outside the window
  const windowStart = Date.now() - cfg.windowMinutes * 60 * 1000;
  const recentAttempts = data.attempts.filter((timestamp) => timestamp > windowStart);

  // Calculate remaining attempts
  const attemptsRemaining = Math.max(0, cfg.maxAttempts - recentAttempts.length);

  if (attemptsRemaining === 0) {
    // Should be locked, but wasn't - lock now
    const lockedUntil = new Date(Date.now() + cfg.lockoutMinutes * 60 * 1000);
    saveData(key, { attempts: recentAttempts, lockedUntil: lockedUntil.toISOString() });

    const secondsRemaining = cfg.lockoutMinutes * 60;
    return {
      canAttempt: false,
      attemptsRemaining: 0,
      lockedUntil,
      secondsRemaining,
      message: `Too many signup attempts. Please try again in ${formatTimeRemaining(secondsRemaining)}.`,
    };
  }

  return {
    canAttempt: true,
    attemptsRemaining,
    lockedUntil: null,
    secondsRemaining: 0,
    message: attemptsRemaining <= 2
      ? `Warning: ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining before lockout.`
      : '',
  };
}

/**
 * Record a signup attempt
 *
 * Call this after each signup attempt, regardless of success/failure.
 * For security, we rate limit all attempts, not just failures.
 *
 * @param email - The email being used for signup
 * @param config - Optional configuration overrides
 *
 * @example
 * ```typescript
 * recordSignupAttempt('user@example.com');
 * // Submit signup form...
 * ```
 */
export function recordSignupAttempt(
  email: string,
  config: Partial<SignupRateLimitConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (typeof window === 'undefined') return;

  const key = getStorageKey(email);
  const data = loadData(key);

  // If already locked, don't record more attempts
  if (data.lockedUntil && new Date(data.lockedUntil) > new Date()) {
    return;
  }

  // Clean old attempts and add new one
  const windowStart = Date.now() - cfg.windowMinutes * 60 * 1000;
  const recentAttempts = data.attempts.filter((timestamp) => timestamp > windowStart);
  recentAttempts.push(Date.now());

  // Check if we need to lock
  if (recentAttempts.length >= cfg.maxAttempts) {
    const lockedUntil = new Date(Date.now() + cfg.lockoutMinutes * 60 * 1000);
    saveData(key, { attempts: recentAttempts, lockedUntil: lockedUntil.toISOString() });
  } else {
    saveData(key, { attempts: recentAttempts, lockedUntil: null });
  }
}

/**
 * Clear rate limit tracking for an email
 *
 * Call this after successful signup to reset the counter.
 *
 * @param email - The email to clear
 *
 * @example
 * ```typescript
 * if (signupSuccess) {
 *   clearSignupRateLimit('user@example.com');
 * }
 * ```
 */
export function clearSignupRateLimit(email: string): void {
  if (typeof window === 'undefined') return;

  const key = getStorageKey(email);
  clearData(key);
}

/**
 * Get rate limit info for display purposes
 *
 * @param email - The email to check
 * @returns Human-readable rate limit info
 */
export function getSignupRateLimitInfo(email: string): {
  isLimited: boolean;
  message: string;
} {
  const status = checkSignupRateLimit(email);

  if (!status.canAttempt) {
    return {
      isLimited: true,
      message: status.message,
    };
  }

  if (status.attemptsRemaining <= 2) {
    return {
      isLimited: false,
      message: status.message,
    };
  }

  return {
    isLimited: false,
    message: '',
  };
}

// ============================================
// Helper Functions
// ============================================

function getStorageKey(email: string): string {
  // Hash the email to avoid storing it directly
  const hash = simpleHash(email.toLowerCase().trim());
  return `${STORAGE_KEY}_${hash}`;
}

function loadData(key: string): StoredRateLimitData {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return { attempts: [], lockedUntil: null };
    }
    const data = JSON.parse(stored) as StoredRateLimitData;
    return {
      attempts: Array.isArray(data.attempts) ? data.attempts : [],
      lockedUntil: data.lockedUntil || null,
    };
  } catch {
    return { attempts: [], lockedUntil: null };
  }
}

function saveData(key: string, data: StoredRateLimitData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage might be full or disabled
    console.warn('[SignupRateLimiter] Failed to save rate limit data');
  }
}

function clearData(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

function createSuccessResult(maxAttempts: number): SignupRateLimitResult {
  return {
    canAttempt: true,
    attemptsRemaining: maxAttempts,
    lockedUntil: null,
    secondsRemaining: 0,
    message: '',
  };
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Simple hash function for client-side use
 * Uses DJB2 algorithm - not cryptographically secure,
 * but suitable for local storage keys.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
