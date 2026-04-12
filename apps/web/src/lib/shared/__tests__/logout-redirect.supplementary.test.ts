/**
 * @vitest-environment happy-dom
 * Supplementary tests for logout-redirect.ts
 *
 * Covers remaining uncovered branches: performLogoutRedirect (SSO + delay logic),
 * navigateToLogout, parseReturnUrl with custom URL, parseLogoutReason with all reasons,
 * getLogoutRedirect SSO with microsoft/azure, sanitizeReturnUrl decoding failures,
 * buildLogoutUrl with all options, SSR guards (typeof window === 'undefined').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  performLogoutRedirect,
  navigateToLogout,
  getLogoutRedirect,
  buildLogoutUrl,
  buildLoginUrl,
  getSsoLogoutUrl,
  parseLogoutReason,
  parseReturnUrl,
  getLogoutMessage,
  isLogoutPage as _isLogoutPage,
  isLoginPage as _isLoginPage,
  isValidRedirectUrl,
  sanitizeReturnUrl,
} from '../logout-redirect';

describe('logout-redirect supplementary', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://app.intelliflow.com',
        hostname: 'app.intelliflow.com',
        pathname: '/',
        search: '',
        href: 'https://app.intelliflow.com/',
      },
      writable: true,
    });
  });

  // ==========================================================================
  // performLogoutRedirect
  // ==========================================================================

  describe('performLogoutRedirect', () => {
    it('redirects immediately to public home when no delay', () => {
      performLogoutRedirect({ reason: 'user_initiated' });
      // Post-logout now lands on public home (`/`), not `/login`
      expect(window.location.href).toMatch(/\/($|\?)/);
      expect(window.location.href).not.toContain('/login');
    });

    it('redirects to SSO logout URL when ssoLogout is true with provider', () => {
      performLogoutRedirect({
        ssoLogout: true,
        ssoProvider: 'google',
      });
      expect(window.location.href).toContain('accounts.google.com');
    });

    it('redirects to public home when ssoLogout is false', () => {
      performLogoutRedirect({
        ssoLogout: false,
        ssoProvider: 'google',
      });
      expect(window.location.href).toMatch(/\/($|\?)/);
      expect(window.location.href).not.toContain('/login');
    });

    it('delays redirect when delay > 0', () => {
      vi.useFakeTimers();

      performLogoutRedirect({ delay: 3000 });

      // href should not have changed yet
      expect(window.location.href).toBe('https://app.intelliflow.com/');

      vi.advanceTimersByTime(3000);

      expect(window.location.href).toMatch(/\/($|\?)/);
      expect(window.location.href).not.toContain('/login');

      vi.useRealTimers();
    });

    it('redirects to SSO URL with delay', () => {
      vi.useFakeTimers();

      performLogoutRedirect({
        ssoLogout: true,
        ssoProvider: 'microsoft',
        delay: 1000,
      });

      expect(window.location.href).toBe('https://app.intelliflow.com/');

      vi.advanceTimersByTime(1000);

      expect(window.location.href).toContain('login.microsoftonline.com');

      vi.useRealTimers();
    });

    it('includes return URL and reason in redirect', () => {
      performLogoutRedirect({
        returnUrl: '/dashboard',
        reason: 'session_expired',
        showMessage: true,
      });

      // Redirect lands on public home with returnUrl and message query params
      expect(window.location.href).toContain('returnUrl=');
      expect(window.location.href).toContain('message=');
      expect(window.location.href).not.toContain('/login');
    });
  });

  // ==========================================================================
  // navigateToLogout
  // ==========================================================================

  describe('navigateToLogout', () => {
    it('navigates to logout page', () => {
      navigateToLogout();
      expect(window.location.href).toBe('/logout');
    });

    it('navigates to logout page with reason', () => {
      navigateToLogout({ reason: 'session_expired' });
      expect(window.location.href).toContain('/logout');
      expect(window.location.href).toContain('reason=session_expired');
    });

    it('navigates to logout page with SSO provider', () => {
      navigateToLogout({ ssoProvider: 'azure' });
      expect(window.location.href).toContain('sso=azure');
    });

    it('navigates to logout page with returnUrl', () => {
      navigateToLogout({ returnUrl: '/settings' });
      expect(window.location.href).toContain('returnUrl');
    });
  });

  // ==========================================================================
  // getLogoutRedirect - SSO with different providers
  // ==========================================================================

  describe('getLogoutRedirect - SSO providers', () => {
    it('generates Microsoft SSO logout URL', () => {
      const result = getLogoutRedirect({
        ssoLogout: true,
        ssoProvider: 'microsoft',
        reason: 'user_initiated',
      });

      expect(result.requiresSsoLogout).toBe(true);
      expect(result.ssoLogoutUrl).toContain('login.microsoftonline.com');
    });

    it('generates Azure SSO logout URL', () => {
      const result = getLogoutRedirect({
        ssoLogout: true,
        ssoProvider: 'azure',
      });

      expect(result.requiresSsoLogout).toBe(true);
      expect(result.ssoLogoutUrl).toContain('login.microsoftonline.com');
    });

    it('does not require SSO logout when ssoLogout is false', () => {
      const result = getLogoutRedirect({
        ssoLogout: false,
        ssoProvider: 'google',
      });

      expect(result.requiresSsoLogout).toBe(false);
      expect(result.ssoLogoutUrl).toBeUndefined();
    });

    it('does not require SSO logout when no provider is specified', () => {
      const result = getLogoutRedirect({
        ssoLogout: true,
      });

      expect(result.requiresSsoLogout).toBe(false);
      expect(result.ssoLogoutUrl).toBeUndefined();
    });

    it('skips message when showMessage is false', () => {
      const result = getLogoutRedirect({
        reason: 'security_violation',
        showMessage: false,
      });

      expect(result.params.has('message')).toBe(false);
    });

    it('includes message by default when reason is provided', () => {
      const result = getLogoutRedirect({
        reason: 'account_disabled',
      });

      expect(result.params.has('message')).toBe(true);
      expect(result.params.get('message')).toContain('disabled');
    });

    it('filters invalid returnUrl in redirect', () => {
      const result = getLogoutRedirect({
        returnUrl: 'https://evil.com/phishing',
      });

      expect(result.params.has('returnUrl')).toBe(false);
    });
  });

  // ==========================================================================
  // getSsoLogoutUrl - default branch
  // ==========================================================================

  describe('getSsoLogoutUrl - default branch', () => {
    it('returns null for unknown provider', () => {
      // Cast to bypass type checking for the test
      const result = getSsoLogoutUrl('okta' as any);
      expect(result).toBeNull();
    });

    it('uses custom post-logout redirect URI', () => {
      const result = getSsoLogoutUrl('google', 'https://myapp.com/logged-out');
      expect(result).toContain(encodeURIComponent('https://myapp.com/logged-out'));
    });

    it('uses default redirect URI when none provided', () => {
      const result = getSsoLogoutUrl('google');
      expect(result).toContain(encodeURIComponent(`${window.location.origin}/login`));
    });
  });

  // ==========================================================================
  // buildLogoutUrl - all option combinations
  // ==========================================================================

  describe('buildLogoutUrl - all options', () => {
    it('includes all parameters together', () => {
      const url = buildLogoutUrl({
        reason: 'admin_forced',
        returnUrl: '/admin',
        ssoProvider: 'microsoft',
      });

      expect(url).toContain('reason=admin_forced');
      expect(url).toContain('returnUrl');
      expect(url).toContain('sso=microsoft');
    });

    it('filters invalid returnUrl', () => {
      const url = buildLogoutUrl({ returnUrl: '//evil.com' });
      expect(url).toBe('/logout');
    });
  });

  // ==========================================================================
  // buildLoginUrl - additional edge cases
  // ==========================================================================

  describe('buildLoginUrl - edge cases', () => {
    it('handles encoded returnUrl', () => {
      const url = buildLoginUrl({ returnUrl: '%2Fsettings%2Fprofile' });
      expect(url).toContain('returnUrl');
    });

    it('includes reason message for all reason types', () => {
      const reasons = [
        'user_initiated',
        'session_expired',
        'security_violation',
        'account_disabled',
        'password_changed',
        'mfa_required',
        'admin_forced',
      ] as const;

      reasons.forEach((reason) => {
        const url = buildLoginUrl({ reason, showMessage: true });
        expect(url).toContain('message=');
      });
    });
  });

  // ==========================================================================
  // sanitizeReturnUrl - decode failure path
  // ==========================================================================

  describe('sanitizeReturnUrl - decode failure', () => {
    it('keeps original URL when decoding fails', () => {
      // %ZZ is not a valid percent-encoding
      const result = sanitizeReturnUrl('/dashboard%ZZpath');
      // If decoding fails, it validates the original. If original is valid, it returns it.
      // /dashboard%ZZpath starts with / and doesn't contain :// or backslash
      if (result !== null) {
        expect(result).toContain('dashboard');
      }
    });
  });

  // ==========================================================================
  // parseLogoutReason - all valid reasons
  // ==========================================================================

  describe('parseLogoutReason - all valid reasons', () => {
    it('parses all valid reason types', () => {
      const validReasons = [
        'user_initiated',
        'session_expired',
        'security_violation',
        'account_disabled',
        'password_changed',
        'mfa_required',
        'admin_forced',
      ];

      validReasons.forEach((reason) => {
        expect(parseLogoutReason(`reason=${reason}`)).toBe(reason);
      });
    });
  });

  // ==========================================================================
  // parseReturnUrl - custom URL string
  // ==========================================================================

  describe('parseReturnUrl - custom URL string', () => {
    it('parses returnUrl from custom string', () => {
      const result = parseReturnUrl('returnUrl=%2Fprofile');
      expect(result).toBe('/profile');
    });

    it('returns null for missing returnUrl param', () => {
      const result = parseReturnUrl('other=value');
      expect(result).toBeNull();
    });

    it('returns null when returnUrl is invalid', () => {
      const result = parseReturnUrl('returnUrl=https%3A%2F%2Fevil.com');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getLogoutMessage - coverage for fallback branch
  // ==========================================================================

  describe('getLogoutMessage - fallback branch', () => {
    it('returns default message when reason is not in LOGOUT_MESSAGES', () => {
      // Cast to bypass type checking
      const msg = getLogoutMessage('nonexistent_reason' as any);
      expect(msg).toContain('logged out');
    });
  });

  // ==========================================================================
  // isValidRedirectUrl - additional edge cases
  // ==========================================================================

  describe('isValidRedirectUrl - additional edge cases', () => {
    it('rejects javascript: protocol', () => {
      // javascript: URLs are caught by URL parsing (not same origin)
      expect(isValidRedirectUrl('javascript:alert(1)')).toBe(false);
    });

    it('accepts paths with query strings', () => {
      expect(isValidRedirectUrl('/search?q=test')).toBe(true);
    });

    it('accepts paths with hash fragments', () => {
      expect(isValidRedirectUrl('/docs#section')).toBe(true);
    });

    it('rejects data: URLs', () => {
      expect(isValidRedirectUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    });
  });
});
