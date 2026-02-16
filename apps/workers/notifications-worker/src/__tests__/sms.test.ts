/**
 * SMSChannel Unit Tests
 *
 * @module @intelliflow/notifications-worker/tests
 * @task IFC-163
 * @task IFC-170
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SMSChannel,
  createSMSChannel,
  type SMSPayload,
  type SMSChannelConfig,
} from '../channels/sms';

// Mock Twilio - the Twilio class constructor must return an object with messages.create
const mockCreate = vi.fn();

vi.mock('twilio', () => {
  return {
    Twilio: class MockTwilio {
      messages = { create: mockCreate };
      constructor() {}
    },
  };
});

describe('SMSChannel', () => {
  let channel: SMSChannel;
  let config: SMSChannelConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreate.mockResolvedValue({
      sid: 'SM1234567890abcdef1234567890abcdef',
      status: 'queued',
      numSegments: '1',
      price: null,
    });

    config = {
      provider: 'mock',
      from: '+15551234567',
    };

    channel = new SMSChannel(config);
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
      const customChannel = new SMSChannel(config, customLogger as any);
      expect(customChannel).toBeDefined();
    });
  });

  describe('initialize()', () => {
    it('should initialize mock provider without credentials', async () => {
      await expect(channel.initialize()).resolves.not.toThrow();
    });

    it('should throw if non-mock provider has no credentials', async () => {
      const twilioConfig: SMSChannelConfig = {
        provider: 'twilio',
        from: '+15551234567',
      };
      const twilioChannel = new SMSChannel(twilioConfig);

      await expect(twilioChannel.initialize()).rejects.toThrow('SMS provider credentials required');
    });
  });

  describe('deliver()', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should send SMS successfully via mock', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      const result = await channel.deliver(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.status).toBe('delivered');
    });

    it('should record delivery time', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      const result = await channel.deliver(payload);

      expect(result.deliveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include delivery timestamp', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      const result = await channel.deliver(payload);

      expect(result.deliveredAt).toBeDefined();
      expect(new Date(result.deliveredAt).getTime()).not.toBeNaN();
    });

    it('should calculate segment count', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'A'.repeat(200), // > 160 chars = 2 segments
      };

      const result = await channel.deliver(payload);

      expect(result.segmentCount).toBe(2);
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should reject phone number too short', async () => {
      const payload = {
        to: '12345',
        body: 'Test',
      } as SMSPayload;

      await expect(channel.deliver(payload)).rejects.toThrow();
    });

    it('should reject empty body', async () => {
      const payload = {
        to: '+15559876543',
        body: '',
      } as SMSPayload;

      await expect(channel.deliver(payload)).rejects.toThrow();
    });

    it('should reject body exceeding 1600 chars', async () => {
      const payload = {
        to: '+15559876543',
        body: 'A'.repeat(1601),
      } as SMSPayload;

      await expect(channel.deliver(payload)).rejects.toThrow();
    });
  });

  describe('Twilio provider', () => {
    let twilioChannel: SMSChannel;

    beforeEach(async () => {
      vi.clearAllMocks();

      mockCreate.mockResolvedValue({
        sid: 'SM1234567890abcdef1234567890abcdef',
        status: 'queued',
        numSegments: '1',
        price: null,
      });

      const twilioConfig: SMSChannelConfig = {
        provider: 'twilio',
        accountSid: 'AC_test_sid',
        authToken: 'test_auth_token',
        from: '+15551234567',
        statusCallbackUrl: 'https://example.com/status',
      };

      twilioChannel = new SMSChannel(twilioConfig);
      await twilioChannel.initialize();
    });

    afterEach(async () => {
      await twilioChannel.close();
    });

    it('should send SMS via Twilio', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Hello from Twilio',
      };

      const result = await twilioChannel.deliver(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('SM1234567890abcdef1234567890abcdef');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+15559876543',
          body: 'Hello from Twilio',
          from: '+15551234567',
          statusCallback: 'https://example.com/status',
        })
      );
    });

    it('should handle Twilio API errors', async () => {
      mockCreate.mockRejectedValue(
        Object.assign(new Error('Invalid phone number'), {
          code: 21211,
          moreInfo: 'https://www.twilio.com/docs/errors/21211',
        })
      );

      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      const result = await twilioChannel.deliver(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid phone number');
    });

    it('should map Twilio failed status', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SMfailed',
        status: 'failed',
        numSegments: '1',
        price: null,
      });

      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      const result = await twilioChannel.deliver(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('circuit breaker', () => {
    let twilioChannel: SMSChannel;

    beforeEach(async () => {
      vi.clearAllMocks();

      mockCreate.mockResolvedValue({
        sid: 'SM1234567890abcdef1234567890abcdef',
        status: 'queued',
        numSegments: '1',
        price: null,
      });

      const twilioConfig: SMSChannelConfig = {
        provider: 'twilio',
        accountSid: 'AC_test_sid',
        authToken: 'test_auth_token',
        from: '+15551234567',
      };

      twilioChannel = new SMSChannel(twilioConfig);
      await twilioChannel.initialize();
    });

    afterEach(async () => {
      await twilioChannel.close();
    });

    it('should track successful deliveries', async () => {
      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      await twilioChannel.deliver(payload);
      await twilioChannel.deliver(payload);

      const stats = twilioChannel.getStats();
      expect(stats.sent).toBe(2);
      expect(stats.failed).toBe(0);
    });

    it('should track circuit breaker state', () => {
      const stats = twilioChannel.getStats();
      expect(stats.circuitState).toBe('CLOSED');
    });

    it('should open circuit after failures', async () => {
      mockCreate.mockRejectedValue(new Error('Provider down'));

      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      // Trigger 5 failures to open circuit (threshold is 5)
      for (let i = 0; i < 5; i++) {
        await twilioChannel.deliver(payload);
      }

      const stats = twilioChannel.getStats();
      expect(stats.circuitState).toBe('OPEN');
    });

    it('should track failed deliveries', async () => {
      mockCreate.mockRejectedValue(new Error('Provider down'));

      const payload: SMSPayload = {
        to: '+15559876543',
        body: 'Test message',
      };

      await twilioChannel.deliver(payload);

      const stats = twilioChannel.getStats();
      expect(stats.failed).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('should return statistics', () => {
      const stats = channel.getStats();

      expect(stats).toHaveProperty('sent');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('circuitState');
    });

    it('should return zero counts initially', () => {
      const stats = channel.getStats();

      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('close()', () => {
    it('should close without error', async () => {
      await expect(channel.close()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await channel.close();
      await channel.close(); // Should not throw
    });
  });
});

describe('createSMSChannel', () => {
  it('should create channel with environment config', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token123',
      SMS_FROM: '+15551112222',
      SMS_STATUS_CALLBACK_URL: 'https://example.com/callback',
    };

    const channel = createSMSChannel();
    expect(channel).toBeDefined();

    process.env = originalEnv;
  });

  it('should default to mock provider when env not set', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.SMS_PROVIDER;

    const channel = createSMSChannel();
    expect(channel).toBeDefined();

    process.env = originalEnv;
  });
});
