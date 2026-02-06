/**
 * RateLimitError Tests
 *
 * Tests for the RateLimitError class including construction,
 * property access, retry delay calculation, and serialization.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect } from 'vitest';
import { RateLimitError } from '../RateLimitError';
import { AdapterError } from '../AdapterError';

describe('RateLimitError', () => {
  describe('constructor', () => {
    it('should create error with formatted message', () => {
      const error = new RateLimitError('RATE_LIMITED', 30, 'OpenAI');
      expect(error.message).toBe('Rate limited by OpenAI. Retry after 30 seconds.');
    });

    it('should set code property', () => {
      const error = new RateLimitError('API_RATE_LIMIT', 60, 'provider');
      expect(error.code).toBe('API_RATE_LIMIT');
    });

    it('should set retryAfterSeconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 45, 'provider');
      expect(error.retryAfterSeconds).toBe(45);
    });

    it('should set provider via parent class', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'Stripe');
      expect(error.provider).toBe('Stripe');
    });

    it('should set timestamp from parent', () => {
      const before = new Date();
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      const after = new Date();
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should leave rateLimitType undefined when not provided', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error.rateLimitType).toBeUndefined();
    });

    it('should set rateLimitType when provided', () => {
      const types: Array<'global' | 'endpoint' | 'user'> = ['global', 'endpoint', 'user'];
      for (const rateLimitType of types) {
        const error = new RateLimitError('RATE_LIMITED', 10, 'provider', { rateLimitType });
        expect(error.rateLimitType).toBe(rateLimitType);
      }
    });

    it('should set requestId when provided in options', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider', {
        requestId: 'req-456',
      });
      expect(error.requestId).toBe('req-456');
    });

    it('should leave requestId undefined when not in options', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error.requestId).toBeUndefined();
    });

    it('should accept all options at once', () => {
      const error = new RateLimitError('GLOBAL_LIMIT', 120, 'AWS', {
        rateLimitType: 'global',
        requestId: 'req-789',
      });
      expect(error.code).toBe('GLOBAL_LIMIT');
      expect(error.retryAfterSeconds).toBe(120);
      expect(error.provider).toBe('AWS');
      expect(error.rateLimitType).toBe('global');
      expect(error.requestId).toBe('req-789');
    });
  });

  describe('instanceof chain', () => {
    it('should be an instance of Error', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be an instance of AdapterError', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error).toBeInstanceOf(AdapterError);
    });

    it('should be an instance of RateLimitError', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should have a stack trace', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('getRetryDelayMs', () => {
    it('should convert seconds to milliseconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 30, 'provider');
      expect(error.getRetryDelayMs()).toBe(30000);
    });

    it('should handle 1 second', () => {
      const error = new RateLimitError('RATE_LIMITED', 1, 'provider');
      expect(error.getRetryDelayMs()).toBe(1000);
    });

    it('should handle 0 seconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 0, 'provider');
      expect(error.getRetryDelayMs()).toBe(0);
    });

    it('should handle large values', () => {
      const error = new RateLimitError('RATE_LIMITED', 3600, 'provider');
      expect(error.getRetryDelayMs()).toBe(3600000);
    });

    it('should handle fractional seconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 1.5, 'provider');
      expect(error.getRetryDelayMs()).toBe(1500);
    });
  });

  describe('toJSON', () => {
    it('should include base AdapterError fields', () => {
      const error = new RateLimitError('RATE_LIMITED', 30, 'OpenAI', {
        requestId: 'req-123',
      });
      const json = error.toJSON();

      expect(json.code).toBe('RATE_LIMITED');
      expect(json.message).toBe('Rate limited by OpenAI. Retry after 30 seconds.');
      expect(json.provider).toBe('OpenAI');
      expect(json.requestId).toBe('req-123');
      expect(typeof json.timestamp).toBe('string');
    });

    it('should include retryAfterSeconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 60, 'provider');
      const json = error.toJSON();
      expect(json.retryAfterSeconds).toBe(60);
    });

    it('should include rateLimitType when provided', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider', {
        rateLimitType: 'endpoint',
      });
      const json = error.toJSON();
      expect(json.rateLimitType).toBe('endpoint');
    });

    it('should include undefined rateLimitType when not provided', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      const json = error.toJSON();
      expect(json.rateLimitType).toBeUndefined();
    });

    it('should serialize timestamp as ISO string', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, 'provider');
      const json = error.toJSON();
      const isoString = json.timestamp as string;
      expect(new Date(isoString).toISOString()).toBe(isoString);
    });

    it('should include all properties in serialization', () => {
      const error = new RateLimitError('USER_LIMIT', 45, 'Stripe', {
        rateLimitType: 'user',
        requestId: 'req-xyz',
      });
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'USER_LIMIT',
        message: 'Rate limited by Stripe. Retry after 45 seconds.',
        provider: 'Stripe',
        requestId: 'req-xyz',
        timestamp: expect.any(String),
        retryAfterSeconds: 45,
        rateLimitType: 'user',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle message with zero seconds', () => {
      const error = new RateLimitError('RATE_LIMITED', 0, 'API');
      expect(error.message).toBe('Rate limited by API. Retry after 0 seconds.');
    });

    it('should handle empty provider name', () => {
      const error = new RateLimitError('RATE_LIMITED', 10, '');
      expect(error.message).toBe('Rate limited by . Retry after 10 seconds.');
      expect(error.provider).toBe('');
    });
  });
});
