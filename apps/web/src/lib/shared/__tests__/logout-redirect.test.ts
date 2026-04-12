/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidRedirectUrl,
  sanitizeReturnUrl,
  buildLoginUrl,
  buildLogoutUrl,
  getSsoLogoutUrl,
  getLogoutRedirect,
  parseLogoutReason,
  parseReturnUrl,
  getLogoutMessage,
  isLogoutPage,
  isLoginPage,
} from '../logout-redirect';

describe('logout-redirect', () => {
  beforeEach(() => {
    // Reset window.location
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isValidRedirectUrl', () => {
    it('accepts relative paths', () => {
      expect(isValidRedirectUrl('/dashboard')).toBe(true);
      expect(isValidRedirectUrl('/settings/profile')).toBe(true);
    });

    it('rejects protocol-relative URLs', () => {
      expect(isValidRedirectUrl('//evil.com')).toBe(false);
    });

    it('rejects URLs with embedded protocols', () => {
      expect(isValidRedirectUrl('/redirect?url=http://evil.com')).toBe(false);
    });

    it('accepts same-origin absolute URLs', () => {
      expect(isValidRedirectUrl('https://app.intelliflow.com/dashboard')).toBe(true);
    });

    it('rejects cross-origin URLs', () => {
      expect(isValidRedirectUrl('https://evil.com/phishing')).toBe(false);
    });

    it('rejects empty URLs', () => {
      expect(isValidRedirectUrl('')).toBe(false);
    });

    it('rejects URLs with backslashes', () => {
      expect(isValidRedirectUrl('/path\\..\\evil')).toBe(false);
    });
  });

  describe('sanitizeReturnUrl', () => {
    it('returns null for invalid URLs', () => {
      expect(sanitizeReturnUrl('https://evil.com')).toBeNull();
      expect(sanitizeReturnUrl('//evil.com')).toBeNull();
    });

    it('returns valid relative paths', () => {
      expect(sanitizeReturnUrl('/dashboard')).toBe('/dashboard');
    });

    it('decodes URL-encoded paths', () => {
      expect(sanitizeReturnUrl('%2Fdashboard')).toBe('/dashboard');
    });

    it('returns null for null/undefined', () => {
      expect(sanitizeReturnUrl(null)).toBeNull();
      expect(sanitizeReturnUrl(undefined)).toBeNull();
    });
  });

  describe('buildLoginUrl', () => {
    it('builds basic login URL', () => {
      expect(buildLoginUrl()).toBe('/login');
    });

    it('includes return URL when provided', () => {
      const url = buildLoginUrl({ returnUrl: '/dashboard' });
      expect(url).toContain('returnUrl=%2Fdashboard');
    });

    it('includes message for logout reason', () => {
      const url = buildLoginUrl({ reason: 'session_expired' });
      expect(url).toContain('message=');
      expect(url).toContain('expired');
    });

    it('skips message when showMessage is false', () => {
      const url = buildLoginUrl({ reason: 'session_expired', showMessage: false });
      expect(url).toBe('/login');
    });

    it('filters out invalid return URLs', () => {
      const url = buildLoginUrl({ returnUrl: 'https://evil.com' });
      expect(url).toBe('/login');
    });
  });

  describe('buildLogoutUrl', () => {
    it('builds basic logout URL', () => {
      expect(buildLogoutUrl()).toBe('/logout');
    });

    it('includes reason parameter', () => {
      const url = buildLogoutUrl({ reason: 'user_initiated' });
      expect(url).toContain('reason=user_initiated');
    });

    it('includes SSO provider', () => {
      const url = buildLogoutUrl({ ssoProvider: 'google' });
      expect(url).toContain('sso=google');
    });

    it('includes valid return URL', () => {
      const url = buildLogoutUrl({ returnUrl: '/dashboard' });
      expect(url).toContain('returnUrl=%2Fdashboard');
    });
  });

  describe('getSsoLogoutUrl', () => {
    it('returns Google logout URL', () => {
      const url = getSsoLogoutUrl('google');
      expect(url).toContain('accounts.google.com/logout');
    });

    it('returns Microsoft logout URL', () => {
      const url = getSsoLogoutUrl('microsoft');
      expect(url).toContain('login.microsoftonline.com');
      expect(url).toContain('logout');
    });

    it('returns Azure logout URL', () => {
      const url = getSsoLogoutUrl('azure');
      expect(url).toContain('login.microsoftonline.com');
    });

    it('includes post-logout redirect URI', () => {
      const url = getSsoLogoutUrl('google', 'https://app.intelliflow.com/login');
      expect(url).toContain(encodeURIComponent('https://app.intelliflow.com/login'));
    });
  });

  describe('getLogoutRedirect', () => {
    it('returns redirect info', () => {
      const result = getLogoutRedirect();

      expect(result.url).toBe('/login');
      expect(result.requiresSsoLogout).toBe(false);
    });

    it('includes return URL in redirect', () => {
      const result = getLogoutRedirect({ returnUrl: '/dashboard' });

      expect(result.url).toContain('returnUrl');
      expect(result.params.get('returnUrl')).toBe('/dashboard');
    });

    it('includes message for reason', () => {
      const result = getLogoutRedirect({
        reason: 'session_expired',
        showMessage: true,
      });

      expect(result.params.get('message')).toContain('expired');
    });

    it('sets SSO logout when required', () => {
      const result = getLogoutRedirect({
        ssoLogout: true,
        ssoProvider: 'google',
      });

      expect(result.requiresSsoLogout).toBe(true);
      expect(result.ssoLogoutUrl).toContain('accounts.google.com');
    });
  });

  describe('parseLogoutReason', () => {
    it('parses reason from URL', () => {
      window.location.search = '?reason=session_expired';

      expect(parseLogoutReason()).toBe('session_expired');
    });

    it('returns null for invalid reason', () => {
      window.location.search = '?reason=invalid_reason';

      expect(parseLogoutReason()).toBeNull();
    });

    it('returns null when no reason', () => {
      window.location.search = '';

      expect(parseLogoutReason()).toBeNull();
    });

    it('accepts custom URL string', () => {
      expect(parseLogoutReason('reason=user_initiated')).toBe('user_initiated');
    });
  });

  describe('parseReturnUrl', () => {
    it('parses return URL from location', () => {
      window.location.search = '?returnUrl=/dashboard';

      expect(parseReturnUrl()).toBe('/dashboard');
    });

    it('returns null for invalid return URL', () => {
      window.location.search = '?returnUrl=https://evil.com';

      expect(parseReturnUrl()).toBeNull();
    });

    it('returns null when no return URL', () => {
      window.location.search = '';

      expect(parseReturnUrl()).toBeNull();
    });
  });

  describe('getLogoutMessage', () => {
    it('returns message for each reason', () => {
      expect(getLogoutMessage('user_initiated')).toContain('logged out');
      expect(getLogoutMessage('session_expired')).toContain('expired');
      expect(getLogoutMessage('security_violation')).toContain('security');
      expect(getLogoutMessage('account_disabled')).toContain('disabled');
      expect(getLogoutMessage('password_changed')).toContain('password');
      expect(getLogoutMessage('mfa_required')).toContain('authentication');
      expect(getLogoutMessage('admin_forced')).toContain('administrator');
    });

    it('returns default message for null reason', () => {
      expect(getLogoutMessage(null)).toContain('logged out');
    });

    it('returns default message for undefined', () => {
      expect(getLogoutMessage(undefined)).toContain('logged out');
    });
  });

  describe('isLogoutPage', () => {
    it('returns true when on logout page', () => {
      window.location.pathname = '/logout';
      expect(isLogoutPage()).toBe(true);
    });

    it('returns false when not on logout page', () => {
      window.location.pathname = '/dashboard';
      expect(isLogoutPage()).toBe(false);
    });
  });

  describe('isLoginPage', () => {
    it('returns true when on login page', () => {
      window.location.pathname = '/login';
      expect(isLoginPage()).toBe(true);
    });

    it('returns false when not on login page', () => {
      window.location.pathname = '/dashboard';
      expect(isLoginPage()).toBe(false);
    });
  });
});
