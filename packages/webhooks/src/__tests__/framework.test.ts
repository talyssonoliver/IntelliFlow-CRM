import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookFramework,
  createWebhookFramework,
  hmacSha256Verify,
  githubVerify,
  stripeVerify,
  defaultEventTransformer,
  stripeEventTransformer,
  sendgridEventTransformer,
  type WebhookSourceConfig,
  type EventHandler,
} from '../framework';
import { createHmac } from 'node:crypto';

function makeSource(overrides: Partial<WebhookSourceConfig> = {}): WebhookSourceConfig {
  return {
    name: overrides.name ?? 'test-src',
    secret: overrides.secret ?? 'secret123',
    signatureHeader: overrides.signatureHeader ?? 'x-signature',
    signatureVerifier: overrides.signatureVerifier ?? hmacSha256Verify,
    enabled: overrides.enabled ?? true,
    allowedEvents: overrides.allowedEvents,
    eventTransformer: overrides.eventTransformer,
  };
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('WebhookFramework', () => {
  let fw: WebhookFramework;

  beforeEach(() => {
    fw = createWebhookFramework({ metricsEnabled: true, loggingEnabled: false });
  });

  describe('source registration', () => {
    it('register and get sources', () => {
      fw.registerSource(makeSource({ name: 's1' }));
      fw.registerSource(makeSource({ name: 's2' }));
      expect(fw.getSources()).toEqual(['s1', 's2']);
    });
    it('unregister', () => {
      fw.registerSource(makeSource({ name: 's1' }));
      expect(fw.unregisterSource('s1')).toBe(true);
      expect(fw.unregisterSource('s1')).toBe(false);
      expect(fw.getSources()).toEqual([]);
    });
  });

  describe('handle', () => {
    it('404 unknown source', async () => {
      const r = await fw.handle('unknown', '{}', {});
      expect(r.statusCode).toBe(404);
      expect(r.success).toBe(false);
    });

    it('503 disabled source', async () => {
      fw.registerSource(makeSource({ name: 'dis', enabled: false }));
      const r = await fw.handle('dis', '{}', {});
      expect(r.statusCode).toBe(503);
    });

    it('413 large payload', async () => {
      const small = createWebhookFramework({ maxPayloadSize: 10, loggingEnabled: false });
      small.registerSource(makeSource({ name: 's' }));
      const r = await small.handle('s', 'x'.repeat(20), {});
      expect(r.statusCode).toBe(413);
    });

    it('401 invalid signature', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const r = await fw.handle('s', '{}', { 'x-signature': 'bad' });
      expect(r.statusCode).toBe(401);
      expect(r.message).toContain('Invalid signature');
    });

    it('401 missing signature', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const r = await fw.handle('s', '{}', {});
      expect(r.statusCode).toBe(401);
      expect(r.message).toContain('Missing signature');
    });

    it('400 invalid JSON', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const body = 'not json';
      const sig = signPayload(body, 'secret123');
      const r = await fw.handle('s', body, { 'x-signature': sig });
      expect(r.statusCode).toBe(400);
    });

    it('200 valid event processed', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const handler = vi.fn().mockResolvedValue(undefined);
      fw.on('test.event', handler);
      const body = JSON.stringify({ id: 'e1', type: 'test.event' });
      const sig = signPayload(body, 'secret123');
      const r = await fw.handle('s', body, { 'x-signature': sig });
      expect(r.statusCode).toBe(200);
      expect(r.success).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('200 ignored event type', async () => {
      fw.registerSource(makeSource({ name: 's', allowedEvents: ['allowed'] }));
      const body = JSON.stringify({ id: 'e2', type: 'blocked' });
      const sig = signPayload(body, 'secret123');
      const r = await fw.handle('s', body, { 'x-signature': sig });
      expect(r.statusCode).toBe(200);
      expect(r.message).toContain('ignored');
    });

    it('200 duplicate event (idempotency)', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('dup.event', vi.fn());
      const body = JSON.stringify({ id: 'dup1', type: 'dup.event' });
      const sig = signPayload(body, 'secret123');
      await fw.handle('s', body, { 'x-signature': sig });
      const r2 = await fw.handle('s', body, { 'x-signature': sig });
      expect(r2.statusCode).toBe(200);
      expect(r2.message).toContain('Duplicate');
    });

    it('500 handler error', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('err.event', vi.fn().mockRejectedValue(new Error('boom')));
      const body = JSON.stringify({ id: 'err1', type: 'err.event' });
      const sig = signPayload(body, 'secret123');
      const r = await fw.handle('s', body, { 'x-signature': sig });
      expect(r.statusCode).toBe(500);
      expect(r.message).toContain('boom');
    });
  });

  describe('handlers', () => {
    it('on/off/onAll', () => {
      const h: EventHandler = vi.fn();
      fw.on('evt', h);
      expect(fw.off('evt', h as any)).toBe(true);
      expect(fw.off('evt', h as any)).toBe(false);
      expect(fw.off('no-evt', h as any)).toBe(false);
    });
    it('onAll receives all events', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const allHandler = vi.fn().mockResolvedValue(undefined);
      fw.onAll(allHandler);
      const body = JSON.stringify({ id: 'g1', type: 'global.evt' });
      const sig = signPayload(body, 'secret123');
      await fw.handle('s', body, { 'x-signature': sig });
      expect(allHandler).toHaveBeenCalled();
    });
  });

  describe('middleware', () => {
    it('executes in order', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const order: number[] = [];
      fw.use(async (_e, _c, next) => {
        order.push(1);
        await next();
        order.push(3);
      });
      fw.on('mw.evt', async () => {
        order.push(2);
      });
      const body = JSON.stringify({ id: 'mw1', type: 'mw.evt' });
      const sig = signPayload(body, 'secret123');
      await fw.handle('s', body, { 'x-signature': sig });
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('metrics', () => {
    it('tracks events', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('m.evt', vi.fn().mockResolvedValue(undefined));
      const body = JSON.stringify({ id: 'me1', type: 'm.evt' });
      const sig = signPayload(body, 'secret123');
      await fw.handle('s', body, { 'x-signature': sig });
      const m = fw.getMetrics();
      expect(m.eventsReceived).toBeGreaterThanOrEqual(1);
      expect(m.eventsProcessed).toBeGreaterThanOrEqual(1);
      expect(m.eventsBySource['s']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cleanup', () => {
    it('returns cleanup count', () => {
      const r = fw.cleanup();
      expect(r).toHaveProperty('idempotencyRemoved');
      expect(typeof r.idempotencyRemoved).toBe('number');
    });
  });

  describe('expressHandler', () => {
    it('creates handler function', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('exp.evt', vi.fn().mockResolvedValue(undefined));
      const handler = fw.expressHandler();
      const body = JSON.stringify({ id: 'ex1', type: 'exp.evt' });
      const sig = signPayload(body, 'secret123');
      const res = await handler({
        params: { source: 's' },
        body,
        headers: { 'x-signature': sig },
        ip: '127.0.0.1',
      });
      expect(res.status).toBe(200);
      expect((res.json as any).success).toBe(true);
    });
  });
});

describe('signature verifiers', () => {
  it('hmacSha256Verify valid', () => {
    const sig = createHmac('sha256', 's').update('body').digest('hex');
    expect(hmacSha256Verify('body', sig, 's')).toBe(true);
  });
  it('hmacSha256Verify invalid', () => {
    expect(hmacSha256Verify('body', 'bad', 's')).toBe(false);
  });
  it('githubVerify valid', () => {
    const hash = createHmac('sha256', 'gs').update('body').digest('hex');
    expect(githubVerify('body', 'sha256=' + hash, 'gs')).toBe(true);
  });
  it('githubVerify no prefix', () => {
    expect(githubVerify('body', 'nope', 'gs')).toBe(false);
  });
  it('stripeVerify valid', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const hash = createHmac('sha256', 'ss')
      .update(ts + '.' + 'body')
      .digest('hex');
    expect(stripeVerify('body', 't=' + ts + ',v1=' + hash, 'ss')).toBe(true);
  });
  it('stripeVerify expired', () => {
    const ts = (Math.floor(Date.now() / 1000) - 400).toString();
    const hash = createHmac('sha256', 'ss')
      .update(ts + '.' + 'body')
      .digest('hex');
    expect(stripeVerify('body', 't=' + ts + ',v1=' + hash, 'ss')).toBe(false);
  });
});

describe('event transformers', () => {
  it('defaultEventTransformer', () => {
    const e = defaultEventTransformer({ id: 'e1', type: 't1', data: { x: 1 } });
    expect(e.id).toBe('e1');
    expect(e.type).toBe('t1');
  });
  it('stripeEventTransformer', () => {
    const e = stripeEventTransformer({
      id: 'si1',
      type: 'charge.succeeded',
      created: 1700000000,
      data: {},
      livemode: false,
    });
    expect(e.source).toBe('stripe');
    expect(e.id).toBe('si1');
  });
  it('sendgridEventTransformer', () => {
    const e = sendgridEventTransformer({
      sg_message_id: 'sg1',
      event: 'delivered',
      timestamp: 1700000000,
    });
    expect(e.source).toBe('sendgrid');
    expect(e.type).toBe('email.delivered');
  });
});
