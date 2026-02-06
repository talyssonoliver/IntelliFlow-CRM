/**
 * AdapterError Tests
 *
 * Tests for the base AdapterError abstract class and
 * UnexpectedAdapterError concrete implementation.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect } from 'vitest';
import { AdapterError, UnexpectedAdapterError } from '../AdapterError';

describe('UnexpectedAdapterError', () => {
  it('should create error with formatted message', () => {
    const error = new UnexpectedAdapterError('connection timeout', 'Salesforce');
    expect(error.message).toBe('Unexpected Salesforce error: connection timeout');
  });

  it('should set code to ADAPTER_UNEXPECTED_ERROR', () => {
    const error = new UnexpectedAdapterError('error', 'provider');
    expect(error.code).toBe('ADAPTER_UNEXPECTED_ERROR');
  });

  it('should set provider', () => {
    const error = new UnexpectedAdapterError('error', 'HubSpot');
    expect(error.provider).toBe('HubSpot');
  });

  it('should set timestamp to a recent Date', () => {
    const before = new Date();
    const error = new UnexpectedAdapterError('error', 'provider');
    const after = new Date();
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should set requestId when provided', () => {
    const error = new UnexpectedAdapterError('error', 'provider', 'req-123');
    expect(error.requestId).toBe('req-123');
  });

  it('should leave requestId undefined when not provided', () => {
    const error = new UnexpectedAdapterError('error', 'provider');
    expect(error.requestId).toBeUndefined();
  });

  it('should be an instance of Error', () => {
    const error = new UnexpectedAdapterError('error', 'provider');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of AdapterError', () => {
    const error = new UnexpectedAdapterError('error', 'provider');
    expect(error).toBeInstanceOf(AdapterError);
  });

  it('should have a stack trace', () => {
    const error = new UnexpectedAdapterError('error', 'provider');
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });

  describe('toJSON', () => {
    it('should serialize all fields correctly', () => {
      const error = new UnexpectedAdapterError('timeout', 'Stripe', 'req-abc');
      const json = error.toJSON();

      expect(json.code).toBe('ADAPTER_UNEXPECTED_ERROR');
      expect(json.message).toBe('Unexpected Stripe error: timeout');
      expect(json.provider).toBe('Stripe');
      expect(json.requestId).toBe('req-abc');
      expect(typeof json.timestamp).toBe('string');
    });

    it('should serialize timestamp as ISO string', () => {
      const error = new UnexpectedAdapterError('error', 'provider');
      const json = error.toJSON();
      const isoString = json.timestamp as string;
      expect(new Date(isoString).toISOString()).toBe(isoString);
    });

    it('should include undefined requestId when not provided', () => {
      const error = new UnexpectedAdapterError('error', 'provider');
      const json = error.toJSON();
      expect(json.requestId).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string message', () => {
      const error = new UnexpectedAdapterError('', 'provider');
      expect(error.message).toBe('Unexpected provider error: ');
    });

    it('should handle empty string provider', () => {
      const error = new UnexpectedAdapterError('error', '');
      expect(error.message).toBe('Unexpected  error: error');
      expect(error.provider).toBe('');
    });

    it('should handle special characters in message', () => {
      const error = new UnexpectedAdapterError('Error: "invalid JSON" at <line 1>', 'API');
      expect(error.message).toBe('Unexpected API error: Error: "invalid JSON" at <line 1>');
    });
  });
});
