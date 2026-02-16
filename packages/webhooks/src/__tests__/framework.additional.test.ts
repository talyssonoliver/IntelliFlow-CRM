import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookFramework,
  createWebhookFramework,
  hmacSha256Verify,
  defaultEventTransformer,
  stripeEventTransformer,
  sendgridEventTransformer,
  type WebhookSourceConfig,
} from '../framework';
import { createHmac } from 'crypto';

function makeSource(ov: Partial<WebhookSourceConfig> = {}): WebhookSourceConfig {
  return {
    name: ov.name ?? 'test-src',
    secret: ov.secret ?? 'secret123',
    signatureHeader: ov.signatureHeader ?? 'x-signature',
    signatureVerifier: ov.signatureVerifier ?? hmacSha256Verify,
    enabled: ov.enabled ?? true,
    allowedEvents: ov.allowedEvents,
    eventTransformer: ov.eventTransformer,
  };
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('WebhookFramework additional', () => {
  let fw: WebhookFramework;
  beforeEach(() => {
    fw = createWebhookFramework({ metricsEnabled: true, loggingEnabled: false });
  });

  describe('retry processing', () => {
    it('processRetries returns stats', async () => {
      const r = await fw.processRetries();
      expect(r.processed).toBe(0);
      expect(r.succeeded).toBe(0);
      expect(r.failed).toBe(0);
    });

    it('retries failed events', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      let callCount = 0;
      fw.on('retry.evt', async () => {
        callCount++;
        if (callCount === 1) throw new Error('fail once');
      });
      const body = JSON.stringify({ id: 'retry1', type: 'retry.evt' });
      const sig = sign(body, 'secret123');
      const r1 = await fw.handle('s', body, { 'x-signature': sig });
      expect(r1.statusCode).toBe(500);
    });
  });

  describe('dead letter queue', () => {
    it('getDeadLetterEntries returns array', () => {
      expect(fw.getDeadLetterEntries()).toEqual([]);
    });

    it('reprocessDeadLetter returns false for unknown', async () => {
      expect(await fw.reprocessDeadLetter('unknown')).toBe(false);
    });
  });

  describe('metrics tracking', () => {
    it('tracks failed events', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('fail.evt', async () => {
        throw new Error('boom');
      });
      const body = JSON.stringify({ id: 'f1', type: 'fail.evt' });
      await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      const m = fw.getMetrics();
      expect(m.eventsFailed).toBeGreaterThanOrEqual(1);
    });

    it('tracks eventsByType', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('typed.evt', vi.fn().mockResolvedValue(undefined));
      const body = JSON.stringify({ id: 'te1', type: 'typed.evt' });
      await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      expect(fw.getMetrics().eventsByType['typed.evt']).toBe(1);
    });

    it('tracks averageProcessingTimeMs', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('time.evt', vi.fn().mockResolvedValue(undefined));
      const body = JSON.stringify({ id: 'time1', type: 'time.evt' });
      await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      expect(fw.getMetrics().averageProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('no handlers registered', () => {
    it('returns 200 with no handlers message', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const body = JSON.stringify({ id: 'nh1', type: 'no.handler' });
      const r = await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      expect(r.statusCode).toBe(200);
      expect(r.message).toContain('No handlers');
    });
  });

  describe('wildcard handler', () => {
    it('star handler receives events', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      const h = vi.fn().mockResolvedValue(undefined);
      fw.on('*', h);
      const body = JSON.stringify({ id: 'w1', type: 'any.type' });
      await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      expect(h).toHaveBeenCalled();
    });
  });

  describe('custom event transformer', () => {
    it('uses source eventTransformer', async () => {
      const transformer = (raw: unknown) => {
        const d = raw as any;
        return {
          id: d.custom_id,
          type: d.custom_type,
          source: 'custom',
          timestamp: new Date(),
          version: '1.0',
          payload: d,
        };
      };
      fw.registerSource(makeSource({ name: 's', eventTransformer: transformer }));
      fw.on('custom.type', vi.fn().mockResolvedValue(undefined));
      const body = JSON.stringify({ custom_id: 'c1', custom_type: 'custom.type' });
      const r = await fw.handle('s', body, { 'x-signature': sign(body, 'secret123') });
      expect(r.statusCode).toBe(200);
    });
  });

  describe('defaultEventTransformer edge cases', () => {
    it('generates id from hash when missing', () => {
      const e = defaultEventTransformer({ data: 'test' });
      expect(e.id).toBeTruthy();
      expect(e.type).toBe('unknown');
    });

    it('uses event_type field', () => {
      const e = defaultEventTransformer({ event_type: 'my.type' });
      expect(e.type).toBe('my.type');
    });
  });

  describe('sendgridEventTransformer edge cases', () => {
    it('generates id from hash when sg_message_id missing', () => {
      const e = sendgridEventTransformer({ event: 'open' });
      expect(e.id).toBeTruthy();
      expect(e.type).toBe('email.open');
    });
  });

  describe('header normalization', () => {
    it('normalizes header keys to lowercase', async () => {
      fw.registerSource(makeSource({ name: 's' }));
      fw.on('norm.evt', vi.fn().mockResolvedValue(undefined));
      const body = JSON.stringify({ id: 'n1', type: 'norm.evt' });
      const sig = sign(body, 'secret123');
      const r = await fw.handle('s', body, { 'X-Signature': sig });
      expect(r.statusCode).toBe(200);
    });
  });
});
