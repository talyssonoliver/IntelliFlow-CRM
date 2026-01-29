/**
 * Webhook Handler Tests
 *
 * Tests for webhook signature verification, event routing, and processing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  HmacSha256Verifier,
  StripeSignatureVerifier,
  GitHubSignatureVerifier,
  SendGridSignatureVerifier,
  WebhookEventRouter,
  WebhookHandler,
  createWebhookHandler,
  SignatureVerifiers,
  WebhookEvent,
  WebhookContext,
  EmailWebhookEvents,
} from '../handler';

describe('Signature Verifiers', () => {
  const testPayload = '{"test":"data"}';
  const testSecret = 'test-secret-key';

  describe('HmacSha256Verifier', () => {
    it('should verify valid HMAC signature', () => {
      const verifier = new HmacSha256Verifier();
      const signature = createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const verifier = new HmacSha256Verifier();

      expect(verifier.verify(testPayload, 'invalid-signature', testSecret)).toBe(false);
    });

    it('should use custom prefix', () => {
      const verifier = new HmacSha256Verifier({ prefix: 'sha256=' });
      const hash = createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');
      const signature = 'sha256=' + hash;

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(true);
    });

    it('should return correct header name', () => {
      const verifier = new HmacSha256Verifier({ headerName: 'x-custom-signature' });

      expect(verifier.getHeaderName()).toBe('x-custom-signature');
    });

    it('should use default header name', () => {
      const verifier = new HmacSha256Verifier();

      expect(verifier.getHeaderName()).toBe('x-signature');
    });
  });

  describe('StripeSignatureVerifier', () => {
    it('should verify valid Stripe signature', () => {
      const verifier = new StripeSignatureVerifier();
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${testPayload}`;
      const hash = createHmac('sha256', testSecret)
        .update(signedPayload)
        .digest('hex');
      const signature = `t=${timestamp},v1=${hash}`;

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(true);
    });

    it('should reject signature with missing timestamp', () => {
      const verifier = new StripeSignatureVerifier();
      const signature = 'v1=somehash';

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(false);
    });

    it('should reject signature with missing v1', () => {
      const verifier = new StripeSignatureVerifier();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp}`;

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(false);
    });

    it('should reject expired signature', () => {
      const verifier = new StripeSignatureVerifier(60); // 60 second tolerance
      const timestamp = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      const signedPayload = `${timestamp}.${testPayload}`;
      const hash = createHmac('sha256', testSecret)
        .update(signedPayload)
        .digest('hex');
      const signature = `t=${timestamp},v1=${hash}`;

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(false);
    });

    it('should return correct header name', () => {
      const verifier = new StripeSignatureVerifier();

      expect(verifier.getHeaderName()).toBe('stripe-signature');
    });
  });

  describe('GitHubSignatureVerifier', () => {
    it('should verify valid GitHub signature', () => {
      const verifier = new GitHubSignatureVerifier();
      const hash = createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');
      const signature = `sha256=${hash}`;

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(true);
    });

    it('should reject signature without sha256= prefix', () => {
      const verifier = new GitHubSignatureVerifier();
      const hash = createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');

      expect(verifier.verify(testPayload, hash, testSecret)).toBe(false);
    });

    it('should reject invalid signature', () => {
      const verifier = new GitHubSignatureVerifier();

      expect(verifier.verify(testPayload, 'sha256=invalid', testSecret)).toBe(false);
    });

    it('should return correct header name', () => {
      const verifier = new GitHubSignatureVerifier();

      expect(verifier.getHeaderName()).toBe('x-hub-signature-256');
    });
  });

  describe('SendGridSignatureVerifier', () => {
    it('should verify valid SendGrid signature', () => {
      const verifier = new SendGridSignatureVerifier();
      const signature = createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('base64');

      expect(verifier.verify(testPayload, signature, testSecret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const verifier = new SendGridSignatureVerifier();

      expect(verifier.verify(testPayload, 'invalid-signature', testSecret)).toBe(false);
    });

    it('should return correct header name', () => {
      const verifier = new SendGridSignatureVerifier();

      expect(verifier.getHeaderName()).toBe('x-twilio-email-event-webhook-signature');
    });
  });

  describe('SignatureVerifiers factory', () => {
    it('should create HmacSha256Verifier', () => {
      const verifier = SignatureVerifiers.hmacSha256({ prefix: 'test=' });

      expect(verifier).toBeInstanceOf(HmacSha256Verifier);
    });

    it('should create StripeSignatureVerifier', () => {
      const verifier = SignatureVerifiers.stripe(600);

      expect(verifier).toBeInstanceOf(StripeSignatureVerifier);
    });

    it('should create GitHubSignatureVerifier', () => {
      const verifier = SignatureVerifiers.github();

      expect(verifier).toBeInstanceOf(GitHubSignatureVerifier);
    });

    it('should create SendGridSignatureVerifier', () => {
      const verifier = SignatureVerifiers.sendgrid();

      expect(verifier).toBeInstanceOf(SendGridSignatureVerifier);
    });
  });
});

describe('WebhookEventRouter', () => {
  let router: WebhookEventRouter;

  beforeEach(() => {
    router = new WebhookEventRouter();
  });

  const createTestEvent = (type = 'test.event'): WebhookEvent => ({
    id: 'evt-123',
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source: 'test',
    payload: { data: 'test' },
  });

  const createTestContext = (): WebhookContext => ({
    requestId: 'req-123',
    receivedAt: new Date(),
    source: 'test',
    rawBody: '{}',
    headers: {},
    verified: true,
  });

  it('should register and route to event handler', async () => {
    const handler = vi.fn();
    router.on('test.event', handler);

    const event = createTestEvent();
    const context = createTestContext();

    await router.route(event, context);

    expect(handler).toHaveBeenCalledWith(event, event.payload, context);
  });

  it('should route to global handlers', async () => {
    const globalHandler = vi.fn();
    router.onAll(globalHandler);

    const event = createTestEvent();
    const context = createTestContext();

    await router.route(event, context);

    expect(globalHandler).toHaveBeenCalledWith(event, event.payload, context);
  });

  it('should route to wildcard handlers', async () => {
    const wildcardHandler = vi.fn();
    router.on('*', wildcardHandler);

    const event = createTestEvent('some.event');
    const context = createTestContext();

    await router.route(event, context);

    expect(wildcardHandler).toHaveBeenCalled();
  });

  it('should route to multiple handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const globalHandler = vi.fn();

    router.on('test.event', handler1);
    router.on('test.event', handler2);
    router.onAll(globalHandler);

    const event = createTestEvent();
    const context = createTestContext();

    await router.route(event, context);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(globalHandler).toHaveBeenCalled();
  });

  it('should remove handler with off()', () => {
    const handler = vi.fn();
    router.on('test.event', handler);
    router.off('test.event', handler);

    expect(router.hasHandlers('test.event')).toBe(false);
  });

  it('should throw AggregateError when handlers fail', async () => {
    router.on('test.event', async () => {
      throw new Error('Handler failed');
    });

    const event = createTestEvent();
    const context = createTestContext();

    await expect(router.route(event, context)).rejects.toThrow(AggregateError);
  });

  it('should warn when no handlers registered', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const event = createTestEvent('unhandled.event');
    const context = createTestContext();

    await router.route(event, context);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No handlers registered')
    );
    consoleSpy.mockRestore();
  });

  it('should check if handlers exist', () => {
    expect(router.hasHandlers('test.event')).toBe(false);

    router.on('test.event', vi.fn());

    expect(router.hasHandlers('test.event')).toBe(true);
  });

  it('should check global handlers in hasHandlers', () => {
    expect(router.hasHandlers('any.event')).toBe(false);

    router.onAll(vi.fn());

    expect(router.hasHandlers('any.event')).toBe(true);
  });
});

describe('WebhookHandler', () => {
  let handler: WebhookHandler;
  const testSecret = 'test-secret';

  beforeEach(() => {
    handler = new WebhookHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register webhook source', () => {
    handler.registerSource({
      source: 'stripe',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.stripe(),
      enabled: true,
    });

    expect(handler.getSources()).toContain('stripe');
  });

  it('should remove webhook source', () => {
    handler.registerSource({
      source: 'stripe',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.stripe(),
      enabled: true,
    });

    expect(handler.removeSource('stripe')).toBe(true);
    expect(handler.getSources()).not.toContain('stripe');
  });

  it('should return 404 for unknown source', async () => {
    const result = await handler.handleRequest('unknown', '{}', {});

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.message).toContain('Unknown webhook source');
  });

  it('should return 503 for disabled source', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: false,
    });

    const result = await handler.handleRequest('test', '{}', {});

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.retryable).toBe(true);
  });

  it('should return 401 for invalid signature', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const result = await handler.handleRequest('test', '{}', {
      'x-signature': 'invalid',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.message).toBe('Invalid signature');
  });

  it('should return 401 for missing signature', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const result = await handler.handleRequest('test', '{}', {});

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.message).toBe('Missing signature');
  });

  it('should process valid webhook event', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const eventHandler = vi.fn();
    handler.getRouter().on('test.event', eventHandler);

    const payload = JSON.stringify({
      id: 'evt-123',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: { key: 'value' },
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    const result = await handler.handleRequest('test', payload, {
      'x-signature': signature,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(eventHandler).toHaveBeenCalled();
  });

  it('should detect duplicate events', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const payload = JSON.stringify({
      id: 'evt-duplicate',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    // First request
    await handler.handleRequest('test', payload, { 'x-signature': signature });

    // Duplicate request
    const result = await handler.handleRequest('test', payload, {
      'x-signature': signature,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Duplicate');
  });

  it('should check if event was processed', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const payload = JSON.stringify({
      id: 'evt-check',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    expect(handler.wasProcessed('test', 'evt-check')).toBe(false);

    await handler.handleRequest('test', payload, { 'x-signature': signature });

    expect(handler.wasProcessed('test', 'evt-check')).toBe(true);
  });

  it('should get event result', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const payload = JSON.stringify({
      id: 'evt-result',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    await handler.handleRequest('test', payload, { 'x-signature': signature });

    const result = handler.getEventResult('test', 'evt-result');

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
  });

  it('should clear event log', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const payload = JSON.stringify({
      id: 'evt-clear',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    await handler.handleRequest('test', payload, { 'x-signature': signature });

    expect(handler.wasProcessed('test', 'evt-clear')).toBe(true);

    handler.clearEventLog();

    expect(handler.wasProcessed('test', 'evt-clear')).toBe(false);
  });

  it('should skip unhandled event types with allowedEvents', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
      allowedEvents: ['allowed.event'],
    });

    const payload = JSON.stringify({
      id: 'evt-skip',
      type: 'skipped.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    const result = await handler.handleRequest('test', payload, {
      'x-signature': signature,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('not handled');
  });

  it('should handle invalid JSON payload', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const invalidPayload = 'not-json';
    const signature = createHmac('sha256', testSecret)
      .update(invalidPayload)
      .digest('hex');

    const result = await handler.handleRequest('test', invalidPayload, {
      'x-signature': signature,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('Invalid event payload');
  });

  it('should normalize header names to lowercase', async () => {
    handler.registerSource({
      source: 'test',
      secret: testSecret,
      signatureVerifier: SignatureVerifiers.hmacSha256(),
      enabled: true,
    });

    const payload = JSON.stringify({
      id: 'evt-headers',
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {},
    });

    const signature = createHmac('sha256', testSecret)
      .update(payload)
      .digest('hex');

    // Use uppercase header name
    const result = await handler.handleRequest('test', payload, {
      'X-Signature': signature,
    });

    expect(result.success).toBe(true);
  });
});

describe('createWebhookHandler factory', () => {
  it('should create handler with default options', () => {
    const handler = createWebhookHandler();

    expect(handler).toBeInstanceOf(WebhookHandler);
    expect(handler.getSources()).toHaveLength(0);
  });

  it('should create handler with sources', () => {
    const handler = createWebhookHandler({
      sources: [
        {
          source: 'stripe',
          secret: 'secret',
          signatureVerifier: SignatureVerifiers.stripe(),
          enabled: true,
        },
        {
          source: 'github',
          secret: 'secret',
          signatureVerifier: SignatureVerifiers.github(),
          enabled: true,
        },
      ],
    });

    expect(handler.getSources()).toHaveLength(2);
    expect(handler.getSources()).toContain('stripe');
    expect(handler.getSources()).toContain('github');
  });

  it('should create handler with custom event log size', () => {
    const handler = createWebhookHandler({ eventLogMaxSize: 100 });

    expect(handler).toBeInstanceOf(WebhookHandler);
  });
});

describe('EmailWebhookEvents', () => {
  it('should have delivery events', () => {
    expect(EmailWebhookEvents.DELIVERED).toBe('email.delivered');
    expect(EmailWebhookEvents.BOUNCED).toBe('email.bounced');
    expect(EmailWebhookEvents.DEFERRED).toBe('email.deferred');
    expect(EmailWebhookEvents.DROPPED).toBe('email.dropped');
  });

  it('should have engagement events', () => {
    expect(EmailWebhookEvents.OPENED).toBe('email.opened');
    expect(EmailWebhookEvents.CLICKED).toBe('email.clicked');
    expect(EmailWebhookEvents.UNSUBSCRIBED).toBe('email.unsubscribed');
  });

  it('should have compliance events', () => {
    expect(EmailWebhookEvents.SPAM_REPORT).toBe('email.spam_report');
    expect(EmailWebhookEvents.BLOCKED).toBe('email.blocked');
  });

  it('should have inbound event', () => {
    expect(EmailWebhookEvents.INBOUND).toBe('email.inbound');
  });
});
