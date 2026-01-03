/**
 * Logout Redirect Service
 *
 * Utilities for handling post-logout redirects.
 *
 * IMPLEMENTS: PG-018 (Logout page)
 *
 * Features:
 * - Smart redirect URL handling
 * - Return URL preservation
 * - Security validation (prevent open redirects)
 * - SSO logout URL generation
 * - Timeout handling
 */

// ============================================
// Types
// ============================================

export type LogoutReason =
  | 'user_initiated'
  | 'session_expired'
  | 'security_violation'
  | 'account_disabled'
  | 'password_changed'
  | 'mfa_required'
  | 'admin_forced';

export interface LogoutRedirectOptions {
  reason?: LogoutReason;
  returnUrl?: string;
  showMessage?: boolean;
  delay?: number;
  ssoLogout?: boolean;
  ssoProvider?: 'google' | 'microsoft' | 'azure';
}

export interface LogoutRedirectResult {
  url: string;
  params: URLSearchParams;
  requiresSsoLogout: boolean;
  ssoLogoutUrl?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_LOGIN_PATH = '/login';
const DEFAULT_LOGOUT_PATH = '/logout';
const ALLOWED_REDIRECT_HOSTS: string[] = [];  // Add trusted hosts here

const LOGOUT_MESSAGES: Record<LogoutReason, string> = {
  user_initiated: 'You have been logged out successfully.',
  session_expired: 'Your session has expired. Please log in again.',
  security_violation: 'You have been logged out for security reasons.',
  account_disabled: 'Your account has been disabled.',
  password_changed: 'Your password was changed. Please log in with your new password.',
  mfa_required: 'Multi-factor authentication is required. Please log in again.',
  admin_forced: 'You have been logged out by an administrator.',
};

// ============================================
// URL Validation
// ============================================

/**
 * Check if a URL is safe to redirect to (prevents open redirect attacks)
 */
export function isValidRedirectUrl(url: string): boolean {
  if (!url) return false;

  try {
    // Allow relative paths
    if (url.startsWith('/') && !url.startsWith('//')) {
      // Block paths that could be interpreted as protocol-relative URLs
      return !url.includes('://') && !url.includes('\\');
    }

    // Parse absolute URLs
    const parsed = new URL(url, window.location.origin);

    // Only allow same-origin or explicitly allowed hosts
    if (parsed.origin === window.location.origin) {
      return true;
    }

    // Check against allowed external hosts
    return ALLOWED_REDIRECT_HOSTS.includes(parsed.host);
  } catch {
    return false;
  }
}

/**
 * Sanitize and validate a return URL
 */
export function sanitizeReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Decode URL if encoded
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep original if decoding fails
  }

  // Validate the URL
  if (!isValidRedirectUrl(decoded)) {
    console.warn('[LogoutRedirect] Invalid return URL blocked:', url);
    return null;
  }

  return decoded;
}

// ============================================
// Redirect URL Generation
// ============================================

/**
 * Build the login page URL with optional parameters
 */
export function buildLoginUrl(options: {
  returnUrl?: string | null;
  reason?: LogoutReason;
  showMessage?: boolean;
} = {}): string {
  const params = new URLSearchParams();

  // Add sanitized return URL
  if (options.returnUrl) {
    const sanitized = sanitizeReturnUrl(options.returnUrl);
    if (sanitized) {
      params.set('returnUrl', sanitized);
    }
  }

  // Add logout reason for messaging
  if (options.reason && options.showMessage !== false) {
    params.set('message', LOGOUT_MESSAGES[options.reason]);
  }

  const queryString = params.toString();
  return queryString ? `${DEFAULT_LOGIN_PATH}?${queryString}` : DEFAULT_LOGIN_PATH;
}

/**
 * Build the logout page URL
 */
export function buildLogoutUrl(options: LogoutRedirectOptions = {}): string {
  const params = new URLSearchParams();

  if (options.reason) {
    params.set('reason', options.reason);
  }

  if (options.returnUrl) {
    const sanitized = sanitizeReturnUrl(options.returnUrl);
    if (sanitized) {
      params.set('returnUrl', sanitized);
    }
  }

  if (options.ssoProvider) {
    params.set('sso', options.ssoProvider);
  }

  const queryString = params.toString();
  return queryString ? `${DEFAULT_LOGOUT_PATH}?${queryString}` : DEFAULT_LOGOUT_PATH;
}

