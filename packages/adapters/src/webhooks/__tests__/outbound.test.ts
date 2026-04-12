/**
 * Outbound Webhook Client Tests
 *
 * Tests for signature generation/verification, the OutboundWebhookClient
 * (send with retries, batch, logging, stats), and factory functions.
 *
 * @task IFC-171 - Implement webhook notification channel
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi, afterEach } from 'vitest';
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  OutboundWebhookClient,
  OutboundWebhookConfigSchema,
  createOutboundWebhookClient,
  getOutboundWebhookClient,
} from '../outbound';

// Mock fetch globally
let mockFetch: ReturnType<typeof vi.fn>;

function createSuccessResponse(status = 200, body = 'OK') {
  return {
    ok: true,
    status,
    statusText: 'OK',
    text: vi.fn().mockResolvedValue(body),
  };
}

function createErrorResponse(status: number, statusText = 'Error', body = 'error') {
  return {
    ok: false,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe('OutboundWebhookConfigSchema', () => {
  it('should accept valid config', () => {
    const result = OutboundWebhookConfigSchema.parse({
      signingSecret: 'my-secret',
      timeoutMs: 5000,
      maxRetries: 3,
      retryBackoffMs: [1000, 2000, 4000],
      userAgent: 'MyApp/1.0',
    });

    expect(result.signingSecret).toBe('my-secret');
    expect(result.timeoutMs).toBe(5000);
    expect(result.maxRetries).toBe(3);
  });

  it('should apply defaults for missing fields', () => {
    const result = OutboundWebhookConfigSchema.parse({});

    expect(result.timeoutMs).toBe(30000);
    expect(result.maxRetries).toBe(3);
    expect(result.retryBackoffMs).toEqual([1000, 5000, 30000]);
    expect(result.userAgent).toBe('IntelliFlow-CRM/1.0');
  });

  it('should reject timeoutMs below 1000', () => {
    expect(() => OutboundWebhookConfigSchema.parse({ timeoutMs: 500 })).toThrow();
  });

  it('should reject timeoutMs above 60000', () => {
    expect(() => OutboundWebhookConfigSchema.parse({ timeoutMs: 100000 })).toThrow();
  });

  it('should reject negative maxRetries', () => {
    expect(() => OutboundWebhookConfigSchema.parse({ maxRetries: -1 })).toThrow();
  });

  it('should reject maxRetries above 10', () => {
    expect(() => OutboundWebhookConfigSchema.parse({ maxRetries: 11 })).toThrow();
  });
});

describe('generateWebhookSignature', () => {
  it('should generate a signature in t=...,v1=... format', () => {
    const signature = generateWebhookSignature('{"test":true}', 'secret', 1700000000);
    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
  });

  it('should include the provided timestamp', () => {
    const signature = generateWebhookSignature('payload', 'secret', 1700000000);
    expect(signature.startsWith('t=1700000000,')).toBe(true);
  });

  it('should produce consistent signatures for same inputs', () => {
    const sig1 = generateWebhookSignature('payload', 'secret', 1700000000);
    const sig2 = generateWebhookSignature('payload', 'secret', 1700000000);
    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different payloads', () => {
    const sig1 = generateWebhookSignature('payload1', 'secret', 1700000000);
    const sig2 = generateWebhookSignature('payload2', 'secret', 1700000000);
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different secrets', () => {
    const sig1 = generateWebhookSignature('payload', 'secret1', 1700000000);
    const sig2 = generateWebhookSignature('payload', 'secret2', 1700000000);
    expect(sig1).not.toBe(sig2);
  });

  it('should use current time when no timestamp provided', () => {
    const beforeTs = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature('payload', 'secret');
    const match = signature.match(/^t=(\d+),/);
    const ts = parseInt(match![1], 10);
    const afterTs = Math.floor(Date.now() / 1000);

    expect(ts).toBeGreaterThanOrEqual(beforeTs);
    expect(ts).toBeLessThanOrEqual(afterTs);
  });
});

describe('verifyWebhookSignature', () => {
  it('should verify a valid signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature('payload', 'secret', ts);
    const result = verifyWebhookSignature('payload', signature, 'secret');
    expect(result).toBe(true);
  });

  it('should reject a signature with wrong secret', () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature('payload', 'secret', ts);
    const result = verifyWebhookSignature('payload', signature, 'wrong-secret');
    expect(result).toBe(false);
  });

  it('should reject a signature with wrong payload', () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature('payload', 'secret', ts);
    const result = verifyWebhookSignature('different-payload', signature, 'secret');
    expect(result).toBe(false);
  });

  it('should reject expired signatures beyond tolerance', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const signature = generateWebhookSignature('payload', 'secret', oldTs);
    const result = verifyWebhookSignature('payload', signature, 'secret', 300); // 5 min tolerance
    expect(result).toBe(false);
  });

  it('should accept signatures within tolerance', () => {
    const recentTs = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const signature = generateWebhookSignature('payload', 'secret', recentTs);
    const result = verifyWebhookSignature('payload', signature, 'secret', 300);
    expect(result).toBe(true);
  });

  it('should reject malformed signature strings', () => {
    expect(verifyWebhookSignature('payload', 'not-a-signature', 'secret')).toBe(false);
    expect(verifyWebhookSignature('payload', '', 'secret')).toBe(false);
    expect(verifyWebhookSignature('payload', 't=abc,v1=def', 'secret')).toBe(false);
  });

  it('should use default tolerance of 300 seconds', () => {
    const ts = Math.floor(Date.now() / 1000) - 200; // 200 seconds ago
    const signature = generateWebhookSignature('payload', 'secret', ts);
    const result = verifyWebhookSignature('payload', signature, 'secret');
    expect(result).toBe(true);
  });
});

describe('OutboundWebhookClient', () => {
  let client: OutboundWebhookClient;
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    mockFetch.mockReset();
    client = new OutboundWebhookClient({
      maxRetries: 0, // Disable retries by default for fast tests
      timeoutMs: 5000,
    });
  });

  describe('send', () => {
    it('should send a successful webhook', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(200, '{"ok":true}'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: { event: 'test' },
      });

      expect(response.success).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.attempts).toBe(1);
      expect(response.requestId).toMatch(/^wh_/);
      expect(response.timestamp).toBeDefined();
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should send with POST method by default', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: { test: true },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should support PUT method', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        method: 'PUT',
        payload: { test: true },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should support PATCH method', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        method: 'PATCH',
        payload: { test: true },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should include standard headers', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['User-Agent']).toBe('IntelliFlow-CRM/1.0');
      expect(options.headers['X-Request-ID']).toMatch(/^wh_/);
      expect(options.headers['X-Timestamp']).toBeDefined();
    });

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
        headers: { 'X-Custom': 'value' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Custom']).toBe('value');
    });

    it('should include idempotency key header when provided', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
        idempotencyKey: 'idemp-123',
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Idempotency-Key']).toBe('idemp-123');
    });

    it('should not include idempotency key header when not provided', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Idempotency-Key']).toBeUndefined();
    });

    it('should add signature header when signingSecret is configured', async () => {
      const signedClient = new OutboundWebhookClient({
        signingSecret: 'my-secret',
        maxRetries: 0,
      });
      mockFetch.mockResolvedValue(createSuccessResponse());

      await signedClient.send({
        url: 'https://example.com/webhook',
        payload: { event: 'test' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Webhook-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
    });

    it('should not add signature header when no signingSecret', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Webhook-Signature']).toBeUndefined();
    });

    it('should return failure for non-retryable HTTP errors', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(400, 'Bad Request'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(400);
      expect(response.error).toContain('400');
      expect(response.attempts).toBe(1);
    });

    it('should truncate response body to 1000 chars', async () => {
      const longBody = 'x'.repeat(2000);
      mockFetch.mockResolvedValue(createSuccessResponse(200, longBody));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.responseBody!.length).toBe(1000);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('ECONNREFUSED');
    });

    it('should handle AbortError (timeout)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(408);
    });

    it('should serialize payload as JSON body', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: { key: 'value', nested: { a: 1 } },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ key: 'value', nested: { a: 1 } }));
    });

    it('should include signal for abort controller', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeDefined();
    });
  });

  describe('send with retries', () => {
    beforeEach(() => {
      client = new OutboundWebhookClient({
        maxRetries: 2,
        retryBackoffMs: [1, 1], // Minimal backoff for tests
        timeoutMs: 5000,
      });
    });

    it('should retry on 500 errors', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(500, 'Internal Server Error'))
        .mockResolvedValueOnce(createSuccessResponse());

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(true);
      expect(response.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 (rate limit) errors', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(createSuccessResponse());

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(true);
      expect(response.attempts).toBe(2);
    });

    it('should retry on 502, 503, 504 errors', async () => {
      for (const status of [502, 503, 504]) {
        vi.clearAllMocks();
        client = new OutboundWebhookClient({
          maxRetries: 2,
          retryBackoffMs: [1, 1],
          timeoutMs: 5000,
        });
        mockFetch
          .mockResolvedValueOnce(createErrorResponse(status, `Error ${status}`))
          .mockResolvedValueOnce(createSuccessResponse());

        const response = await client.send({
          url: 'https://example.com/webhook',
          payload: {},
        });

        expect(response.success).toBe(true);
      }
    });

    it('should not retry on 400 errors', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(400, 'Bad Request'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(response.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 errors', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(404, 'Not Found'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createSuccessResponse());

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(true);
      expect(response.attempts).toBe(2);
    });

    it('should fail after exhausting all retries', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(500, 'Server Error'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      // 1 initial + 2 retries = 3 attempts
      expect(response.attempts).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting retries on network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      const response = await client.send({
        url: 'https://example.com/webhook',
        payload: {},
      });

      expect(response.success).toBe(false);
      expect(response.attempts).toBe(3);
      expect(response.error).toContain('Persistent failure');
    });
  });

  describe('sendBatch', () => {
    beforeEach(() => {
      client = new OutboundWebhookClient({ maxRetries: 0 });
    });

    it('should send multiple webhooks concurrently', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      const requests = [
        { url: 'https://a.com/webhook', payload: { a: 1 } },
        { url: 'https://b.com/webhook', payload: { b: 2 } },
        { url: 'https://c.com/webhook', payload: { c: 3 } },
      ];

      const responses = await client.sendBatch(requests);

      expect(responses).toHaveLength(3);
      expect(responses.every((r) => r.success)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return individual results for mixed success/failure', async () => {
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse())
        .mockResolvedValueOnce(createErrorResponse(400, 'Bad Request'))
        .mockResolvedValueOnce(createSuccessResponse());

      const requests = [
        { url: 'https://a.com/webhook', payload: {} },
        { url: 'https://b.com/webhook', payload: {} },
        { url: 'https://c.com/webhook', payload: {} },
      ];

      const responses = await client.sendBatch(requests);

      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(false);
      expect(responses[2].success).toBe(true);
    });

    it('should handle empty batch', async () => {
      const responses = await client.sendBatch([]);
      expect(responses).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getDeliveryLogs', () => {
    beforeEach(() => {
      client = new OutboundWebhookClient({ maxRetries: 0 });
    });

    it('should return empty array initially', () => {
      const logs = client.getDeliveryLogs();
      expect(logs).toEqual([]);
    });

    it('should record delivery logs after sending', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({ url: 'https://example.com/webhook', payload: {} });

      const logs = client.getDeliveryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(true);
      expect(logs[0].url).toBe('https://example.com/webhook');
      expect(logs[0].method).toBe('POST');
    });

    it('should respect the limit parameter', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      for (let i = 0; i < 5; i++) {
        await client.send({ url: `https://example.com/webhook/${i}`, payload: {} });
      }

      const logs = client.getDeliveryLogs(3);
      expect(logs).toHaveLength(3);
    });

    it('should return most recent logs when limited', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      for (let i = 0; i < 5; i++) {
        await client.send({ url: `https://example.com/webhook/${i}`, payload: {} });
      }

      const logs = client.getDeliveryLogs(2);
      expect(logs[0].url).toBe('https://example.com/webhook/3');
      expect(logs[1].url).toBe('https://example.com/webhook/4');
    });

    it('should log failed deliveries', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(500, 'Server Error'));

      await client.send({ url: 'https://example.com/webhook', payload: {} });

      const logs = client.getDeliveryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toContain('500');
    });

    it('should include payload and response sizes', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(200, 'response body'));

      await client.send({ url: 'https://example.com/webhook', payload: { key: 'value' } });

      const logs = client.getDeliveryLogs();
      expect(logs[0].payloadSize).toBeGreaterThan(0);
      expect(logs[0].responseSize).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      client = new OutboundWebhookClient({ maxRetries: 0 });
    });

    it('should return zero stats initially', () => {
      const stats = client.getStats();
      expect(stats).toEqual({
        totalSent: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageDurationMs: 0,
      });
    });

    it('should track success stats', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({ url: 'https://example.com/webhook', payload: {} });
      await client.send({ url: 'https://example.com/webhook', payload: {} });

      const stats = client.getStats();
      expect(stats.totalSent).toBe(2);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);
      expect(stats.successRate).toBe(100);
    });

    it('should track failure stats', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(400, 'Bad Request'));

      await client.send({ url: 'https://example.com/webhook', payload: {} });

      const stats = client.getStats();
      expect(stats.totalSent).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBe(0);
    });

    it('should calculate correct mixed success rate', async () => {
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse())
        .mockResolvedValueOnce(createErrorResponse(400, 'Bad Request'))
        .mockResolvedValueOnce(createSuccessResponse())
        .mockResolvedValueOnce(createSuccessResponse());

      for (let i = 0; i < 4; i++) {
        await client.send({ url: 'https://example.com/webhook', payload: {} });
      }

      const stats = client.getStats();
      expect(stats.totalSent).toBe(4);
      expect(stats.successCount).toBe(3);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBe(75);
    });

    it('should calculate average duration', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await client.send({ url: 'https://example.com/webhook', payload: {} });

      const stats = client.getStats();
      expect(stats.averageDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createOutboundWebhookClient (factory)', () => {
    it('should create a client with environment defaults', () => {
      const envClient = createOutboundWebhookClient();
      expect(envClient).toBeInstanceOf(OutboundWebhookClient);
    });

    it('should override env config with explicit config', () => {
      const envClient = createOutboundWebhookClient({
        signingSecret: 'explicit-secret',
        maxRetries: 1,
      });
      expect(envClient).toBeInstanceOf(OutboundWebhookClient);
    });
  });

  describe('getOutboundWebhookClient (singleton)', () => {
    it('should return an OutboundWebhookClient instance', () => {
      const singletonClient = getOutboundWebhookClient();
      expect(singletonClient).toBeInstanceOf(OutboundWebhookClient);
    });

    it('should return the same instance on subsequent calls', () => {
      const first = getOutboundWebhookClient();
      const second = getOutboundWebhookClient();
      expect(first).toBe(second);
    });
  });
});
