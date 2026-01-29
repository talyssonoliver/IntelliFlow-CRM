/**
 * Login Security Utilities
 *
 * Client-side security utilities for the login flow.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - CSRF token generation and validation
 * - Device fingerprinting for session tracking
 * - Input sanitization
 * - Rate limit status checking
 */

import { randomBytes } from 'crypto';

// ============================================
// CSRF Protection
// ============================================

const CSRF_TOKEN_KEY = 'intelliflow_csrf_token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure CSRF token
 *
 * Creates a new token and stores it in sessionStorage for later validation.
 * Uses Node.js crypto for secure random generation.
 *
 * @returns The generated CSRF token
 *
 * @example
 * ```tsx
 * const token = generateCsrfToken();
 * // Include token in form or request headers
 * ```
 */
export function generateCsrfToken(): string {
  // Use crypto.randomBytes for cryptographically secure random values
  // Falls back to Web Crypto API for browser environment
  let token: string;

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    // Browser environment - use Web Crypto API
    const array = new Uint8Array(CSRF_TOKEN_LENGTH);
    window.crypto.getRandomValues(array);
    token = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js environment (SSR)
    token = randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  }

  // Store in sessionStorage for validation
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  }

  return token;
}

/**
 * Validate a CSRF token against the stored token
 *
 * @param token - The token to validate
 * @returns True if the token is valid and matches the stored token
 *
 * @example
 * ```tsx
 * if (!validateCsrf(formToken)) {
 *   throw new Error('Invalid CSRF token');
 * }
 * ```
 */
export function validateCsrf(token: string): boolean {
  if (typeof window === 'undefined') {
    // Can't validate on server side without context
    return false;
  }

  const storedToken = sessionStorage.getItem(CSRF_TOKEN_KEY);

  if (!storedToken || !token) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(token, storedToken);
}

/**
 * Clear the stored CSRF token
 *
 * Should be called after successful form submission or when starting a new session.
 */
export function clearCsrfToken(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
  }
}

/**
 * Get the current stored CSRF token without generating a new one
 *
 * @returns The stored token or null if none exists
 */
export function getCsrfToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return sessionStorage.getItem(CSRF_TOKEN_KEY);
}

// ============================================
// Device Fingerprinting
// ============================================

export interface DeviceFingerprint {
  /** Hash of the fingerprint */
  hash: string;
  /** Raw components used for fingerprinting */
  components: DeviceFingerprintComponents;
}

export interface DeviceFingerprintComponents {
  userAgent: string;
  language: string;
  platform: string;
  screenResolution: string;
  timezone: string;
  colorDepth: number;
  touchSupport: boolean;
  cookiesEnabled: boolean;
}

/**
 * Generate a device fingerprint for session tracking
 *
 * Uses various browser and device characteristics to create a
 * semi-unique identifier. This is used for:
 * - Detecting session hijacking
 * - Identifying device for "trust this device" feature
 * - Rate limiting by device
 *
 * Note: This is not a perfect identifier and can change. It's meant
 * to add an extra layer of security, not replace proper authentication.
 *
 * @returns Device fingerprint object with hash and components
 *
 * @example
 * ```tsx
 * const fingerprint = getDeviceFingerprint();
 * // Send fingerprint.hash with authentication requests
 * ```
 */
export function getDeviceFingerprint(): DeviceFingerprint {
  if (typeof window === 'undefined') {
    // Server-side rendering - return empty fingerprint
    return {
      hash: 'server-side',
      components: {
        userAgent: '',
        language: '',
        platform: '',
        screenResolution: '0x0',
        timezone: '',
        colorDepth: 0,
        touchSupport: false,
        cookiesEnabled: false,
      },
    };
  }

  const components: DeviceFingerprintComponents = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform || 'unknown',
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    colorDepth: screen.colorDepth,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    cookiesEnabled: navigator.cookieEnabled,
  };

  // Create a hash of the components
  const fingerprintString = Object.values(components).join('|');
  const hash = hashString(fingerprintString);

  return { hash, components };
}

/**
 * Get just the device fingerprint hash (for sending with requests)
 *
 * @returns The fingerprint hash string
 */
export function getDeviceFingerprintHash(): string {
  return getDeviceFingerprint().hash;
}

// ============================================
// Input Sanitization
// ============================================

/**
 * Sanitize user input to prevent XSS attacks
 *
 * Removes potentially dangerous HTML characters and patterns.
 * Should be used on all user inputs before display or processing.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string
 *
 * @example
 * ```tsx
 * const safeEmail = sanitizeInput(userInput);
 * ```
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    // Remove null bytes
    .replace(/\0/g, '')
    // Trim whitespace
    .trim();
}

/**
 * Sanitize email input specifically
 *
 * Validates and cleans email format while preserving valid characters.
 *
 * @param email - The email to sanitize
 * @returns The sanitized email or empty string if invalid
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';

  // Basic sanitization
  const cleaned = email
    .toLowerCase()
    .trim()
    // Remove any HTML/script tags
    .replace(/<[^>]*>/g, '')
    // Remove null bytes
    .replace(/\0/g, '');

  // Validate email format
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * Sanitize password input
 *
 * Minimal sanitization for passwords - we don't want to change
 * the password content, just ensure it doesn't contain null bytes
 * or other control characters.
 *
 * @param password - The password to sanitize
 * @returns The sanitized password
 */
