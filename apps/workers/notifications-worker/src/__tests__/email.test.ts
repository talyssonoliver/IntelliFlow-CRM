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

    it('should set SMTP socket timeouts so verify() cannot hang — issue #26', async () => {
      await channel.initialize();

      // Without these, transporter.verify() hangs forever when the SMTP host is
      // unreachable (Railway → smtp.resend.com), wedging worker startup.
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeout: expect.any(Number),
          greetingTimeout: expect.any(Number),
          socketTimeout: expect.any(Number),
        })
      );
    });

    it('should start in degraded mode (not throw) when SMTP verify fails — issue #319', async () => {
      mockVerify.mockRejectedValueOnce(
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1025'), { code: 'ESOCKET' })
      );

      // The worker must still start (SMS/webhook work) instead of crash-looping;
      // initialize() catches the verify error and degrades.
      await expect(channel.initialize()).resolves.toBeUndefined();
      expect(mockCreateTransport).toHaveBeenCalled();
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

describe('EmailChannel - Resend HTTP transport', () => {
  const resendConfig: EmailChannelConfig = {
    host: 'unused',
    port: 0,
    secure: false,
    from: 'crm@leangency.com',
    fromName: 'IntelliFlow CRM',
    provider: 'resend',
    apiKey: 're_test_key',
    apiBaseUrl: 'https://api.resend.com',
    requestTimeoutMs: 5000,
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupDefaultMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initialize() does not create an SMTP transporter or call verify()', async () => {
    const channel = new EmailChannel(resendConfig);
    await channel.initialize();

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('deliver() POSTs to the Resend API and returns success with the message id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend-msg-123' }),
      text: async () => '',
    });

    const channel = new EmailChannel(resendConfig);
    await channel.initialize();

    const result = await channel.deliver(
      {
        to: 'user@example.com',
        subject: 'Hi',
        body: 'Hello',
        htmlBody: '<p>Hello</p>',
      },
      { correlationId: 'c1', tenantId: 't1' }
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('resend-msg-123');
    expect(result.accepted).toContain('user@example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('IntelliFlow CRM <crm@leangency.com>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Hi');
    expect(body.text).toBe('Hello');
    expect(body.html).toBe('<p>Hello</p>');
    expect(body.headers['X-Correlation-ID']).toBe('c1');
    expect(body.headers['X-Tenant-ID']).toBe('t1');
  });

  it('maps cc, bcc, replyTo and attachments into the Resend payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'r-attach-1' }),
      text: async () => '',
    });

    const channel = new EmailChannel(resendConfig);
    await channel.initialize();

    const result = await channel.deliver({
      to: ['a@example.com', 'b@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      replyTo: 'reply@example.com',
      subject: 'Attach',
      body: 'See attachment',
      attachments: [{ filename: 'note.txt', content: Buffer.from('hello') }],
    });

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['a@example.com', 'b@example.com']);
    expect(body.cc).toEqual(['cc@example.com']);
    expect(body.bcc).toEqual(['bcc@example.com']);
    expect(body.reply_to).toBe('reply@example.com');
    expect(body.attachments[0].filename).toBe('note.txt');
    expect(body.attachments[0].content).toBe(Buffer.from('hello').toString('base64'));
  });

  it('deliver() returns a failure result on a non-ok Resend response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () => 'invalid `from` field',
    });

    const channel = new EmailChannel(resendConfig);
    await channel.initialize();

    const result = await channel.deliver({
      to: 'user@example.com',
      subject: 'Hi',
      body: 'Hello',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('422');
    expect(result.rejected).toContain('user@example.com');
  });

  it('degrades (does not throw, does not call fetch) when apiKey is missing', async () => {
    const channel = new EmailChannel({ ...resendConfig, apiKey: undefined });

    await expect(channel.initialize()).resolves.toBeUndefined();

    const result = await channel.deliver({
      to: 'user@example.com',
      subject: 'Hi',
      body: 'Hello',
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('selects the Resend HTTP transport when RESEND_API_KEY is set — issue #26', async () => {
    const originalEnv = process.env;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'r-factory-1' }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: 're_factory_key',
      RESEND_FROM_EMAIL: 'crm@leangency.com',
      // Pin the sender name so the assertion is deterministic regardless of the
      // ambient EMAIL_FROM_NAME (.env.test sets "IntelliFlow CRM (Test)").
      EMAIL_FROM_NAME: 'IntelliFlow CRM',
    };

    try {
      const channel = createEmailChannel();
      await channel.initialize();
      const result = await channel.deliver({ to: 'u@example.com', subject: 'S', body: 'B' });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_factory_key');
      const body = JSON.parse(init.body as string);
      expect(body.from).toBe('IntelliFlow CRM <crm@leangency.com>');
    } finally {
      process.env = originalEnv;
      vi.unstubAllGlobals();
    }
  });
});