// ============================================
// SSO Logout URLs
// ============================================

/**
 * Get SSO provider logout URL
 */
export function getSsoLogoutUrl(
  provider: 'google' | 'microsoft' | 'azure',
  postLogoutRedirectUri?: string
): string | null {
  const redirectUri = postLogoutRedirectUri || `${window.location.origin}/login`;

  switch (provider) {
    case 'google':
      // Google doesn't have a true logout URL, but we can revoke the session
      return `https://accounts.google.com/logout?continue=${encodeURIComponent(redirectUri)}`;

    case 'microsoft':
    case 'azure':
      // Azure AD logout endpoint
      // Note: In production, use your Azure AD tenant ID
      return `https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;

    default:
      return null;
  }
}

// ============================================
// Main Redirect Functions
// ============================================

/**
 * Calculate the redirect destination after logout
 */
export function getLogoutRedirect(options: LogoutRedirectOptions = {}): LogoutRedirectResult {
  const params = new URLSearchParams();

  // Add return URL if provided and valid
  if (options.returnUrl) {
    const sanitized = sanitizeReturnUrl(options.returnUrl);
    if (sanitized) {
      params.set('returnUrl', sanitized);
    }
  }

  // Add logout message
  if (options.reason && options.showMessage !== false) {
    params.set('message', LOGOUT_MESSAGES[options.reason]);
  }

  // Determine if SSO logout is needed
  const requiresSsoLogout = options.ssoLogout === true && !!options.ssoProvider;
  let ssoLogoutUrl: string | undefined;

  if (requiresSsoLogout && options.ssoProvider) {
    const loginUrl = buildLoginUrl({
      returnUrl: options.returnUrl,
      reason: options.reason,
      showMessage: options.showMessage,
    });
    ssoLogoutUrl = getSsoLogoutUrl(options.ssoProvider, `${window.location.origin}${loginUrl}`) || undefined;
  }

  const queryString = params.toString();
  const url = queryString ? `${DEFAULT_LOGIN_PATH}?${queryString}` : DEFAULT_LOGIN_PATH;

  return {
    url,
    params,
    requiresSsoLogout,
    ssoLogoutUrl,
  };
}

/**
 * Perform the logout redirect
 */
export function performLogoutRedirect(
  options: LogoutRedirectOptions = {}
): void {
  if (typeof window === 'undefined') return;

  const { url, requiresSsoLogout, ssoLogoutUrl } = getLogoutRedirect(options);
  const delay = options.delay ?? 0;

  const redirect = () => {
    if (requiresSsoLogout && ssoLogoutUrl) {
      // Redirect to SSO logout first
      window.location.href = ssoLogoutUrl;
    } else {
      // Redirect to login page
      window.location.href = url;
    }
  };

  if (delay > 0) {
    setTimeout(redirect, delay);
  } else {
    redirect();
  }
}

/**
 * Navigate to logout page (for programmatic logout)
 */
export function navigateToLogout(options: LogoutRedirectOptions = {}): void {
  if (typeof window === 'undefined') return;

  const url = buildLogoutUrl(options);
  window.location.href = url;
}

// ============================================
// URL Parsing Utilities
// ============================================

/**
 * Parse logout reason from URL
 */
export function parseLogoutReason(url?: string): LogoutReason | null {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(url || window.location.search);
  const reason = searchParams.get('reason');

  if (reason && reason in LOGOUT_MESSAGES) {
    return reason as LogoutReason;
  }

  return null;
}

/**
 * Parse return URL from current location
 */
export function parseReturnUrl(url?: string): string | null {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(url || window.location.search);
  return sanitizeReturnUrl(searchParams.get('returnUrl'));
}

/**
 * Get logout message for display
 */
export function getLogoutMessage(reason?: LogoutReason | null): string {
  if (!reason) {
    return LOGOUT_MESSAGES.user_initiated;
  }
  return LOGOUT_MESSAGES[reason] || LOGOUT_MESSAGES.user_initiated;
}

/**
 * Check if current page is the logout page
 */
export function isLogoutPage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === DEFAULT_LOGOUT_PATH;
}

/**
 * Check if current page is the login page
 */
export function isLoginPage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === DEFAULT_LOGIN_PATH;
}
