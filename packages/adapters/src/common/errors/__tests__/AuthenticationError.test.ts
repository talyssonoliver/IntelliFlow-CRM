/**
 * AuthenticationError Tests
 *
 * Tests for the AuthenticationError class including construction,
 * property access, isRecoverable logic, and serialization.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect } from 'vitest';
import { AuthenticationError } from '../AuthenticationError';
import { AdapterError } from '../AdapterError';

describe('AuthenticationError', () => {
  describe('constructor', () => {
    it('should create error with default message when none provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'Google');
      expect(error.message).toBe('Authentication failed for Google');
    });

    it('should use custom message when provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'Google', {
        message: 'OAuth token expired',
      });
      expect(error.message).toBe('OAuth token expired');
    });

    it('should set code property', () => {
      const error = new AuthenticationError('OAUTH_EXPIRED', 'Google');
      expect(error.code).toBe('OAUTH_EXPIRED');
    });

    it('should set provider property', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'Microsoft');
      expect(error.provider).toBe('Microsoft');
    });

    it('should default authType to unknown when not provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error.authType).toBe('unknown');
    });

    it('should set authType when provided', () => {
      const authTypes: Array<'oauth' | 'api_key' | 'bearer' | 'basic' | 'unknown'> = [
        'oauth', 'api_key', 'bearer', 'basic', 'unknown',
      ];

      for (const authType of authTypes) {
        const error = new AuthenticationError('AUTH_FAILED', 'provider', { authType });
        expect(error.authType).toBe(authType);
      }
    });

    it('should default isExpired to false when not provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error.isExpired).toBe(false);
    });

    it('should set isExpired when provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', { isExpired: true });
      expect(error.isExpired).toBe(true);
    });

    it('should default isRevoked to false when not provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error.isRevoked).toBe(false);
    });

    it('should set isRevoked when provided', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', { isRevoked: true });
      expect(error.isRevoked).toBe(true);
    });

    it('should pass requestId to parent AdapterError', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', {
        requestId: 'req-999',
      });
      expect(error.requestId).toBe('req-999');
    });

    it('should set timestamp from parent', () => {
      const before = new Date();
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      const after = new Date();
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accept all options at once', () => {
      const error = new AuthenticationError('TOKEN_EXPIRED', 'Slack', {
        authType: 'oauth',
        isExpired: true,
        isRevoked: false,
        requestId: 'req-abc',
        message: 'Token has expired',
      });
      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.provider).toBe('Slack');
      expect(error.authType).toBe('oauth');
      expect(error.isExpired).toBe(true);
      expect(error.isRevoked).toBe(false);
      expect(error.requestId).toBe('req-abc');
      expect(error.message).toBe('Token has expired');
    });
  });

  describe('instanceof chain', () => {
    it('should be an instance of Error', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be an instance of AdapterError', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error).toBeInstanceOf(AdapterError);
    });

    it('should be an instance of AuthenticationError', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should have a stack trace', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('isRecoverable', () => {
    it('should return true when expired and not revoked', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', {
        isExpired: true,
        isRevoked: false,
      });
      expect(error.isRecoverable()).toBe(true);
    });

    it('should return false when expired and revoked', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', {
        isExpired: true,
        isRevoked: true,
      });
      expect(error.isRecoverable()).toBe(false);
    });

    it('should return false when not expired and not revoked', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', {
        isExpired: false,
        isRevoked: false,
      });
      expect(error.isRecoverable()).toBe(false);
    });

    it('should return false when not expired and revoked', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider', {
        isExpired: false,
        isRevoked: true,
      });
      expect(error.isRecoverable()).toBe(false);
    });

    it('should return false with defaults (not expired, not revoked)', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      expect(error.isRecoverable()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should include base AdapterError fields', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'Google', {
        requestId: 'req-123',
      });
      const json = error.toJSON();

      expect(json.code).toBe('AUTH_FAILED');
      expect(json.message).toBe('Authentication failed for Google');
      expect(json.provider).toBe('Google');
      expect(json.requestId).toBe('req-123');
      expect(typeof json.timestamp).toBe('string');
    });

    it('should include auth-specific fields', () => {
      const error = new AuthenticationError('OAUTH_EXPIRED', 'Slack', {
        authType: 'oauth',
        isExpired: true,
        isRevoked: false,
      });
      const json = error.toJSON();

      expect(json.authType).toBe('oauth');
      expect(json.isExpired).toBe(true);
      expect(json.isRevoked).toBe(false);
      expect(json.isRecoverable).toBe(true);
    });

    it('should reflect isRecoverable=false when revoked', () => {
      const error = new AuthenticationError('AUTH_REVOKED', 'API', {
        isExpired: true,
        isRevoked: true,
      });
      const json = error.toJSON();
      expect(json.isRecoverable).toBe(false);
    });

    it('should serialize timestamp as ISO string', () => {
      const error = new AuthenticationError('AUTH_FAILED', 'provider');
      const json = error.toJSON();
      const isoString = json.timestamp as string;
      expect(new Date(isoString).toISOString()).toBe(isoString);
    });

    it('should include all properties in serialization', () => {
      const error = new AuthenticationError('KEY_INVALID', 'Twilio', {
        authType: 'api_key',
        isExpired: false,
        isRevoked: true,
        requestId: 'req-xyz',
        message: 'API key is invalid',
      });
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'KEY_INVALID',
        message: 'API key is invalid',
        provider: 'Twilio',
        requestId: 'req-xyz',
        timestamp: expect.any(String),
        authType: 'api_key',
        isExpired: false,
        isRevoked: true,
        isRecoverable: false,
      });
    });
  });
});