export function sanitizePassword(password: string): string {
  if (!password) return '';

  return password
    // Remove null bytes and other control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ============================================
// Rate Limit Helpers
// ============================================

const RATE_LIMIT_KEY_PREFIX = 'intelliflow_rate_limit_';

export interface RateLimitInfo {
  /** Whether the user is currently rate limited */
  isLimited: boolean;
  /** Number of attempts remaining (0 if limited) */
  remainingAttempts: number;
  /** When the rate limit expires (null if not limited) */
  expiresAt: Date | null;
  /** Time remaining until limit expires in seconds */
  timeRemaining: number;
}

/**
 * Check client-side rate limit status
 *
 * This is a client-side helper to provide UX feedback about rate limiting.
 * The actual rate limiting is enforced server-side.
 *
 * @param identifier - Email or other identifier to check
 * @returns Rate limit info
 */
export function checkRateLimitStatus(identifier: string): RateLimitInfo {
  if (typeof window === 'undefined') {
    return {
      isLimited: false,
      remainingAttempts: 5,
      expiresAt: null,
      timeRemaining: 0,
    };
  }

  const key = `${RATE_LIMIT_KEY_PREFIX}${hashString(identifier)}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    return {
      isLimited: false,
      remainingAttempts: 5,
      expiresAt: null,
      timeRemaining: 0,
    };
  }

  try {
    const data = JSON.parse(stored) as {
      attempts: number;
      lockedUntil: string | null;
    };

    if (data.lockedUntil) {
      const expiresAt = new Date(data.lockedUntil);
      const now = new Date();

      if (expiresAt > now) {
        const timeRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / 1000);
        return {
          isLimited: true,
          remainingAttempts: 0,
          expiresAt,
          timeRemaining,
        };
      } else {
        // Lock has expired, clear it
        localStorage.removeItem(key);
      }
    }

    const remainingAttempts = Math.max(0, 5 - data.attempts);
    return {
      isLimited: false,
      remainingAttempts,
      expiresAt: null,
      timeRemaining: 0,
    };
  } catch {
    localStorage.removeItem(key);
    return {
      isLimited: false,
      remainingAttempts: 5,
      expiresAt: null,
      timeRemaining: 0,
    };
  }
}

/**
 * Record a failed login attempt (client-side tracking)
 *
 * @param identifier - Email or other identifier
 */
export function recordFailedAttempt(identifier: string): void {
  if (typeof window === 'undefined') return;

  const key = `${RATE_LIMIT_KEY_PREFIX}${hashString(identifier)}`;
  const stored = localStorage.getItem(key);

  let data = { attempts: 0, lockedUntil: null as string | null };

  if (stored) {
    try {
      data = JSON.parse(stored);
    } catch {
      // Ignore parse errors
    }
  }

  data.attempts += 1;

  // Lock after 5 attempts for 15 minutes
  if (data.attempts >= 5) {
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + 15);
    data.lockedUntil = lockUntil.toISOString();
  }

  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Clear rate limit tracking for an identifier (after successful login)
 *
 * @param identifier - Email or other identifier
 */
export function clearRateLimit(identifier: string): void {
  if (typeof window === 'undefined') return;

  const key = `${RATE_LIMIT_KEY_PREFIX}${hashString(identifier)}`;
  localStorage.removeItem(key);
}

// ============================================
// Security Headers Check
// ============================================

export interface SecurityHeadersCheck {
  /** Whether all critical security headers are present */
  isSecure: boolean;
  /** List of missing headers */
  missingHeaders: string[];
  /** Detailed check results */
  headers: Record<string, boolean>;
}

/**
 * Check if critical security headers are present
 *
 * This is a client-side check to verify the server is configured correctly.
 * Should only be used for debugging/monitoring, not for security decisions.
 *
 * Note: Not all headers are accessible from JavaScript due to CORS.
 *
 * @returns Security headers check result
 */
export function checkSecurityHeaders(): SecurityHeadersCheck {
  // In client-side code, we can't directly access response headers
  // This is mainly for verification during development
  const headers: Record<string, boolean> = {
    'https-enabled': typeof window !== 'undefined' && window.location.protocol === 'https:',
  };

  const missingHeaders = Object.entries(headers)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  return {
    isSecure: missingHeaders.length === 0,
    missingHeaders,
    headers,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Simple hash function for client-side use
 *
 * Uses DJB2 algorithm for fast hashing. Not cryptographically secure,
 * but suitable for fingerprinting and local storage keys.
 *
 * @param str - String to hash
 * @returns Hash string
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Timing-safe string comparison
 *
 * Compares strings in constant time to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ============================================
// Session Security
// ============================================

const SESSION_FINGERPRINT_KEY = 'intelliflow_session_fp';

/**
 * Verify that the current device matches the session fingerprint
 *
 * Used to detect potential session hijacking by comparing the
 * current device fingerprint with the one stored at login.
 *
 * @returns True if fingerprints match, false otherwise
 */
export function verifySessionFingerprint(): boolean {
  if (typeof window === 'undefined') return true;

  const storedFingerprint = sessionStorage.getItem(SESSION_FINGERPRINT_KEY);
  if (!storedFingerprint) return true; // No fingerprint stored yet

  const currentFingerprint = getDeviceFingerprintHash();
  return storedFingerprint === currentFingerprint;
}

/**
 * Store the current device fingerprint for session verification
 *
 * Should be called after successful login.
 */
export function storeSessionFingerprint(): void {
  if (typeof window === 'undefined') return;

  const fingerprint = getDeviceFingerprintHash();
  sessionStorage.setItem(SESSION_FINGERPRINT_KEY, fingerprint);
}

/**
 * Clear the session fingerprint (on logout)
 */
export function clearSessionFingerprint(): void {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(SESSION_FINGERPRINT_KEY);
}
