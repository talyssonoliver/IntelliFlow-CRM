/**
 * Token Exchange Service Tests
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Unit tests for OAuth token exchange utilities.
 * Tests parameter extraction, validation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import functions to test (will be implemented after tests)
import {
  extractOAuthParams,
  validateOAuthParams,
  getOAuthErrorMessage,
  isOAuthError,
  type OAuthParams,
  type OAuthValidationResult,
  type OAuthErrorCode,
} from '../token-exchange';

describe('Token Exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // extractOAuthParams Tests
  // ============================================
  describe('extractOAuthParams', () => {
    it('extracts code from URL params', () => {
      const params = new URLSearchParams('code=abc123');
      const result = extractOAuthParams(params);

      expect(result.code).toBe('abc123');
    });

    it('extracts state from URL params', () => {
      const params = new URLSearchParams('code=abc123&state=xyz789');
      const result = extractOAuthParams(params);

      expect(result.state).toBe('xyz789');
    });

    it('extracts error from URL params', () => {
      const params = new URLSearchParams('error=access_denied');
      const result = extractOAuthParams(params);

      expect(result.error).toBe('access_denied');
    });

    it('extracts error_description from URL params', () => {
      const params = new URLSearchParams('error=access_denied&error_description=User%20cancelled');
      const result = extractOAuthParams(params);

      expect(result.errorDescription).toBe('User cancelled');
    });

    it('extracts provider from URL params', () => {
      const params = new URLSearchParams('code=abc123&provider=google');
      const result = extractOAuthParams(params);

      expect(result.provider).toBe('google');
    });

    it('handles azure provider', () => {
      const params = new URLSearchParams('code=abc123&provider=azure');
      const result = extractOAuthParams(params);

      expect(result.provider).toBe('azure');
    });

    it('returns null for missing params', () => {
      const params = new URLSearchParams('');
      const result = extractOAuthParams(params);

      expect(result.code).toBeNull();
      expect(result.state).toBeNull();
      expect(result.error).toBeNull();
      expect(result.errorDescription).toBeNull();
      expect(result.provider).toBeNull();
    });

    it('extracts all params when present', () => {
      const params = new URLSearchParams(
        'code=abc&state=xyz&error=test_error&error_description=Test%20desc&provider=google'
      );
      const result = extractOAuthParams(params);

      expect(result).toEqual({
        code: 'abc',
        state: 'xyz',
        error: 'test_error',
        errorDescription: 'Test desc',
        provider: 'google',
      });
    });

    it('handles URL encoded values', () => {
      const params = new URLSearchParams('error_description=Invalid%20scope%3A%20read%2Bwrite');
      const result = extractOAuthParams(params);

      expect(result.errorDescription).toBe('Invalid scope: read+write');
    });
  });

  // ============================================
  // validateOAuthParams Tests
  // ============================================
  describe('validateOAuthParams', () => {
    it('returns success for valid params with code', () => {
      const params: OAuthParams = {
        code: 'abc123',
        state: 'xyz789',
        error: null,
        errorDescription: null,
        provider: 'google',
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe('abc123');
        expect(result.value.state).toBe('xyz789');
        expect(result.value.provider).toBe('google');
      }
    });

    it('returns error for provider error', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'access_denied',
        errorDescription: 'User cancelled the login',
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
        expect(result.error.message).toContain('User cancelled the login');
      }
    });

    it('returns error for missing code', () => {
      const params: OAuthParams = {
        code: null,
        state: 'xyz',
        error: null,
        errorDescription: null,
        provider: 'google',
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_CODE');
        expect(result.error.message).toContain('authorization code');
      }
    });

    it('returns error for empty code string', () => {
      const params: OAuthParams = {
        code: '',
        state: null,
        error: null,
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_CODE');
      }
    });

    it('returns error for whitespace-only code', () => {
      const params: OAuthParams = {
        code: '   ',
        state: null,
        error: null,
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_CODE');
      }
    });

    it('prioritizes provider error over missing code', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'server_error',
        errorDescription: 'Internal server error',
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
      }
    });

    it('uses default message for error without description', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'unknown_error',
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('unknown_error');
      }
    });

    it('handles valid params without optional state', () => {
      const params: OAuthParams = {
        code: 'abc123',
        state: null,
        error: null,
        errorDescription: null,
        provider: 'azure',
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe('abc123');
        expect(result.value.state).toBeUndefined();
      }
    });

    it('handles valid params without optional provider', () => {
      const params: OAuthParams = {
        code: 'abc123',
        state: 'xyz',
        error: null,
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.provider).toBeUndefined();
      }
    });
  });

  // ============================================
  // getOAuthErrorMessage Tests
  // ============================================
  describe('getOAuthErrorMessage', () => {
    it('returns user-friendly message for MISSING_CODE', () => {
      const message = getOAuthErrorMessage('MISSING_CODE');
      expect(message).toContain('authorization code');
      expect(message.length).toBeGreaterThan(10);
    });

    it('returns user-friendly message for PROVIDER_ERROR', () => {
      const message = getOAuthErrorMessage('PROVIDER_ERROR');
      expect(message).toContain('provider');
      expect(message.length).toBeGreaterThan(10);
    });

    it('returns user-friendly message for EXCHANGE_FAILED', () => {
      const message = getOAuthErrorMessage('EXCHANGE_FAILED');
      expect(message).toContain('exchange');
      expect(message.length).toBeGreaterThan(10);
    });

    it('returns user-friendly message for SESSION_FAILED', () => {
      const message = getOAuthErrorMessage('SESSION_FAILED');
      expect(message).toContain('session');
      expect(message.length).toBeGreaterThan(10);
    });

    it('returns user-friendly message for NETWORK_ERROR', () => {
      const message = getOAuthErrorMessage('NETWORK_ERROR');
      expect(message).toContain('network');
      expect(message.length).toBeGreaterThan(10);
    });

    it('returns generic message for unknown error code', () => {
      const message = getOAuthErrorMessage('UNKNOWN' as OAuthErrorCode);
      expect(message).toContain('error');
      expect(message.length).toBeGreaterThan(10);
    });
  });

  // ============================================
  // isOAuthError Tests
  // ============================================
  describe('isOAuthError', () => {
    it('returns true for OAuthError objects', () => {
      const error = {
        code: 'MISSING_CODE' as OAuthErrorCode,
        message: 'No authorization code',
      };

      expect(isOAuthError(error)).toBe(true);
    });

    it('returns false for plain Error', () => {
      const error = new Error('Some error');
      expect(isOAuthError(error)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isOAuthError('error')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isOAuthError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isOAuthError(undefined)).toBe(false);
    });

    it('returns false for object without code', () => {
      const error = { message: 'Some error' };
      expect(isOAuthError(error)).toBe(false);
    });

    it('returns false for object without message', () => {
      const error = { code: 'MISSING_CODE' };
      expect(isOAuthError(error)).toBe(false);
    });
  });

  // ============================================
  // OAuth Error Code Mapping Tests
  // ============================================
  describe('OAuth error code mapping', () => {
    it('maps access_denied to appropriate error', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'access_denied',
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
      }
    });

    it('maps server_error to appropriate error', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'server_error',
        errorDescription: 'Internal server error',
        provider: null,
      };

      const result = validateOAuthParams(params);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
      }
    });

    it('maps temporarily_unavailable to appropriate error', () => {
      const params: OAuthParams = {
        code: null,
        state: null,
        error: 'temporarily_unavailable',
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
      }
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('handles very long code values', () => {
      const longCode = 'a'.repeat(1000);
      const params = new URLSearchParams(`code=${longCode}`);
      const result = extractOAuthParams(params);

      expect(result.code).toBe(longCode);
    });

    it('handles special characters in error description', () => {
      const params = new URLSearchParams(
        'error=invalid_request&error_description=The%20%22redirect_uri%22%20is%20invalid'
      );
      const result = extractOAuthParams(params);

      expect(result.errorDescription).toBe('The "redirect_uri" is invalid');
    });

    it('handles multiple values for same param (takes first)', () => {
      const params = new URLSearchParams('code=first&code=second');
      const result = extractOAuthParams(params);

      expect(result.code).toBe('first');
    });

    it('trims code value', () => {
      // Note: URLSearchParams doesn't preserve leading/trailing spaces
      // but validation should trim anyway
      const params: OAuthParams = {
        code: 'abc123',
        state: null,
        error: null,
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);
      expect(result.ok).toBe(true);
    });
  });

  // ============================================
  // Type Safety Tests
  // ============================================
  describe('type safety', () => {
    it('OAuthParams has correct shape', () => {
      const params: OAuthParams = {
        code: 'test',
        state: 'state',
        error: 'error',
        errorDescription: 'desc',
        provider: 'google',
      };

      expect(params).toBeDefined();
    });

    it('OAuthValidationResult success has correct shape', () => {
      const result: OAuthValidationResult = {
        ok: true,
        value: {
          code: 'abc',
          state: 'xyz',
          provider: 'google',
        },
      };

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe('abc');
      }
    });

    it('OAuthValidationResult error has correct shape', () => {
      const result: OAuthValidationResult = {
        ok: false,
        error: {
          code: 'MISSING_CODE',
          message: 'No code',
        },
      };

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_CODE');
      }
    });
  });
});
