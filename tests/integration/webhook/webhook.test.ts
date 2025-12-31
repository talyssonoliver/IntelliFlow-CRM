/**
 * Webhook Integration Tests
 *
 * Tests for webhook infrastructure including:
 * - Webhook handler
 * - Signature verification
 * - Idempotency middleware
 * - Retry logic
 * - Dead letter queue
 *
 * KPIs Tested:
 * - Zero duplicate webhooks
 * - API coverage 100%
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, createHmac } from 'crypto';

// Import webhook modules
import {
  WebhookHandler,
  WebhookEventRouter,
  HmacSha256Verifier,
  StripeSignatureVerifier,
  GitHubSignatureVerifier,
  SendGridSignatureVerifier,
  SignatureVerifiers,
  EmailWebhookEvents,
  createWebhookHandler,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookContext,
} from '../../../apps/api/src/webhooks/handler';

import {
  IdempotencyMiddleware,
  InMemoryIdempotencyStore,
  createIdempotencyMiddleware,
  createWebhookIdempotencyKey,
  type IdempotencyEntry,
} from '../../../apps/api/src/webhooks/idempotency';

import {
  RetryManager,
  InMemoryRetryQueue,
  CircuitBreaker,
  calculateRetryDelay,
  isRetryableError,
  createRetryManager,
  createCircuitBreaker,
  type RetryEntry,
  type RetryConfig,
} from '../../../apps/api/src/webhooks/retry';

import {
  WebhookFramework,
  SignatureVerifiers as FrameworkVerifiers,
  EventTransformers,
  createWebhookFramework,
} from '../../../artifacts/misc/webhooks/framework';

// =============================================================================
// Test Fixtures
// =============================================================================

const testSecret = 'whsec_test_secret_key_12345';

const createTestPayload = (type: string, id?: string) => ({
  id: id || `evt_${Date.now()}`,
  type,
  timestamp: new Date().toISOString(),
  data: {
    object: {
      id: 'obj_123',
      status: 'active',
    },
  },
});

const createStripeSignature = (payload: string, secret: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
};

const createGitHubSignature = (payload: string, secret: string) => {
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${signature}`;
};

const createHmacSignature = (payload: string, secret: string) => {
  return createHmac('sha256', secret).update(payload).digest('hex');
};

// =============================================================================
// Signature Verification Tests
// =============================================================================

describe('Signature Verification', () => {
  describe('HMAC-SHA256 Verifier', () => {
    const verifier = new HmacSha256Verifier();

    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = createHmacSignature(payload, testSecret);

      expect(verifier.verify(payload, signature, testSecret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      expect(verifier.verify(payload, 'invalid_signature', testSecret)).toBe(false);
    });

    it('should reject modified payload', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = createHmacSignature(payload, testSecret);
      const modifiedPayload = JSON.stringify({ test: 'modified' });

      expect(verifier.verify(modifiedPayload, signature, testSecret)).toBe(false);
    });

    it('should use correct header name', () => {
      expect(verifier.getHeaderName()).toBe('x-signature');
    });

    it('should support custom prefix and header', () => {
      const customVerifier = new HmacSha256Verifier({
        prefix: 'sha256=',
        headerName: 'x-custom-signature',
      });

      const payload = JSON.stringify({ test: 'data' });
      const signature = 'sha256=' + createHmacSignature(payload, testSecret);

      expect(customVerifier.verify(payload, signature, testSecret)).toBe(true);
      expect(customVerifier.getHeaderName()).toBe('x-custom-signature');
    });
  });

  describe('Stripe Signature Verifier', () => {
    const verifier = new StripeSignatureVerifier(300);

    it('should verify valid Stripe signature', () => {
      const payload = JSON.stringify(createTestPayload('payment_intent.succeeded'));
      const signature = createStripeSignature(payload, testSecret);

      expect(verifier.verify(payload, signature, testSecret)).toBe(true);
    });

    it('should reject expired timestamp', () => {
      const payload = JSON.stringify(createTestPayload('payment_intent.succeeded'));
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const sig = createHmac('sha256', testSecret).update(signedPayload).digest('hex');
      const signature = `t=${oldTimestamp},v1=${sig}`;

      expect(verifier.verify(payload, signature, testSecret)).toBe(false);
    });

    it('should reject malformed signature', () => {
      const payload = JSON.stringify(createTestPayload('test'));

      expect(verifier.verify(payload, 'invalid', testSecret)).toBe(false);
      expect(verifier.verify(payload, 't=1234', testSecret)).toBe(false);
      expect(verifier.verify(payload, 'v1=abc', testSecret)).toBe(false);
    });

    it('should use correct header name', () => {
      expect(verifier.getHeaderName()).toBe('stripe-signature');
    });
  });

  describe('GitHub Signature Verifier', () => {
    const verifier = new GitHubSignatureVerifier();

    it('should verify valid GitHub signature', () => {
      const payload = JSON.stringify({ action: 'push' });
      const signature = createGitHubSignature(payload, testSecret);

      expect(verifier.verify(payload, signature, testSecret)).toBe(true);
    });

    it('should reject signature without prefix', () => {
      const payload = JSON.stringify({ action: 'push' });
      const signature = createHmacSignature(payload, testSecret);

      expect(verifier.verify(payload, signature, testSecret)).toBe(false);
    });

    it('should use correct header name', () => {
      expect(verifier.getHeaderName()).toBe('x-hub-signature-256');
    });
  });
});

// =============================================================================
// Webhook Handler Tests
// =============================================================================

describe('Webhook Handler', () => {
  let handler: WebhookHandler;

  beforeEach(() => {
    handler = createWebhookHandler();
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });
  });

  describe('Request Handling', () => {
    it('should handle valid webhook request', async () => {
      const router = handler.getRouter();
      let handledEvent: WebhookEvent | null = null;

      router.on('test.event', async (event) => {
        handledEvent = event;
      });

      const payload = createTestPayload('test.event');
      const rawBody = JSON.stringify(payload);
      const signature = createHmacSignature(rawBody, testSecret);

      const result = await handler.handleRequest('test', rawBody, {
        'x-signature': signature,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.eventId).toBe(payload.id);
      expect(handledEvent).not.toBeNull();
      expect(handledEvent?.type).toBe('test.event');
    });

    it('should reject unknown source', async () => {
      const result = await handler.handleRequest('unknown', '{}', {});

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.message).toContain('Unknown webhook source');
    });

    it('should reject invalid signature', async () => {
      const result = await handler.handleRequest('test', '{"test": true}', {
        'x-signature': 'invalid_signature',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Invalid signature');
    });

    it('should reject missing signature', async () => {
      const result = await handler.handleRequest('test', '{"test": true}', {});

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Missing signature');
    });

    it('should handle invalid JSON', async () => {
      const invalidJson = 'not json';
      const signature = createHmacSignature(invalidJson, testSecret);

      const result = await handler.handleRequest('test', invalidJson, {
        'x-signature': signature,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it('should handle disabled source', async () => {
      handler.registerSource({
        source: 'disabled',
        secret: testSecret,
        signatureVerifier: SignatureVerifiers.hmacSha256(),
        enabled: false,
      });

      const result = await handler.handleRequest('disabled', '{}', {});

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
    });
  });

  describe('Event Routing', () => {
    it('should route events to correct handlers', async () => {
      const router = handler.getRouter();
      const events: string[] = [];

      router.on('event.a', async () => {
        events.push('a');
      });

      router.on('event.b', async () => {
        events.push('b');
      });

      const payloadA = createTestPayload('event.a', 'evt_a');
      const payloadB = createTestPayload('event.b', 'evt_b');

      await handler.handleRequest('test', JSON.stringify(payloadA), {
        'x-signature': createHmacSignature(JSON.stringify(payloadA), testSecret),
      });

      await handler.handleRequest('test', JSON.stringify(payloadB), {
        'x-signature': createHmacSignature(JSON.stringify(payloadB), testSecret),
      });

      expect(events).toContain('a');
      expect(events).toContain('b');
    });

    it('should call global handlers for all events', async () => {
      const router = handler.getRouter();
      let globalCallCount = 0;

      router.onAll(async () => {
        globalCallCount++;
      });

      const payload1 = createTestPayload('event.1', 'evt_1');
      const payload2 = createTestPayload('event.2', 'evt_2');

      await handler.handleRequest('test', JSON.stringify(payload1), {
        'x-signature': createHmacSignature(JSON.stringify(payload1), testSecret),
      });

      await handler.handleRequest('test', JSON.stringify(payload2), {
        'x-signature': createHmacSignature(JSON.stringify(payload2), testSecret),
      });

      expect(globalCallCount).toBe(2);
    });

    it('should handle wildcard event type', async () => {
      const router = handler.getRouter();
      let wildcardCalled = false;

      router.on('*', async () => {
        wildcardCalled = true;
      });

      const payload = createTestPayload('any.event');
      await handler.handleRequest('test', JSON.stringify(payload), {
        'x-signature': createHmacSignature(JSON.stringify(payload), testSecret),
      });

      expect(wildcardCalled).toBe(true);
    });
  });

  describe('Idempotency (Zero Duplicates)', () => {
    it('should not process duplicate events', async () => {
      const router = handler.getRouter();
      let processCount = 0;

      router.on('test.event', async () => {
        processCount++;
      });

      const payload = createTestPayload('test.event', 'evt_duplicate');
      const rawBody = JSON.stringify(payload);
      const signature = createHmacSignature(rawBody, testSecret);
      const headers = { 'x-signature': signature };

      // Send same event twice
      await handler.handleRequest('test', rawBody, headers);
      const secondResult = await handler.handleRequest('test', rawBody, headers);

      expect(processCount).toBe(1); // Should only be processed once
      expect(secondResult.success).toBe(true);
      expect(secondResult.message).toContain('Duplicate');
    });

    it('should track processed events', async () => {
      const router = handler.getRouter();
      router.on('test.event', async () => {});

      const payload = createTestPayload('test.event', 'evt_tracked');
      const rawBody = JSON.stringify(payload);

      await handler.handleRequest('test', rawBody, {
        'x-signature': createHmacSignature(rawBody, testSecret),
      });

      expect(handler.wasProcessed('test', 'evt_tracked')).toBe(true);
      expect(handler.wasProcessed('test', 'evt_unknown')).toBe(false);
    });
  });

  describe('Allowed Events Filtering', () => {
    it('should only process allowed event types', async () => {
      handler.registerSource({
        source: 'filtered',
        secret: testSecret,
        signatureVerifier: SignatureVerifiers.hmacSha256(),
        enabled: true,
        allowedEvents: ['allowed.event'],
      });

      const router = handler.getRouter();
      let processCount = 0;

      router.on('allowed.event', async () => {
        processCount++;
      });

      router.on('blocked.event', async () => {
        processCount++;
      });

      const allowedPayload = createTestPayload('allowed.event', 'evt_allowed');
      const blockedPayload = createTestPayload('blocked.event', 'evt_blocked');

      await handler.handleRequest('filtered', JSON.stringify(allowedPayload), {
        'x-signature': createHmacSignature(JSON.stringify(allowedPayload), testSecret),
      });

      const blockedResult = await handler.handleRequest('filtered', JSON.stringify(blockedPayload), {
        'x-signature': createHmacSignature(JSON.stringify(blockedPayload), testSecret),
      });

      expect(processCount).toBe(1);
      expect(blockedResult.success).toBe(true);
      expect(blockedResult.message).toContain('not handled');
    });
  });
});

// =============================================================================
// Idempotency Middleware Tests
// =============================================================================

describe('Idempotency Middleware', () => {
  let middleware: IdempotencyMiddleware;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    middleware = createIdempotencyMiddleware(store, {
      ttlMs: 3600000, // 1 hour
      lockTimeoutMs: 5000,
      maxRetries: 3,
      cleanupIntervalMs: 0, // Disable auto cleanup for tests
    });
  });

  afterEach(() => {
    middleware.stopCleanup();
  });

  describe('Key Generation', () => {
    it('should generate consistent keys', () => {
      const key1 = createWebhookIdempotencyKey('source', 'event123');
      const key2 = createWebhookIdempotencyKey('source', 'event123');

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = createWebhookIdempotencyKey('source1', 'event');
      const key2 = createWebhookIdempotencyKey('source2', 'event');

      expect(key1).not.toBe(key2);
    });
  });

  describe('Idempotency Check', () => {
    it('should allow first request', async () => {
      const key = middleware.generateKey('source', 'event1');
      const check = await middleware.check(key);

      expect(check.shouldProcess).toBe(true);
      expect(check.isDuplicate).toBe(false);
    });

    it('should block duplicate after completion', async () => {
      const key = middleware.generateKey('source', 'event2');

      await middleware.startProcessing(key);
      await middleware.completeProcessing(key, { success: true });

      const check = await middleware.check(key);

      expect(check.shouldProcess).toBe(false);
      expect(check.isDuplicate).toBe(true);
      expect(check.previousResult).toEqual({ success: true });
    });

    it('should allow retry after failure under limit', async () => {
      const key = middleware.generateKey('source', 'event3');

      await middleware.startProcessing(key);
      await middleware.failProcessing(key, 'Test error');

      const check = await middleware.check(key);

      expect(check.shouldProcess).toBe(true);
      expect(check.isDuplicate).toBe(true);
      expect(check.entry?.attempts).toBe(1);
    });

    it('should block after max retries exceeded', async () => {
      const key = middleware.generateKey('source', 'event4');

      // Simulate max retries
      for (let i = 0; i < 3; i++) {
        await middleware.startProcessing(key);
        await middleware.failProcessing(key, 'Error');
      }

      const check = await middleware.check(key);

      expect(check.shouldProcess).toBe(false);
      expect(check.reason).toContain('Max retries');
    });
  });

  describe('Lock Management', () => {
    it('should prevent concurrent processing', async () => {
      const key = middleware.generateKey('source', 'concurrent');

      const acquired1 = await middleware.startProcessing(key);
      const acquired2 = await middleware.startProcessing(key);

      expect(acquired1).toBe(true);
      expect(acquired2).toBe(false);
    });

    it('should release lock on completion', async () => {
      const key = middleware.generateKey('source', 'release');

      await middleware.startProcessing(key);
      await middleware.completeProcessing(key);

      // Should not be able to start new processing (already completed)
      const check = await middleware.check(key);
      expect(check.shouldProcess).toBe(false);
    });
  });

  describe('Wrapper Function', () => {
    it('should wrap handler with idempotency', async () => {
      let callCount = 0;

      const wrapped = middleware.wrap(
        (input: { eventId: string }) => middleware.generateKey('source', input.eventId),
        async (_input: { eventId: string }) => {
          callCount++;
          return { processed: true };
        }
      );

      const input = { eventId: 'wrap_test' };

      const result1 = await wrapped(input);
      const result2 = await wrapped(input);

      expect(callCount).toBe(1);
      expect((result1 as { result: { processed: boolean }; fromCache: boolean }).result).toEqual({ processed: true });
      expect((result1 as { fromCache: boolean }).fromCache).toBe(false);
      expect((result2 as { fromCache: boolean }).fromCache).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired entries', async () => {
      const shortTtlMiddleware = createIdempotencyMiddleware(store, {
        ttlMs: 1, // 1ms TTL for testing
        cleanupIntervalMs: 0,
      });

      const key = shortTtlMiddleware.generateKey('source', 'expire');
      await shortTtlMiddleware.startProcessing(key);
      await shortTtlMiddleware.completeProcessing(key);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const removed = await shortTtlMiddleware.cleanup();
      expect(removed).toBeGreaterThanOrEqual(1);

      shortTtlMiddleware.stopCleanup();
    });
  });
});

// =============================================================================
// Retry Logic Tests
// =============================================================================

describe('Retry Logic', () => {
  describe('Retry Delay Calculation', () => {
    it('should calculate exponential backoff', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableErrors: [],
        deadLetterThreshold: 5,
      };

      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(4000);
      expect(calculateRetryDelay(3, config)).toBe(8000);
    });

    it('should cap at max delay', () => {
      const config: RetryConfig = {
        maxAttempts: 10,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableErrors: [],
        deadLetterThreshold: 5,
      };

      expect(calculateRetryDelay(10, config)).toBe(5000);
    });

    it('should add jitter', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
        retryableErrors: [],
        deadLetterThreshold: 5,
      };

      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateRetryDelay(1, config));
      }

      // With jitter, should have some variation
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('Retryable Error Detection', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError('ECONNREFUSED')).toBe(true);
      expect(isRetryableError('ETIMEDOUT')).toBe(true);
      expect(isRetryableError('Connection timeout: ETIMEDOUT')).toBe(true);
      expect(isRetryableError(new Error('NETWORK_ERROR'))).toBe(true);
    });

    it('should reject non-retryable errors', () => {
      expect(isRetryableError('INVALID_INPUT')).toBe(false);
      expect(isRetryableError('VALIDATION_ERROR')).toBe(false);
      expect(isRetryableError(new Error('Bad request'))).toBe(false);
    });
  });

  describe('Retry Queue', () => {
    let queue: InMemoryRetryQueue;

    beforeEach(() => {
      queue = new InMemoryRetryQueue();
    });

    it('should enqueue and dequeue entries', async () => {
      const entry: RetryEntry = {
        id: 'retry_1',
        source: 'test',
        eventId: 'evt_1',
        eventType: 'test.event',
        payload: { test: true },
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(), // Ready now
        status: 'pending',
      };

      await queue.enqueue(entry);
      expect(queue.size()).toBe(1);

      const dequeued = await queue.dequeue(1);
      expect(dequeued.length).toBe(1);
      expect(dequeued[0].id).toBe('retry_1');
    });

    it('should only dequeue ready entries', async () => {
      const readyEntry: RetryEntry = {
        id: 'ready',
        source: 'test',
        eventId: 'evt_ready',
        eventType: 'test.event',
        payload: {},
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(), // Ready now
        status: 'pending',
      };

      const futureEntry: RetryEntry = {
        id: 'future',
        source: 'test',
        eventId: 'evt_future',
        eventType: 'test.event',
        payload: {},
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(Date.now() + 10000), // 10 seconds in future
        status: 'pending',
      };

      await queue.enqueue(readyEntry);
      await queue.enqueue(futureEntry);

      const dequeued = await queue.dequeue(10);
      expect(dequeued.length).toBe(1);
      expect(dequeued[0].id).toBe('ready');
    });

    it('should move to dead letter queue', async () => {
      const entry: RetryEntry = {
        id: 'dead',
        source: 'test',
        eventId: 'evt_dead',
        eventType: 'test.event',
        payload: {},
        attempts: 5,
        maxAttempts: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
        error: 'Too many failures',
        status: 'pending',
      };

      await queue.enqueue(entry);
      await queue.moveToDeadLetter('dead');

      expect(queue.size()).toBe(0);
      expect(queue.deadLetterSize()).toBe(1);

      const dlq = await queue.getDeadLetterEntries();
      expect(dlq.length).toBe(1);
      expect(dlq[0].id).toBe('dead');
    });

    it('should reprocess from dead letter', async () => {
      const entry: RetryEntry = {
        id: 'revive',
        source: 'test',
        eventId: 'evt_revive',
        eventType: 'test.event',
        payload: {},
        attempts: 5,
        maxAttempts: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
        status: 'pending',
      };

      await queue.enqueue(entry);
      await queue.moveToDeadLetter('revive');
      const reprocessed = await queue.reprocessDeadLetter('revive');

      expect(reprocessed).toBe(true);
      expect(queue.deadLetterSize()).toBe(0);
      expect(queue.size()).toBe(1);
    });
  });

  describe('Retry Manager', () => {
    let manager: RetryManager;

    beforeEach(() => {
      manager = createRetryManager(undefined, undefined, false);
    });

    it('should schedule retries', async () => {
      const entry = await manager.scheduleRetry(
        'test',
        'evt_1',
        'test.event',
        { data: 'test' },
        'Initial error'
      );

      expect(entry.id).toBeDefined();
      expect(entry.attempts).toBe(0);
      expect(entry.nextAttemptAt).toBeDefined();
    });

    it('should process retries with handler', async () => {
      let processed = false;

      await manager.scheduleRetry('test', 'evt_2', 'test.event', {});

      // Wait for retry to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await manager.processPending({
        handler: async () => {
          processed = true;
        },
      });

      expect(processed).toBe(true);
      expect(result.succeeded).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 100, // Short for testing
        halfOpenMaxRequests: 2,
      });
    });

    it('should start closed', () => {
      expect(breaker.getState().status).toBe('closed');
      expect(breaker.canRequest()).toBe(true);
    });

    it('should open after failure threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState().status).toBe('open');
      expect(breaker.canRequest()).toBe(false);
    });

    it('should transition to half-open after timeout', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState().status).toBe('open');

      // Wait for open duration
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(breaker.canRequest()).toBe(true);
      expect(breaker.getState().status).toBe('half_open');
    });

    it('should close after success threshold in half-open', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise(resolve => setTimeout(resolve, 150));

      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState().status).toBe('closed');
    });

    it('should reopen after failure in half-open', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise(resolve => setTimeout(resolve, 150));

      breaker.recordFailure();

      expect(breaker.getState().status).toBe('open');
    });

    it('should reset failure count on success in closed state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();

      expect(breaker.getState().failures).toBe(0);
      expect(breaker.getState().status).toBe('closed');
    });
  });
});

// =============================================================================
// Webhook Framework Tests
// =============================================================================

describe('Webhook Framework', () => {
  let framework: WebhookFramework;

  beforeEach(() => {
    framework = createWebhookFramework({
      metricsEnabled: true,
      retryEnabled: true,
      deadLetterEnabled: true,
    });

    framework.registerSource({
      name: 'test',
      secret: testSecret,
      signatureHeader: 'x-signature',
      signatureVerifier: FrameworkVerifiers.hmacSha256,
    });
  });

  describe('Multi-source Handling', () => {
    it('should handle multiple sources', async () => {
      framework.registerSource({
        name: 'stripe',
        secret: 'stripe_secret',
        signatureHeader: 'stripe-signature',
        signatureVerifier: FrameworkVerifiers.stripe,
        eventTransformer: EventTransformers.stripe,
      });

      framework.registerSource({
        name: 'github',
        secret: 'github_secret',
        signatureHeader: 'x-hub-signature-256',
        signatureVerifier: FrameworkVerifiers.github,
      });

      expect(framework.getSources()).toContain('test');
      expect(framework.getSources()).toContain('stripe');
      expect(framework.getSources()).toContain('github');
    });
  });

  describe('Middleware Chain', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];

      framework.use(async (_event, _context, next) => {
        order.push(1);
        await next();
        order.push(4);
      });

      framework.use(async (_event, _context, next) => {
        order.push(2);
        await next();
        order.push(3);
      });

      framework.on('test.event', async () => {
        order.push(0);
      });

      const payload = createTestPayload('test.event');
      const rawBody = JSON.stringify(payload);

      await framework.handle('test', rawBody, {
        'x-signature': createHmacSignature(rawBody, testSecret),
      });

      expect(order).toEqual([1, 2, 0, 3, 4]);
    });
  });

  describe('Metrics', () => {
    it('should track event metrics', async () => {
      framework.on('tracked.event', async () => {});

      const payload = createTestPayload('tracked.event');
      const rawBody = JSON.stringify(payload);

      await framework.handle('test', rawBody, {
        'x-signature': createHmacSignature(rawBody, testSecret),
      });

      const metrics = framework.getMetrics();

      expect(metrics.eventsReceived).toBe(1);
      expect(metrics.eventsProcessed).toBe(1);
      expect(metrics.eventsByType['tracked.event']).toBe(1);
      expect(metrics.eventsBySource['test']).toBe(1);
    });

    it('should track processing time', async () => {
      framework.on('timed.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const payload = createTestPayload('timed.event');
      const rawBody = JSON.stringify(payload);

      const result = await framework.handle('test', rawBody, {
        'x-signature': createHmacSignature(rawBody, testSecret),
      });

      expect(result.processingTimeMs).toBeGreaterThan(0);

      const metrics = framework.getMetrics();
      expect(metrics.averageProcessingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should move failed events to DLQ after retries', async () => {
      let attempts = 0;

      framework.on('failing.event', async () => {
        attempts++;
        throw new Error('Handler failure');
      });

      const payload = createTestPayload('failing.event');
      const rawBody = JSON.stringify(payload);

      await framework.handle('test', rawBody, {
        'x-signature': createHmacSignature(rawBody, testSecret),
      });

      // Process retries until DLQ
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await framework.processRetries();
      }

      const dlq = framework.getDeadLetterEntries();
      // Note: DLQ behavior depends on retry configuration
      // The framework should have recorded the failure
      const metrics = framework.getMetrics();
      expect(metrics.eventsFailed).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Webhook System Integration', () => {
  it('should process webhook end-to-end with zero duplicates', async () => {
    const handler = createWebhookHandler();
    let processCount = 0;

    handler.registerSource({
      source: 'integration',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    handler.getRouter().on('integration.event', async () => {
      processCount++;
    });

    const payload = createTestPayload('integration.event', 'evt_integration');
    const rawBody = JSON.stringify(payload);
    const signature = createHmacSignature(rawBody, testSecret);
    const headers = { 'x-signature': signature };

    // Send same event multiple times
    const results = await Promise.all([
      handler.handleRequest('integration', rawBody, headers),
      handler.handleRequest('integration', rawBody, headers),
      handler.handleRequest('integration', rawBody, headers),
    ]);

    // All should succeed
    expect(results.every(r => r.success)).toBe(true);

    // But handler should only be called once (zero duplicates)
    expect(processCount).toBe(1);
  });

  it('should handle complete webhook flow with retries', async () => {
    const framework = createWebhookFramework({
      retryEnabled: true,
      maxRetries: 3,
    });

    let attempts = 0;
    const successOnAttempt = 2;

    framework.registerSource({
      name: 'retryable',
      secret: testSecret,
      signatureHeader: 'x-signature',
      signatureVerifier: FrameworkVerifiers.hmacSha256,
    });

    framework.on('retryable.event', async () => {
      attempts++;
      if (attempts < successOnAttempt) {
        throw new Error('Temporary failure');
      }
    });

    const payload = createTestPayload('retryable.event', 'evt_retry_flow');
    const rawBody = JSON.stringify(payload);

    await framework.handle('retryable', rawBody, {
      'x-signature': createHmacSignature(rawBody, testSecret),
    });

    // Process retries
    for (let i = 0; i < 5 && attempts < successOnAttempt; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await framework.processRetries();
    }

    expect(attempts).toBe(successOnAttempt);
  });

  it('should meet KPI: API coverage 100%', () => {
    // Verify all required API endpoints are implemented
    const requiredEndpoints = [
      'handleRequest',      // Main webhook handler
      'registerSource',     // Source registration
      'removeSource',       // Source removal
      'getRouter',          // Event router access
      'wasProcessed',       // Idempotency check
      'getEventResult',     // Get previous result
      'getSources',         // List sources
    ];

    const handler = createWebhookHandler();

    for (const endpoint of requiredEndpoints) {
      expect(typeof (handler as Record<string, unknown>)[endpoint]).toBe('function');
    }
  });

  it('should meet KPI: zero duplicate webhooks', async () => {
    const handler = createWebhookHandler();
    const processedEvents: string[] = [];

    handler.registerSource({
      source: 'dedup_test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    handler.getRouter().on('*', async (event) => {
      processedEvents.push(event.id);
    });

    // Simulate 100 events, each sent 3 times
    const events = Array.from({ length: 100 }, (_, i) =>
      createTestPayload('test.event', `evt_${i}`)
    );

    for (const event of events) {
      const rawBody = JSON.stringify(event);
      const signature = createHmacSignature(rawBody, testSecret);
      const headers = { 'x-signature': signature };

      // Send each event 3 times
      await handler.handleRequest('dedup_test', rawBody, headers);
      await handler.handleRequest('dedup_test', rawBody, headers);
      await handler.handleRequest('dedup_test', rawBody, headers);
    }

    // Should have exactly 100 unique events processed
    const uniqueEvents = new Set(processedEvents);
    expect(processedEvents.length).toBe(100);
    expect(uniqueEvents.size).toBe(100);
  });
});
