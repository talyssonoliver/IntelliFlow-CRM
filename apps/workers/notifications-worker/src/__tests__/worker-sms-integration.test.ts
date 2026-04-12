/**
 * NotificationsWorker SMS Integration Tests
 *
 * Tests the wiring of SMSChannel into NotificationsWorker.
 * The SMSChannel itself is tested in sms.test.ts (26 tests).
 * This file tests the worker-level routing, lifecycle, and health reporting.
 *
 * @module @intelliflow/notifications-worker/tests
 * @task IFC-222
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock twilio before any imports
const mockCreate = vi.fn();
vi.mock('twilio', () => ({
  Twilio: class MockTwilio {
    messages = { create: mockCreate };
  },
}));

// Mock worker-shared to suppress Redis/BullMQ connections
vi.mock('@intelliflow/worker-shared', () => {
  class MockBaseWorker {
    protected logger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    protected queueNames: string[] = [];
    constructor(opts: { name: string; queues: string[] }) {
      this.queueNames = opts.queues;
    }
    async start() {
      await (this as any).onStart();
    }
    async stop() {
      await (this as any).onStop();
    }
  }

  return {
    BaseWorker: MockBaseWorker,
    getRedisConfig: vi.fn().mockReturnValue({}),
  };
});

// Mock nodemailer to prevent email channel from failing
vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi
      .fn()
      .mockResolvedValue({ messageId: 'mock-email-id', accepted: ['test@test.com'], rejected: [] }),
    verify: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  }),
}));

import { NotificationsWorker, QUEUE_NAMES, type NotificationJob } from '../main';

function createSMSJob(overrides: Partial<NotificationJob> = {}): NotificationJob {
  return {
    notificationId: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    channel: 'SMS',
    priority: 'NORMAL',
    recipient: {
      phone: '+15559876543',
    },
    content: {
      body: 'Test SMS message',
    },
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

describe('NotificationsWorker — SMS integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      sid: 'SM1234567890abcdef1234567890abcdef',
      status: 'queued',
      numSegments: '1',
      price: null,
    });
  });

  describe('constructor queue config', () => {
    it('should NOT include SMS queue when enableSMS is false/unset', () => {
      const worker = new NotificationsWorker({ enableSMS: false });
      expect(worker['queueNames']).not.toContain(QUEUE_NAMES.SMS);
    });

    it('should include SMS queue when enableSMS is true', () => {
      const worker = new NotificationsWorker({ enableSMS: true });
      expect(worker['queueNames']).toContain(QUEUE_NAMES.SMS);
    });
  });

  describe('onStart() — SMS channel init', () => {
    it('should NOT initialize smsChannel when enableSMS is false', async () => {
      const worker = new NotificationsWorker({ enableSMS: false, enableEmail: false });
      await worker.start();
      expect(worker['smsChannel']).toBeNull();
      await worker.stop();
    });

    it('should initialize SMSChannel when enableSMS is true', async () => {
      const worker = new NotificationsWorker({ enableSMS: true, enableEmail: false });
      await worker.start();
      expect(worker['smsChannel']).not.toBeNull();
      await worker.stop();
    });

    it('should degrade gracefully if SMS initialize() throws', async () => {
      // Override SMS_PROVIDER to trigger credential validation failure
      const origProvider = process.env.SMS_PROVIDER;
      const origSid = process.env.TWILIO_ACCOUNT_SID;
      const origToken = process.env.TWILIO_AUTH_TOKEN;
      process.env.SMS_PROVIDER = 'twilio';
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.SMS_ACCOUNT_SID;
      delete process.env.SMS_AUTH_TOKEN;

      const worker = new NotificationsWorker({ enableSMS: true, enableEmail: false });
      // Should not throw — should degrade gracefully
      await expect(worker.start()).resolves.not.toThrow();
      expect(worker['smsChannel']).toBeNull();

      // Restore env
      if (origProvider !== undefined) process.env.SMS_PROVIDER = origProvider;
      else delete process.env.SMS_PROVIDER;
      if (origSid !== undefined) process.env.TWILIO_ACCOUNT_SID = origSid;
      if (origToken !== undefined) process.env.TWILIO_AUTH_TOKEN = origToken;

      await worker.stop();
    });
  });

  describe('onStop() — cleanup', () => {
    it('should close smsChannel if initialized', async () => {
      const worker = new NotificationsWorker({ enableSMS: true, enableEmail: false });
      await worker.start();
      const smsChannel = worker['smsChannel'];
      expect(smsChannel).not.toBeNull();
      const closeSpy = vi.spyOn(smsChannel!, 'close');
      await worker.stop();
      expect(closeSpy).toHaveBeenCalled();
      expect(worker['smsChannel']).toBeNull();
    });

    it('should not error if smsChannel was never initialized', async () => {
      const worker = new NotificationsWorker({ enableSMS: false, enableEmail: false });
      await worker.start();
      await expect(worker.stop()).resolves.not.toThrow();
    });
  });

  describe('deliverSMS()', () => {
    let worker: NotificationsWorker;

    beforeEach(async () => {
      worker = new NotificationsWorker({ enableSMS: true, enableEmail: false });
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should return error when smsChannel is null', async () => {
      // Create a worker without SMS enabled
      const noSmsWorker = new NotificationsWorker({ enableSMS: false, enableEmail: false });
      await noSmsWorker.start();

      const notification = createSMSJob();
      const result = await noSmsWorker['deliverSMS'](notification, Date.now());

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMS channel not initialized');

      await noSmsWorker.stop();
    });

    it('should return error when phone is missing', async () => {
      const notification = createSMSJob({
        recipient: {},
      });
      const result = await worker['deliverSMS'](notification, Date.now());

      expect(result.success).toBe(false);
      expect(result.error).toBe('No phone number provided');
    });

    it('should call smsChannel.deliver with correct SMSPayload on success', async () => {
      const deliverSpy = vi.spyOn(worker['smsChannel']!, 'deliver');

      const notification = createSMSJob();
      const result = await worker['deliverSMS'](notification, Date.now());

      expect(result.success).toBe(true);
      expect(deliverSpy).toHaveBeenCalledWith(
        { to: '+15559876543', body: 'Test SMS message' },
        expect.objectContaining({
          correlationId: notification.notificationId,
          tenantId: notification.tenantId,
        })
      );
    });

    it('should return success result with providerResponse containing messageId', async () => {
      const notification = createSMSJob();
      const result = await worker['deliverSMS'](notification, Date.now());

      expect(result.success).toBe(true);
      expect(result.providerResponse).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
        })
      );
      expect(result.deliveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should increment failedByChannel.sms on channel failure and return error', async () => {
      vi.spyOn(worker['smsChannel']!, 'deliver').mockResolvedValue({
        success: false,
        status: 'failed',
        error: 'Twilio API error',
        deliveredAt: new Date().toISOString(),
        deliveryTimeMs: 10,
      });

      const notification = createSMSJob();
      const result = await worker['deliverSMS'](notification, Date.now());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Twilio API error');
      expect(worker['failedByChannel'].sms).toBeGreaterThan(0);
    });
  });

  describe('getDependencyHealth() — SMS component', () => {
    it('should report degraded with SMS channel disabled when enableSMS is false', async () => {
      const worker = new NotificationsWorker({ enableSMS: false, enableEmail: false });
      await worker.start();

      const health = await worker['getDependencyHealth']();
      expect(health.sms.status).toBe('degraded');
      expect(health.sms.message).toContain('SMS channel disabled');

      await worker.stop();
    });

    it('should report circuit state from smsChannel.getStats() when enabled', async () => {
      const worker = new NotificationsWorker({ enableSMS: true, enableEmail: false });
      await worker.start();

      const health = await worker['getDependencyHealth']();
      expect(health.sms.status).toBe('ok');
      expect(health.sms.message).toContain('Circuit:');
      expect(health.sms.message).toContain('CLOSED');

      await worker.stop();
    });
  });
});
