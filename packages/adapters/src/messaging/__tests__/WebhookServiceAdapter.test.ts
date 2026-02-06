/**
 * WebhookServiceAdapter Tests
 *
 * Tests the WebhookServiceAdapter which bridges the hexagonal architecture
 * WebhookServicePort to the concrete WebhookFramework implementation.
 *
 * @see IFC-144: Webhook Infrastructure with Idempotency and Retries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the @intelliflow/webhooks module before importing the adapter
const mockFramework = {
  registerSource: vi.fn(),
  unregisterSource: vi.fn().mockReturnValue(true),
  on: vi.fn(),
  onAll: vi.fn(),
  handle: vi.fn(),
  processRetries: vi.fn(),
  getMetrics: vi.fn(),
  getDeadLetterEntries: vi.fn(),
  reprocessDeadLetter: vi.fn(),
  cleanup: vi.fn(),
  getSources: vi.fn(),
};

vi.mock('@intelliflow/webhooks', () => ({
  createWebhookFramework: vi.fn(() => mockFramework),
  SignatureVerifiers: {
    hmacSha256: vi.fn(),
    stripe: vi.fn(),
    github: vi.fn(),
  },
}));

// Mock the application layer errors
vi.mock('@intelliflow/application', () => ({
  WebhookVerificationError: class WebhookVerificationError extends Error {
    constructor(source: string) {
      super(`Webhook verification failed for source: ${source}`);
      this.name = 'WebhookVerificationError';
    }
  },
  WebhookProcessingError: class WebhookProcessingError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'WebhookProcessingError';
    }
  },
  WebhookSourceNotFoundError: class WebhookSourceNotFoundError extends Error {
    constructor(source: string) {
      super(`Webhook source not found: ${source}`);
      this.name = 'WebhookSourceNotFoundError';
    }
  },
}));

// Mock @intelliflow/domain Result
vi.mock('@intelliflow/domain', () => ({
  Result: {
    ok: (value: any) => ({
      isSuccess: true,
      isFailure: false,
      value,
    }),
    fail: (error: any) => ({
      isSuccess: false,
      isFailure: true,
      error,
    }),
  },
}));

import { createWebhookFramework } from '@intelliflow/webhooks';
import {
  WebhookServiceAdapter,
  createWebhookServiceAdapter,
} from '../WebhookServiceAdapter';

describe('WebhookServiceAdapter', () => {
  let adapter: WebhookServiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WebhookServiceAdapter();
  });

  describe('constructor', () => {
    it('should create an instance with default config', () => {
      expect(adapter).toBeDefined();
    });

    it('should pass config to the webhook framework', () => {
      new WebhookServiceAdapter({
        maxPayloadSize: 5000,
        idempotencyTtlMs: 60000,
        retryEnabled: true,
        maxRetries: 5,
        deadLetterEnabled: true,
        metricsEnabled: true,
        loggingEnabled: false,
      });

      expect(createWebhookFramework).toHaveBeenCalledWith({
        maxPayloadSize: 5000,
        idempotencyTtlMs: 60000,
        retryEnabled: true,
        maxRetries: 5,
        deadLetterEnabled: true,
        metricsEnabled: true,
        loggingEnabled: false,
      });
    });
  });

  describe('registerSource', () => {
    it('should register a source with hmac-sha256 verifier', () => {
      adapter.registerSource({
        name: 'stripe',
        secret: 'whsec_test',
        signatureHeader: 'stripe-signature',
        signatureVerifier: 'hmac-sha256',
        enabled: true,
      });

      expect(mockFramework.registerSource).toHaveBeenCalledTimes(1);
      expect(mockFramework.registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'stripe',
          secret: 'whsec_test',
          signatureHeader: 'stripe-signature',
          enabled: true,
        })
      );
    });

    it('should register a source with stripe verifier', () => {
      adapter.registerSource({
        name: 'stripe-payments',
        secret: 'whsec_stripe',
        signatureHeader: 'stripe-signature',
        signatureVerifier: 'stripe',
      });

      expect(mockFramework.registerSource).toHaveBeenCalledTimes(1);
    });

    it('should register a source with github verifier', () => {
      adapter.registerSource({
        name: 'github-events',
        secret: 'gh_secret',
        signatureHeader: 'x-hub-signature-256',
        signatureVerifier: 'github',
      });

      expect(mockFramework.registerSource).toHaveBeenCalledTimes(1);
    });

    it('should use hmac-sha256 as fallback for custom verifier', () => {
      adapter.registerSource({
        name: 'custom-source',
        secret: 'custom_secret',
        signatureHeader: 'x-custom-sig',
        signatureVerifier: 'custom',
      });

      expect(mockFramework.registerSource).toHaveBeenCalledTimes(1);
    });

    it('should throw for unknown verifier type', () => {
      expect(() => {
        adapter.registerSource({
          name: 'bad-source',
          secret: 'secret',
          signatureHeader: 'x-sig',
          signatureVerifier: 'unknown' as any,
        });
      }).toThrow('Unknown signature verifier: unknown');
    });

    it('should default enabled to true when not provided', () => {
      adapter.registerSource({
        name: 'auto-enabled',
        secret: 's3cret',
        signatureHeader: 'x-sig',
        signatureVerifier: 'hmac-sha256',
      });

      expect(mockFramework.registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      );
    });

    it('should pass allowedEvents and metadata', () => {
      adapter.registerSource({
        name: 'filtered-source',
        secret: 'secret',
        signatureHeader: 'x-sig',
        signatureVerifier: 'hmac-sha256',
        allowedEvents: ['payment.success', 'payment.failure'],
        metadata: { category: 'payments' },
      });

      expect(mockFramework.registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedEvents: ['payment.success', 'payment.failure'],
          metadata: { category: 'payments' },
        })
      );
    });
  });

  describe('unregisterSource', () => {
    it('should delegate to framework and return result', () => {
      const result = adapter.unregisterSource('old-source');
      expect(mockFramework.unregisterSource).toHaveBeenCalledWith('old-source');
      expect(result).toBe(true);
    });

    it('should return false when source does not exist', () => {
      mockFramework.unregisterSource.mockReturnValueOnce(false);
      const result = adapter.unregisterSource('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('onEvent', () => {
    it('should register an event handler with the framework', () => {
      const handler = vi.fn();
      adapter.onEvent('payment.success', handler);

      expect(mockFramework.on).toHaveBeenCalledWith('payment.success', handler);
    });
  });

  describe('onAllEvents', () => {
    it('should register a global event handler', () => {
      const handler = vi.fn();
      adapter.onAllEvents(handler);

      expect(mockFramework.onAll).toHaveBeenCalledWith(handler);
    });
  });

  describe('handleWebhook', () => {
    it('should return success result for valid webhook', async () => {
      mockFramework.handle.mockResolvedValue({
        success: true,
        statusCode: 200,
        message: 'OK',
        eventId: 'evt-123',
      });

      const result = await adapter.handleWebhook(
        'stripe',
        '{"type":"payment.success"}',
        { 'stripe-signature': 'sig123' },
        '192.168.1.1'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockFramework.handle).toHaveBeenCalledWith(
        'stripe',
        '{"type":"payment.success"}',
        { 'stripe-signature': 'sig123' },
        '192.168.1.1'
      );
    });

    it('should return WebhookSourceNotFoundError for 404', async () => {
      mockFramework.handle.mockResolvedValue({
        success: false,
        statusCode: 404,
        message: 'Source not found',
      });

      const result = await adapter.handleWebhook(
        'unknown-source',
        '{}',
        {}
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('WebhookSourceNotFoundError');
    });

    it('should return WebhookVerificationError for 401', async () => {
      mockFramework.handle.mockResolvedValue({
        success: false,
        statusCode: 401,
        message: 'Signature mismatch',
      });

      const result = await adapter.handleWebhook(
        'stripe',
        '{}',
        { 'stripe-signature': 'invalid' }
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('WebhookVerificationError');
    });

    it('should return WebhookProcessingError for other failures', async () => {
      mockFramework.handle.mockResolvedValue({
        success: false,
        statusCode: 500,
        message: 'Internal processing error',
      });

      const result = await adapter.handleWebhook(
        'stripe',
        '{"bad": "data"}',
        {}
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('WebhookProcessingError');
    });

    it('should return WebhookProcessingError with "Unknown error" when no message', async () => {
      mockFramework.handle.mockResolvedValue({
        success: false,
        statusCode: 500,
      });

      const result = await adapter.handleWebhook('stripe', '{}', {});

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('should catch exceptions and return WebhookProcessingError', async () => {
      mockFramework.handle.mockRejectedValue(new Error('Network timeout'));

      const result = await adapter.handleWebhook('stripe', '{}', {});

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Network timeout');
    });

    it('should handle non-Error exceptions', async () => {
      mockFramework.handle.mockRejectedValue('string error');

      const result = await adapter.handleWebhook('stripe', '{}', {});

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('should work without IP address parameter', async () => {
      mockFramework.handle.mockResolvedValue({
        success: true,
        statusCode: 200,
      });

      const result = await adapter.handleWebhook('stripe', '{}', {});

      expect(result.isSuccess).toBe(true);
      expect(mockFramework.handle).toHaveBeenCalledWith(
        'stripe',
        '{}',
        {},
        undefined
      );
    });
  });

  describe('processRetries', () => {
    it('should delegate to framework and return retry stats', async () => {
      mockFramework.processRetries.mockResolvedValue({
        processed: 5,
        succeeded: 3,
        failed: 2,
      });

      const stats = await adapter.processRetries();

      expect(stats.processed).toBe(5);
      expect(stats.succeeded).toBe(3);
      expect(stats.failed).toBe(2);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from the framework', () => {
      const expectedMetrics = {
        totalReceived: 100,
        totalProcessed: 95,
        totalFailed: 5,
        totalRetried: 10,
      };
      mockFramework.getMetrics.mockReturnValue(expectedMetrics);

      const metrics = adapter.getMetrics();
      expect(metrics).toEqual(expectedMetrics);
    });
  });

  describe('getDeadLetterEntries', () => {
    it('should return dead letter entries from the framework', () => {
      const entries = [
        { eventId: 'evt-1', source: 'stripe', error: 'timeout' },
        { eventId: 'evt-2', source: 'github', error: 'parse error' },
      ];
      mockFramework.getDeadLetterEntries.mockReturnValue(entries);

      const result = adapter.getDeadLetterEntries();
      expect(result).toEqual(entries);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no dead letters', () => {
      mockFramework.getDeadLetterEntries.mockReturnValue([]);
      expect(adapter.getDeadLetterEntries()).toEqual([]);
    });
  });

  describe('reprocessDeadLetter', () => {
    it('should delegate to framework and return success', async () => {
      mockFramework.reprocessDeadLetter.mockResolvedValue(true);

      const result = await adapter.reprocessDeadLetter('evt-1');
      expect(result).toBe(true);
      expect(mockFramework.reprocessDeadLetter).toHaveBeenCalledWith('evt-1');
    });

    it('should return false when reprocessing fails', async () => {
      mockFramework.reprocessDeadLetter.mockResolvedValue(false);

      const result = await adapter.reprocessDeadLetter('evt-missing');
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should delegate to framework and return cleanup stats', () => {
      mockFramework.cleanup.mockReturnValue({ idempotencyRemoved: 42 });

      const result = adapter.cleanup();
      expect(result).toEqual({ idempotencyRemoved: 42 });
    });
  });

  describe('getSources', () => {
    it('should return registered source names', () => {
      mockFramework.getSources.mockReturnValue(['stripe', 'github', 'custom']);

      const sources = adapter.getSources();
      expect(sources).toEqual(['stripe', 'github', 'custom']);
    });

    it('should return empty array when no sources registered', () => {
      mockFramework.getSources.mockReturnValue([]);
      expect(adapter.getSources()).toEqual([]);
    });
  });

  describe('createWebhookServiceAdapter (factory)', () => {
    it('should create an instance with default config', () => {
      const instance = createWebhookServiceAdapter();
      expect(instance).toBeInstanceOf(WebhookServiceAdapter);
    });

    it('should create an instance with custom config', () => {
      const instance = createWebhookServiceAdapter({
        maxRetries: 10,
        deadLetterEnabled: true,
      });
      expect(instance).toBeInstanceOf(WebhookServiceAdapter);
    });
  });
});
