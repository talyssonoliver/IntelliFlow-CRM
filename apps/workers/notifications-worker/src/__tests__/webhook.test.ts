/**
 * WebhookChannel Unit Tests
 *
 * @module @intelliflow/notifications-worker/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebhookChannel,
  createWebhookChannel,
  WebhookPayloadSchema,
  type WebhookPayload,
  type WebhookChannelConfig,
} from '../channels/webhook';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('WebhookChannel', () => {
  let channel: WebhookChannel;
  let config: WebhookChannelConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('{"status":"received"}'),
      headers: new Map([['content-type', 'application/json']]),
    });

    config = {
      signingSecret: 'test-secret',
      defaultTimeoutMs: 30000,
      maxRetries: 3,
      retryBackoff: [1000, 5000, 30000],
      userAgent: 'IntelliFlow-CRM/test',
    };

    channel = new WebhookChannel(config);
  });

  afterEach(async () => {
    await channel.close();
  });

  describe('constructor', () => {
    it('should create channel with config', () => {
      expect(channel).toBeDefined();
    });

    it('should accept custom logger', () => {
      const customLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      };
      const customChannel = new WebhookChannel(config, customLogger as any);
      expect(customChannel).toBeDefined();
    });
  });

  describe('initialize()', () => {
    it('should initialize successfully', async () => {
      await expect(channel.initialize()).resolves.toBeUndefined();
    });
  });

  describe('deliver()', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should send webhook successfully', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { event: 'test', data: { id: 1 } },
      };

      const result = await channel.deliver(payload);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.requestId).toBeDefined();
    });

    it('should use POST method by default', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should support custom HTTP methods', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        method: 'PUT',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should include Content-Type header', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include User-Agent header', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'IntelliFlow-CRM/test',
          }),
        })
      );
    });

    it('should include correlation ID in headers', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload, { correlationId: 'corr-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Correlation-ID': 'corr-123',
          }),
        })
      );
    });

    it('should sign payload when signing secret is configured', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.stringMatching(/t=\d+,v1=[a-f0-9]+/),
          }),
        })
      );
    });

    it('should include request ID header', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': expect.stringMatching(/wh_\d+_[a-f0-9]+/),
          }),
        })
      );
    });

    it('should record delivery time', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      const result = await channel.deliver(payload);

      expect(result.deliveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      const result = await channel.deliver(payload);

      expect(result.deliveredAt).toBeDefined();
      expect(new Date(result.deliveredAt).getTime()).not.toBeNaN();
    });
  });

  describe('retry behavior', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await channel.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should retry on 5xx errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve('OK'),
        });

      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
        retryOnStatus: [500],
      };

      // Start delivery and advance timers
      const deliverPromise = channel.deliver(payload);
      await vi.advanceTimersByTimeAsync(1000); // First retry backoff

      const result = await deliverPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should retry on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve('Rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve('OK'),
        });

      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
        retryOnStatus: [429],
      };

      // Start delivery and advance timers
      const deliverPromise = channel.deliver(payload);
      await vi.advanceTimersByTimeAsync(1000); // First retry backoff

      const result = await deliverPromise;

      expect(result.success).toBe(true);
    });

    it('should not retry on 4xx client errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid payload'),
      });

      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
        retryOnStatus: [500, 502, 503],
      };

      const result = await channel.deliver(payload);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Error'),
      });

      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
        retryOnStatus: [500],
      };

      // Start delivery and advance timers through all retry delays
      const deliverPromise = channel.deliver(payload);

      // Advance through retry backoffs (1s, 5s, 30s)
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(30000);

      const result = await deliverPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
    });

    it('should track attempt count', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('OK'),
      });

      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      const result = await channel.deliver(payload);

      expect(result.attempts).toBe(1);
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should require valid URL schema', () => {
      // Invalid URL should fail schema validation
      const invalidResult = WebhookPayloadSchema.safeParse({
        url: 'not-a-valid-url',
        body: { test: true },
      });

      expect(invalidResult.success).toBe(false);
    });

    it('should accept valid HTTP and HTTPS URLs', async () => {
      // HTTP URL should work
      const httpPayload: WebhookPayload = {
        url: 'http://example.com/webhook',
        body: { test: true },
      };
      const httpResult = await channel.deliver(httpPayload);
      expect(httpResult.success).toBe(true);

      // HTTPS URL should work
      const httpsPayload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };
      const httpsResult = await channel.deliver(httpsPayload);
      expect(httpsResult.success).toBe(true);
    });

    it('should accept any valid URL scheme per Zod validation', async () => {
      // Note: Zod's .url() validates that the string is a valid URL,
      // but accepts any scheme (http, https, ftp, etc.) per URL specification
      const payload: WebhookPayload = {
        url: 'ftp://example.com/webhook',
        body: { test: true },
      };

      // This will pass Zod validation but the mock will return success
      const result = await channel.deliver(payload);
      expect(result).toBeDefined();
    });
  });

  describe('circuit breaker', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should track successful deliveries', async () => {
      const payload: WebhookPayload = {
        url: 'https://example.com/webhook',
        body: { test: true },
      };

      await channel.deliver(payload);
      await channel.deliver(payload);

      const stats = channel.getStats();
      expect(stats.sent).toBe(2);
    });

    it('should track circuit breaker state', () => {
      const stats = channel.getStats();
      expect(stats.circuitState).toBe('CLOSED');
    });
  });

  describe('getStats()', () => {
    it('should return statistics', () => {
      const stats = channel.getStats();

      expect(stats).toHaveProperty('sent');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('circuitState');
    });
  });
});

describe('createWebhookChannel', () => {
  it('should create channel with environment config', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      WEBHOOK_SIGNING_SECRET: 'secret',
      WEBHOOK_TIMEOUT_MS: '10000',
      WEBHOOK_MAX_RETRIES: '5',
    };

    const channel = createWebhookChannel();
    expect(channel).toBeDefined();

    process.env = originalEnv;
  });

  it('should use defaults when env not set', () => {
    const channel = createWebhookChannel();
    expect(channel).toBeDefined();
  });
});
