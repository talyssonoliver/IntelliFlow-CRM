/**
 * EmailChannel Unit Tests
 *
 * @module @intelliflow/notifications-worker/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmailChannel,
  createEmailChannel,
  type EmailPayload,
  type EmailChannelConfig,
} from '../channels/email';

// Create mock transporter with methods
const mockVerify = vi.fn();
const mockSendMail = vi.fn();
const mockClose = vi.fn();

const mockTransporter = {
  verify: mockVerify,
  sendMail: mockSendMail,
  close: mockClose,
};

const mockCreateTransport = vi.fn();

// Mock nodemailer
vi.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

// Helper to reset all mocks with default implementations
function setupDefaultMocks() {
  vi.clearAllMocks();

  mockCreateTransport.mockReturnValue(mockTransporter);
  mockVerify.mockResolvedValue(true);
  mockSendMail.mockResolvedValue({
    messageId: '<test-message-id@localhost>',
    accepted: ['test@example.com'],
    rejected: [],
    pending: [],
    response: '250 OK',
  });
  mockClose.mockResolvedValue(undefined);
}

describe('EmailChannel', () => {
  let channel: EmailChannel;
  let config: EmailChannelConfig;

  beforeEach(() => {
    setupDefaultMocks();

    config = {
      host: 'localhost',
      port: 587,
      secure: false,
      from: 'noreply@test.com',
      fromName: 'Test Sender',
      pool: true,
      maxConnections: 5,
    };

    channel = new EmailChannel(config);
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
      const customChannel = new EmailChannel(config, customLogger as any);
      expect(customChannel).toBeDefined();
    });
  });

  describe('initialize()', () => {
    it('should create transporter', async () => {
      await channel.initialize();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 587,
          secure: false,
        })
      );
    });

    it('should verify transporter connection', async () => {
      await channel.initialize();

      expect(mockVerify).toHaveBeenCalled();
    });
  });

  describe('deliver()', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should send email successfully', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test body content',
      };

      const result = await channel.deliver(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<test-message-id@localhost>');
      expect(result.accepted).toContain('test@example.com');
    });

    it('should support multiple recipients', async () => {
      const payload: EmailPayload = {
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Test Subject',
        body: 'Test body content',
      };

      const result = await channel.deliver(payload);

      expect(result.success).toBe(true);
    });

    it('should include HTML body when provided', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Plain text body',
        htmlBody: '<h1>HTML Body</h1>',
      };

      await channel.deliver(payload);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text body',
          html: '<h1>HTML Body</h1>',
        })
      );
    });

    it('should include CC and BCC recipients', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        cc: ['cc1@example.com', 'cc2@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test Subject',
        body: 'Test body',
      };

      await channel.deliver(payload);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: 'cc1@example.com, cc2@example.com',
          bcc: 'bcc@example.com',
        })
      );
    });

    it('should add correlation headers', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      };

      await channel.deliver(payload, {
        correlationId: 'corr-123',
        tenantId: 'tenant-456',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Correlation-ID': 'corr-123',
            'X-Tenant-ID': 'tenant-456',
          }),
        })
      );
    });

    it('should format from address with name', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      };

      await channel.deliver(payload);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Test Sender" <noreply@test.com>',
        })
      );
    });

    it('should throw if not initialized', async () => {
      const uninitializedChannel = new EmailChannel(config);
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Test',
      };

      await expect(uninitializedChannel.deliver(payload)).rejects.toThrow(
        'Email transporter not initialized'
      );
    });

    it('should record delivery time', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      };

      const result = await channel.deliver(payload);

      expect(result.deliveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include delivery timestamp', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      };

      const result = await channel.deliver(payload);

      expect(result.deliveredAt).toBeDefined();
      expect(new Date(result.deliveredAt).getTime()).not.toBeNaN();
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should validate email address format', async () => {
      const payload: EmailPayload = {
        to: 'invalid-email',
        subject: 'Test',
        body: 'Test',
      };

      await expect(channel.deliver(payload)).rejects.toThrow();
    });

    it('should validate subject length', async () => {
      const payload: EmailPayload = {
        to: 'valid@example.com',
        subject: 'a'.repeat(1000), // RFC 2822 limit is 998
        body: 'Test',
      };

      await expect(channel.deliver(payload)).rejects.toThrow();
    });

    it('should require non-empty subject', async () => {
      const payload: EmailPayload = {
        to: 'valid@example.com',
        subject: '',
        body: 'Test',
      };

      await expect(channel.deliver(payload)).rejects.toThrow();
    });
  });

  describe('circuit breaker', () => {
    beforeEach(async () => {
      await channel.initialize();
    });

    it('should track successful deliveries', async () => {
      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Test',
      };

      await channel.deliver(payload);
      await channel.deliver(payload);

      const stats = channel.getStats();
      expect(stats.sent).toBe(2);
      expect(stats.failed).toBe(0);
    });

    it('should track circuit breaker state', async () => {
      const stats = channel.getStats();
      expect(stats.circuitState).toBe('CLOSED');
    });

    it('should open circuit after failures', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));

      const payload: EmailPayload = {
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Test',
      };

      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        await channel.deliver(payload).catch(() => {});
      }

      const stats = channel.getStats();
      expect(stats.circuitState).toBe('OPEN');
    });
  });

  describe('getStats()', () => {
    it('should return statistics', async () => {
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
    it('should close transporter', async () => {
      await channel.initialize();
      await channel.close();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      await channel.initialize();
      await channel.close();
      await channel.close(); // Should not throw
    });
  });
});

describe('createEmailChannel', () => {
  it('should create channel with environment config', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
      EMAIL_FROM: 'test@test.com',
      EMAIL_FROM_NAME: 'Test',
    };

    const channel = createEmailChannel();
    expect(channel).toBeDefined();

    process.env = originalEnv;
  });

  it('should use defaults when env not set', () => {
    const channel = createEmailChannel();
    expect(channel).toBeDefined();
  });
});
