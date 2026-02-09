/**
 * @vitest-environment happy-dom
 *
 * Token Exchange - B11 coverage tests
 *
 * Targets ~12 uncovered lines (69.23% coverage):
 * - storeSessionTokens: with and without refreshToken
 * - clearSessionTokens
 * - getStoredAccessToken
 * - isOAuthError: with invalid code string (not in ERROR_MESSAGES)
 * - extractOAuthParams: invalid provider value
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  storeSessionTokens,
  clearSessionTokens,
  getStoredAccessToken,
  isOAuthError,
  extractOAuthParams,
  validateOAuthParams,
  type OAuthParams,
} from '../token-exchange';

describe('token-exchange (b11 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('storeSessionTokens', () => {
    it('stores accessToken in localStorage', () => {
      storeSessionTokens('my-access-token');

      expect(localStorage.getItem('accessToken')).toBe('my-access-token');
    });

    it('stores both accessToken and refreshToken', () => {
      storeSessionTokens('access-123', 'refresh-456');

      expect(localStorage.getItem('accessToken')).toBe('access-123');
      expect(localStorage.getItem('refreshToken')).toBe('refresh-456');
    });

    it('does not store refreshToken when not provided', () => {
      storeSessionTokens('access-only');

      expect(localStorage.getItem('accessToken')).toBe('access-only');
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });

  describe('clearSessionTokens', () => {
    it('removes accessToken and refreshToken from localStorage', () => {
      localStorage.setItem('accessToken', 'token');
      localStorage.setItem('refreshToken', 'refresh');

      clearSessionTokens();

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });

    it('does not throw when tokens do not exist', () => {
      expect(() => clearSessionTokens()).not.toThrow();
    });
  });

  describe('getStoredAccessToken', () => {
    it('returns the stored access token', () => {
      localStorage.setItem('accessToken', 'stored-token');

      expect(getStoredAccessToken()).toBe('stored-token');
    });

    it('returns null when no token is stored', () => {
      expect(getStoredAccessToken()).toBeNull();
    });
  });

  describe('isOAuthError - additional coverage', () => {
    it('returns false for object with code not in ERROR_MESSAGES', () => {
      const error = {
        code: 'INVALID_CODE_THAT_DOES_NOT_EXIST',
        message: 'Some message',
      };

      expect(isOAuthError(error)).toBe(false);
    });

    it('returns true for all valid error codes', () => {
      const validCodes = [
        'MISSING_CODE',
        'PROVIDER_ERROR',
        'EXCHANGE_FAILED',
        'SESSION_FAILED',
        'NETWORK_ERROR',
      ];

      for (const code of validCodes) {
        expect(isOAuthError({ code, message: 'test' })).toBe(true);
      }
    });

    it('returns false for number', () => {
      expect(isOAuthError(42)).toBe(false);
    });

    it('returns false for object with numeric code', () => {
      expect(isOAuthError({ code: 123, message: 'test' })).toBe(false);
    });

    it('returns false for object with numeric message', () => {
      expect(isOAuthError({ code: 'MISSING_CODE', message: 123 })).toBe(false);
    });
  });

  describe('extractOAuthParams - invalid provider', () => {
    it('returns null provider for unknown provider value', () => {
      const params = new URLSearchParams('code=abc&provider=github');
      const result = extractOAuthParams(params);

      expect(result.provider).toBeNull();
      expect(result.code).toBe('abc');
    });

    it('returns null provider for empty provider value', () => {
      const params = new URLSearchParams('code=abc&provider=');
      const result = extractOAuthParams(params);

      expect(result.provider).toBeNull();
    });
  });

  describe('validateOAuthParams - code with only state', () => {
    it('builds validated params with state and without provider', () => {
      const params: OAuthParams = {
        code: 'valid-code',
        state: 'state-value',
        error: null,
        errorDescription: null,
        provider: null,
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe('valid-code');
        expect(result.value.state).toBe('state-value');
        expect(result.value.provider).toBeUndefined();
      }
    });

    it('builds validated params with provider and without state', () => {
      const params: OAuthParams = {
        code: 'valid-code',
        state: null,
        error: null,
        errorDescription: null,
        provider: 'azure',
      };

      const result = validateOAuthParams(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe('valid-code');
        expect(result.value.state).toBeUndefined();
        expect(result.value.provider).toBe('azure');
      }
    });
  });
});
