/**
 * Webhook Framework - Supplementary Tests
 *
 * Covers uncovered branches from framework.ts:
 * - Disabled source handling
 * - Missing signature rejection
 * - Allowed events filtering
 * - Invalid JSON body
 * - Custom event transformers
 * - Middleware execution chain
 * - Retry queue with exponential backoff (the previously-skipped tests)
 * - Dead letter queue flow
 * - Idempotency TTL cleanup
 * - No handlers registered path
 * - Off handler for non-existent type
 * - Express handler factory
 * - Default event transformer edge cases
 * - Stripe verifier edge cases
 * - Metrics tracking for failed events
 * - reprocessDeadLetter with missing entry
 * - SendGrid transformer edge cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  WebhookFramework,
  createWebhookFramework,
  SignatureVerifiers,
  EventTransformers,
  hmacSha256Verify,
  stripeVerify,
  githubVerify,
  defaultEventTransformer,
  stripeEventTransformer,
  sendgridEventTransformer,
  type WebhookEvent,
  type WebhookContext,
  type Middleware,
} from '../src/framework';

// ============================================================================
// Helpers
// ============================================================================

function makeFramework(overrides?: Record<string, unknown>): WebhookFramework {
  return new WebhookFramework({
    maxPayloadSize: 1024 * 1024,
    idempotencyTtlMs: 500,
    retryEnabled: true,
    maxRetries: 3,
    deadLetterEnabled: true,
    metricsEnabled: true,
    loggingEnabled: false,
    ...overrides,
  } as any);
}

function registerOpenSource(fw: WebhookFramework, name = 'test') {
  fw.registerSource({
    name,
    secret: '',
    signatureHeader: 'x-sig',
    signatureVerifier: () => true,
  });
}

function jsonPayload(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

// ============================================================================
// Source Management - additional
// ============================================================================

describe('Webhook Framework - Supplementary', () => {
  let framework: WebhookFramework;

  beforeEach(() => {
    framework = makeFramework();
  });

  describe('Disabled Source', () => {
    it('should reject requests to a disabled source with 503', async () => {
      framework.registerSource({
        name: 'disabled-source',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: () => true,
        enabled: false,
      });

      const result = await framework.handle(
        'disabled-source',
        jsonPayload({ id: 'e1', type: 'test' }),
        {}
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.message).toContain('disabled');
    });
  });

  describe('Missing Signature', () => {
    it('should reject when secret is set but signature header is missing', async () => {
      framework.registerSource({
        name: 'secured',
        secret: 'my-secret',
        signatureHeader: 'x-webhook-signature',
        signatureVerifier: () => true,
      });

      const result = await framework.handle(
        'secured',
        jsonPayload({ id: 'e1', type: 'test' }),
        {} // No signature header
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Missing signature');
    });
  });

  describe('Allowed Events Filtering', () => {
    it('should ignore event types not in allowedEvents list', async () => {
      framework.registerSource({
        name: 'filtered',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: () => true,
        allowedEvents: ['user.created', 'user.deleted'],
      });

      const handler = vi.fn();
      framework.on('user.updated', handler);

      const result = await framework.handle(
        'filtered',
        jsonPayload({ id: 'e1', type: 'user.updated', data: {} }),
        {}
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain('ignored');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should process event types in allowedEvents list', async () => {
      framework.registerSource({
        name: 'filtered',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: () => true,
        allowedEvents: ['user.created'],
      });

      const handler = vi.fn();
      framework.on('user.created', handler);

      const result = await framework.handle(
        'filtered',
        jsonPayload({ id: 'e1', type: 'user.created', data: {} }),
        {}
      );

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Invalid JSON Body', () => {
    it('should return 400 on malformed JSON', async () => {
      registerOpenSource(framework);

      const result = await framework.handle('test', 'not-json{', {});

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.message).toContain('Parse error');
    });
  });

  describe('Custom Event Transformer', () => {
    it('should use source-specific event transformer', async () => {
      framework.registerSource({
        name: 'custom',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: () => true,
        eventTransformer: (raw: unknown) => {
          const data = raw as Record<string, unknown>;
          return {
            id: `custom-${data.ref}`,
            type: `custom.${data.action}`,
            source: 'custom',
            timestamp: new Date(),
            version: '2.0',
            payload: data,
          };
        },
      });

      const handler = vi.fn();
      framework.on('custom.push', handler);

      const result = await framework.handle(
        'custom',
        jsonPayload({ ref: '123', action: 'push' }),
        {}
      );

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as WebhookEvent;
      expect(event.id).toBe('custom-123');
      expect(event.type).toBe('custom.push');
    });
  });

  describe('Middleware Execution', () => {
    it('should execute middleware in correct order (FIFO)', async () => {
      registerOpenSource(framework);
      const order: string[] = [];

      const mw1: Middleware = async (event, ctx, next) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      };

      const mw2: Middleware = async (event, ctx, next) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      };

      framework.use(mw1);
      framework.use(mw2);

      framework.on('order.test', async () => {
        order.push('handler');
      });

      await framework.handle(
        'test',
        jsonPayload({ id: 'mw-1', type: 'order.test', data: {} }),
        {}
      );

      expect(order).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
    });

    it('should allow middleware to short-circuit by not calling next', async () => {
      registerOpenSource(framework);

      const shortCircuit: Middleware = async (_event, _ctx, _next) => {
        // Do not call next
      };

      framework.use(shortCircuit);

      const handler = vi.fn();
      framework.on('blocked.event', handler);

      const result = await framework.handle(
        'test',
        jsonPayload({ id: 'blocked-1', type: 'blocked.event', data: {} }),
        {}
      );

      // Handler should not be called because middleware didn't call next
      expect(handler).not.toHaveBeenCalled();
      // But the overall result should still be success
      expect(result.success).toBe(true);
    });

    it('should propagate middleware errors as handler failures', async () => {
      registerOpenSource(framework);

      const errorMw: Middleware = async (_event, _ctx, _next) => {
        throw new Error('Middleware explosion');
      };

      framework.use(errorMw);
      framework.on('error.event', async () => {});

      const result = await framework.handle(
        'test',
        jsonPayload({ id: 'err-1', type: 'error.event', data: {} }),
        {}
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.message).toContain('Middleware explosion');
    });
  });

  describe('No Handlers Registered', () => {
    it('should return success with no-handlers message when no handlers match', async () => {
      registerOpenSource(framework);

      // Spy on console.warn since loggingEnabled defaults vary
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await framework.handle(
        'test',
        jsonPayload({ id: 'orphan-1', type: 'orphan.event', data: {} }),
        {}
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain('No handlers');

      warnSpy.mockRestore();
    });
  });

  describe('Wildcard Handler (*)', () => {
    it('should trigger wildcard handler for any event type', async () => {
      registerOpenSource(framework);

      const wildcard = vi.fn();
      framework.on('*', wildcard);

      await framework.handle(
        'test',
        jsonPayload({ id: 'w1', type: 'anything.here', data: {} }),
        {}
      );

      expect(wildcard).toHaveBeenCalled();
    });
  });

  describe('Off Handler', () => {
    it('should return false when removing handler from non-existent event type', () => {
      const handler = vi.fn();
      const removed = framework.off('nonexistent.type', handler);
      expect(removed).toBe(false);
    });

    it('should return false when handler is not in the list', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      framework.on('test.event', h1);

      const removed = framework.off('test.event', h2);
      expect(removed).toBe(false);
    });
  });

  describe('Header Normalization', () => {
    it('should normalize headers to lowercase for signature lookup', async () => {
      const crypto = require('crypto');
      const secret = 'normalize-test';
      const payload = jsonPayload({ id: 'h1', type: 'test.event', data: {} });
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      framework.registerSource({
        name: 'case-test',
        secret,
        signatureHeader: 'X-Custom-Signature',
        signatureVerifier: SignatureVerifiers.hmacSha256,
      });

      framework.on('test.event', async () => {});

      const result = await framework.handle('case-test', payload, {
        'X-Custom-Signature': signature,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('Retry Queue - Working Tests', () => {
    it('should add failed events to retry queue and process them', async () => {
      const retryFramework = makeFramework({ maxRetries: 3 });
      registerOpenSource(retryFramework);

      let callCount = 0;
      retryFramework.on('retry.event', async () => {
        callCount++;
        if (callCount <= 1) {
          throw new Error('Temporary failure');
        }
      });

      // First call fails
      const result = await retryFramework.handle(
        'test',
        jsonPayload({ id: 'retry-1', type: 'retry.event', data: {} }),
        {}
      );
      expect(result.success).toBe(false);
      expect(callCount).toBe(1);

      // The retry uses exponential backoff with minimum delay of 2s (1000 * 2^1).
      // We need to manipulate time to test properly.
      // Instead, we'll directly call processRetries after waiting enough.
      // The first retry delay is 1000 * 2^1 = 2000ms. We'll wait for it.
      await new Promise(resolve => setTimeout(resolve, 2100));
      const retryResult = await retryFramework.processRetries();

      expect(retryResult.processed).toBe(1);
      expect(retryResult.succeeded).toBe(1);
      expect(callCount).toBe(2);
    }, 10000);

    it('should send events to DLQ after max retries exhausted', async () => {
      // maxRetries=2 means: attempt 0 (initial) fails, attempt 1 in retry queue
      // After attempt 1 fails and attempts >= maxRetries-1, goes to DLQ
      const dlqFramework = makeFramework({ maxRetries: 2 });
      registerOpenSource(dlqFramework);

      dlqFramework.on('persistent.fail', async () => {
        throw new Error('Always fails');
      });

      // Initial failure - goes into retry queue with attempts=1
      await dlqFramework.handle(
        'test',
        jsonPayload({ id: 'dlq-1', type: 'persistent.fail', data: {} }),
        {}
      );

      // Wait for retry window (1000 * 2^1 = 2000ms)
      await new Promise(resolve => setTimeout(resolve, 2100));
      const retryResult = await dlqFramework.processRetries();

      // After failing with attempts=1 and maxRetries-1=1, should go to DLQ
      expect(retryResult.processed).toBe(1);
      expect(retryResult.failed).toBe(1);

      const dlqEntries = dlqFramework.getDeadLetterEntries();
      expect(dlqEntries.length).toBeGreaterThanOrEqual(1);
      expect(dlqEntries[0].event.id).toBe('dlq-1');
    }, 10000);
  });

  describe('Retry Metrics', () => {
    it('should increment eventsRetried on handler failure', async () => {
      registerOpenSource(framework);

      framework.on('fail.event', async () => {
        throw new Error('Handler error');
      });

      await framework.handle(
        'test',
        jsonPayload({ id: 'fm-1', type: 'fail.event', data: {} }),
        {}
      );

      const metrics = framework.getMetrics();
      expect(metrics.eventsFailed).toBe(1);
      expect(metrics.eventsRetried).toBe(1);
    });
  });

  describe('Retry Disabled', () => {
    it('should not retry when retryEnabled is false', async () => {
      const noRetryFramework = makeFramework({ retryEnabled: false });
      registerOpenSource(noRetryFramework);

      noRetryFramework.on('fail.event', async () => {
        throw new Error('Fail');
      });

      await noRetryFramework.handle(
        'test',
        jsonPayload({ id: 'nr-1', type: 'fail.event', data: {} }),
        {}
      );

      const metrics = noRetryFramework.getMetrics();
      expect(metrics.eventsFailed).toBe(1);
      expect(metrics.eventsRetried).toBe(0);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should return false when reprocessing non-existent DLQ entry', async () => {
      const result = await framework.reprocessDeadLetter('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('Idempotency Cleanup', () => {
    it('should cleanup expired idempotency entries after TTL', async () => {
      const shortTtlFw = makeFramework({ idempotencyTtlMs: 100 });
      registerOpenSource(shortTtlFw);

      shortTtlFw.on('cleanup.event', async () => {});

      await shortTtlFw.handle(
        'test',
        jsonPayload({ id: 'exp-1', type: 'cleanup.event', data: {} }),
        {}
      );

      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 200));

      const cleaned = shortTtlFw.cleanup();
      expect(cleaned.idempotencyRemoved).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Express Handler', () => {
    it('should create an express-compatible handler function', async () => {
      registerOpenSource(framework);
      framework.on('express.event', async () => {});

      const handler = framework.expressHandler();
      expect(typeof handler).toBe('function');

      const req = {
        params: { source: 'test' },
        body: jsonPayload({ id: 'exp-1', type: 'express.event', data: {} }),
        headers: {},
        ip: '127.0.0.1',
      };

      const response = await handler(req);
      expect(response.status).toBe(200);
      expect((response.json as any).success).toBe(true);
      expect((response.json as any).eventId).toBe('exp-1');
    });

    it('should propagate error status from handler', async () => {
      const handler = framework.expressHandler();

      const req = {
        params: { source: 'unknown' },
        body: jsonPayload({ id: 'e1', type: 'test' }),
        headers: {},
      };

      const response = await handler(req);
      expect(response.status).toBe(404);
      expect((response.json as any).success).toBe(false);
    });
  });

  describe('Metrics Disabled', () => {
    it('should not track metrics when metricsEnabled is false', async () => {
      const noMetricsFw = makeFramework({ metricsEnabled: false });
      registerOpenSource(noMetricsFw);
      noMetricsFw.on('test.event', async () => {});

      await noMetricsFw.handle(
        'test',
        jsonPayload({ id: 'm-1', type: 'test.event', data: {} }),
        {}
      );

      const metrics = noMetricsFw.getMetrics();
      expect(metrics.eventsReceived).toBe(0);
      expect(metrics.eventsProcessed).toBe(0);
    });
  });

  // ============================================================================
  // Event Transformer Edge Cases
  // ============================================================================

  describe('defaultEventTransformer - edge cases', () => {
    it('should generate ID from hash when no id field exists', () => {
      const raw = { type: 'test', data: { x: 1 } };
      const event = defaultEventTransformer(raw);

      expect(event.id).toBeTruthy();
      expect(typeof event.id).toBe('string');
    });

    it('should fallback to event_id field', () => {
      const raw = { event_id: 'eid-123', type: 'test' };
      const event = defaultEventTransformer(raw);
      expect(event.id).toBe('eid-123');
    });

    it('should fallback to event_type for type', () => {
      const raw = { id: '1', event_type: 'custom.type' };
      const event = defaultEventTransformer(raw);
      expect(event.type).toBe('custom.type');
    });

    it('should fallback to event field for type', () => {
      const raw = { id: '1', event: 'delivered' };
      const event = defaultEventTransformer(raw);
      expect(event.type).toBe('delivered');
    });

    it('should fallback to unknown when no type field', () => {
      const raw = { id: '1' };
      const event = defaultEventTransformer(raw);
      expect(event.type).toBe('unknown');
    });

    it('should use payload field if data is missing', () => {
      const raw = { id: '1', type: 'test', payload: { key: 'val' } };
      const event = defaultEventTransformer(raw);
      expect(event.payload).toEqual({ key: 'val' });
    });

    it('should fallback to entire raw data as payload', () => {
      const raw = { id: '1', type: 'test' };
      const event = defaultEventTransformer(raw);
      // When data and payload are undefined, it falls back to the raw object
      expect(event.payload).toEqual(raw);
    });

    it('should use version field', () => {
      const raw = { id: '1', type: 'test', version: '3.0' };
      const event = defaultEventTransformer(raw);
      expect(event.version).toBe('3.0');
    });

    it('should fallback to api_version for version', () => {
      const raw = { id: '1', type: 'test', api_version: '2023-01-01' };
      const event = defaultEventTransformer(raw);
      expect(event.version).toBe('2023-01-01');
    });

    it('should use metadata field', () => {
      const raw = { id: '1', type: 'test', metadata: { env: 'prod' } };
      const event = defaultEventTransformer(raw);
      expect(event.metadata).toEqual({ env: 'prod' });
    });
  });

  describe('stripeEventTransformer - edge cases', () => {
    it('should default api_version when missing', () => {
      const raw = { id: 'evt_1', type: 'charge.succeeded', created: 1000000, data: {} };
      const event = stripeEventTransformer(raw);
      expect(event.version).toBe('2023-10-16');
    });
  });

  describe('sendgridEventTransformer - edge cases', () => {
    it('should generate ID from hash when sg_message_id is missing', () => {
      const raw = { event: 'bounce', timestamp: 1000000 };
      const event = sendgridEventTransformer(raw);
      expect(event.id).toBeTruthy();
      expect(event.type).toBe('email.bounce');
    });

    it('should fallback to event_id', () => {
      const raw = { event_id: 'eid-sg', event: 'click', timestamp: 1000 };
      const event = sendgridEventTransformer(raw);
      expect(event.id).toBe('eid-sg');
    });

    it('should use current date when timestamp missing', () => {
      const raw = { sg_message_id: 'msg-1', event: 'open' };
      const event = sendgridEventTransformer(raw);
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Stripe Verifier Edge Cases
  // ============================================================================

  describe('Stripe Verifier - edge cases', () => {
    it('should reject when t is missing', () => {
      const result = stripeVerify('payload', 'v1=abc', 'secret');
      expect(result).toBe(false);
    });

    it('should reject when v1 is missing', () => {
      const result = stripeVerify('payload', 't=12345', 'secret');
      expect(result).toBe(false);
    });

    it('should reject empty signature string', () => {
      const result = stripeVerify('payload', '', 'secret');
      expect(result).toBe(false);
    });
  });

  describe('GitHub Verifier - edge cases', () => {
    it('should reject when signature does not start with sha256=', () => {
      const result = githubVerify('payload', 'sha1=abcdef', 'secret');
      expect(result).toBe(false);
    });

    it('should reject tampered signature', () => {
      const result = githubVerify('payload', 'sha256=0000', 'secret');
      expect(result).toBe(false);
    });
  });

  describe('HMAC-SHA256 Verifier - edge cases', () => {
    it('should reject signature with different length', () => {
      const result = hmacSha256Verify('payload', 'short', 'secret');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Processing Time Tracking
  // ============================================================================

  describe('Processing Time Average', () => {
    it('should calculate average processing time across multiple events', async () => {
      registerOpenSource(framework);

      framework.on('timed.a', async () => {
        await new Promise(r => setTimeout(r, 5));
      });
      framework.on('timed.b', async () => {
        await new Promise(r => setTimeout(r, 10));
      });

      await framework.handle(
        'test',
        jsonPayload({ id: 't1', type: 'timed.a', data: {} }),
        {}
      );
      await framework.handle(
        'test',
        jsonPayload({ id: 't2', type: 'timed.b', data: {} }),
        {}
      );

      const metrics = framework.getMetrics();
      expect(metrics.averageProcessingTimeMs).toBeGreaterThan(0);
      expect(metrics.eventsProcessed).toBe(2);
    });
  });

  // ============================================================================
  // Chaining
  // ============================================================================

  describe('Chaining API', () => {
    it('should support method chaining on registerSource', () => {
      const result = framework.registerSource({
        name: 'chain-test',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: () => true,
      });
      expect(result).toBe(framework);
    });

    it('should support method chaining on on()', () => {
      const result = framework.on('test', async () => {});
      expect(result).toBe(framework);
    });

    it('should support method chaining on onAll()', () => {
      const result = framework.onAll(async () => {});
      expect(result).toBe(framework);
    });

    it('should support method chaining on use()', () => {
      const result = framework.use(async (_e, _c, next) => { await next(); });
      expect(result).toBe(framework);
    });
  });

  // ============================================================================
  // Unregister source - additional
  // ============================================================================

  describe('Unregister Source - non-existent', () => {
    it('should return false when unregistering non-existent source', () => {
      const removed = framework.unregisterSource('ghost');
      expect(removed).toBe(false);
    });
  });

  // ============================================================================
  // Global handler + type handler + wildcard combined
  // ============================================================================

  describe('Handler combination', () => {
    it('should call global, type-specific, and wildcard handlers', async () => {
      registerOpenSource(framework);

      const globalH = vi.fn();
      const specificH = vi.fn();
      const wildcardH = vi.fn();

      framework.onAll(globalH);
      framework.on('combo.event', specificH);
      framework.on('*', wildcardH);

      await framework.handle(
        'test',
        jsonPayload({ id: 'combo-1', type: 'combo.event', data: {} }),
        {}
      );

      expect(globalH).toHaveBeenCalledTimes(1);
      expect(specificH).toHaveBeenCalledTimes(1);
      expect(wildcardH).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // IP passing
  // ============================================================================

  describe('IP Address', () => {
    it('should pass IP to handler context', async () => {
      registerOpenSource(framework);

      let capturedContext: WebhookContext | undefined;
      framework.on('ip.test', async (_event, ctx) => {
        capturedContext = ctx;
      });

      await framework.handle(
        'test',
        jsonPayload({ id: 'ip-1', type: 'ip.test', data: {} }),
        {},
        '10.0.0.1'
      );

      expect(capturedContext?.ip).toBe('10.0.0.1');
    });
  });
});
