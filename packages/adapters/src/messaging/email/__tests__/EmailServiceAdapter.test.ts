/**
 * EmailServiceAdapter Tests
 *
 * Tests the EmailServiceAdapter which bridges the EmailServicePort
 * to the OutboundEmailService and InboundEmailParser implementations.
 *
 * @see IFC-144: Email Infrastructure
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock outbound email service
const mockOutboundService = {
  sendEmail: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  sendBulkEmails: vi.fn(),
  checkDeliverability: vi.fn(),
  registerTemplate: vi.fn(),
};

// Mock inbound email parser
const mockInboundParser = {
  parse: vi.fn(),
};

vi.mock('../outbound', () => ({
  createOutboundEmailService: vi.fn(() => mockOutboundService),
  OutboundEmailService: vi.fn(),
}));

vi.mock('../inbound', () => ({
  createInboundEmailParser: vi.fn(() => mockInboundParser),
  InboundEmailParser: vi.fn(),
}));

// Mock Result from domain
vi.mock('@intelliflow/domain', () => ({
  Result: {
    ok: (value: any) => ({
      isSuccess: true,
      isFailure: false,
      value,
      error: undefined,
    }),
    fail: (error: any) => ({
      isSuccess: false,
      isFailure: true,
      value: undefined,
      error,
    }),
  },
}));

// Mock application errors
vi.mock('@intelliflow/application', () => ({
  EmailSendError: class EmailSendError extends Error {
    code = 'EMAIL_SEND_ERROR';
    constructor(msg: string) {
      super(msg);
      this.name = 'EmailSendError';
    }
  },
  EmailParseError: class EmailParseError extends Error {
    code = 'EMAIL_PARSE_ERROR';
    constructor(msg: string) {
      super(msg);
      this.name = 'EmailParseError';
    }
  },
  RateLimitExceededError: class RateLimitExceededError extends Error {
    code = 'RATE_LIMIT_EXCEEDED';
    constructor(domain: string) {
      super(`Rate limit exceeded for domain: ${domain}`);
      this.name = 'RateLimitExceededError';
    }
  },
  DeliverabilityError: class DeliverabilityError extends Error {
    code = 'DELIVERABILITY_ERROR';
    constructor(msg: string) {
      super(msg);
      this.name = 'DeliverabilityError';
    }
  },
}));

import { EmailServiceAdapter, createEmailServiceAdapter } from '../EmailServiceAdapter';

describe('EmailServiceAdapter', () => {
  let adapter: EmailServiceAdapter;

  const baseEmailOptions = {
    messageId: 'msg-001',
    from: { email: 'sender@example.com', name: 'Sender' },
    recipients: [{ email: 'recipient@example.com', name: 'Recipient', type: 'to' as const }],
    subject: 'Test Subject',
    textBody: 'Hello',
    htmlBody: '<p>Hello</p>',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new EmailServiceAdapter({ useMock: true });
  });

  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const a = new EmailServiceAdapter();
      expect(a).toBeDefined();
    });

    it('should create adapter with custom config', () => {
      const a = new EmailServiceAdapter({
        sendgridApiKey: 'sg-key',
        useMock: true,
        rateLimits: {
          maxPerSecond: 5,
          maxPerMinute: 100,
          maxPerHour: 1000,
          maxPerDay: 10000,
        },
        deliverabilityThreshold: 0.99,
      });
      expect(a).toBeDefined();
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully and return ok result', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('sent');
      expect(mockOutboundService.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should map recipients correctly', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      await adapter.sendEmail({
        ...baseEmailOptions,
        recipients: [
          { email: 'a@example.com', name: 'A', type: 'to' },
          { email: 'b@example.com', name: 'B', type: 'cc' },
          { email: 'c@example.com', type: 'bcc' },
        ],
      });

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.recipients).toHaveLength(3);
      expect(call.recipients[0]).toEqual({ email: 'a@example.com', name: 'A', type: 'to' });
      expect(call.recipients[1]).toEqual({ email: 'b@example.com', name: 'B', type: 'cc' });
      expect(call.recipients[2]).toEqual({ email: 'c@example.com', name: undefined, type: 'bcc' });
    });

    it('should default recipient type to "to"', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      await adapter.sendEmail({
        ...baseEmailOptions,
        recipients: [{ email: 'r@example.com', name: 'R' }],
      });

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.recipients[0].type).toBe('to');
    });

    it('should handle replyTo mapping', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      await adapter.sendEmail({
        ...baseEmailOptions,
        replyTo: { email: 'reply@example.com', name: 'Reply Person' },
      });

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.replyTo).toEqual({
        email: 'reply@example.com',
        name: 'Reply Person',
        type: 'to',
      });
    });

    it('should set replyTo to undefined when not provided', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      await adapter.sendEmail(baseEmailOptions);

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.replyTo).toBeUndefined();
    });

    it('should map attachments with contentDisposition default', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      await adapter.sendEmail({
        ...baseEmailOptions,
        attachments: [
          {
            filename: 'doc.pdf',
            content: 'base64data',
            contentType: 'application/pdf',
            contentId: 'cid-1',
          },
        ],
      });

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.attachments[0]).toEqual({
        filename: 'doc.pdf',
        content: 'base64data',
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
        cid: 'cid-1',
      });
    });

    it('should return RateLimitExceededError when rate limited', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        status: 'failed',
        error: 'Rate limit exceeded for domain',
      });

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('RateLimitExceededError');
    });

    it('should return EmailSendError for non-rate-limit failures', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        status: 'failed',
        error: 'Provider unavailable',
      });

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('EmailSendError');
    });

    it('should return EmailSendError with "Unknown error" when error is missing', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        status: 'failed',
      });

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('should catch exceptions and return EmailSendError', async () => {
      mockOutboundService.sendEmail.mockRejectedValue(new Error('Network failure'));

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Network failure');
    });

    it('should handle non-Error exceptions', async () => {
      mockOutboundService.sendEmail.mockRejectedValue('string error');

      const result = await adapter.sendEmail(baseEmailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('should pass tracking, priority, and scheduling options', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        messageId: 'msg-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      const scheduledAt = new Date('2026-03-01');
      await adapter.sendEmail({
        ...baseEmailOptions,
        trackOpens: false,
        trackClicks: false,
        priority: 'high',
        scheduledAt,
        headers: { 'X-Custom': 'value' },
        tags: ['promo'],
        metadata: { campaign: 'test' },
      });

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.trackOpens).toBe(false);
      expect(call.trackClicks).toBe(false);
      expect(call.priority).toBe('high');
      expect(call.scheduledAt).toBe(scheduledAt);
      expect(call.headers).toEqual({ 'X-Custom': 'value' });
      expect(call.tags).toEqual(['promo']);
      expect(call.metadata).toEqual({ campaign: 'test' });
    });

    it('should default trackOpens and trackClicks to true', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        status: 'sent',
        messageId: 'msg-001',
        provider: 'mock',
        timestamp: new Date(),
      });

      await adapter.sendEmail(baseEmailOptions);

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.trackOpens).toBe(true);
      expect(call.trackClicks).toBe(true);
    });

    it('should default priority to "normal"', async () => {
      mockOutboundService.sendEmail.mockResolvedValue({
        status: 'sent',
        messageId: 'msg-001',
        provider: 'mock',
        timestamp: new Date(),
      });

      await adapter.sendEmail(baseEmailOptions);

      const call = mockOutboundService.sendEmail.mock.calls[0][0];
      expect(call.priority).toBe('normal');
    });
  });

  describe('sendTemplatedEmail', () => {
    const templateOptions = {
      templateName: 'welcome',
      variables: { name: 'Alice', company: 'Acme' },
    };

    const emailOptions = {
      messageId: 'msg-tmpl-001',
      from: { email: 'noreply@example.com', name: 'NoReply' },
      recipients: [{ email: 'alice@example.com', name: 'Alice', type: 'to' as const }],
    };

    it('should send a templated email successfully', async () => {
      mockOutboundService.sendTemplatedEmail.mockResolvedValue({
        messageId: 'msg-tmpl-001',
        provider: 'mock',
        status: 'sent',
        timestamp: new Date(),
      });

      const result = await adapter.sendTemplatedEmail(templateOptions, emailOptions);

      expect(result.isSuccess).toBe(true);
      expect(mockOutboundService.sendTemplatedEmail).toHaveBeenCalledWith(
        'welcome',
        { name: 'Alice', company: 'Acme' },
        expect.objectContaining({
          messageId: 'msg-tmpl-001',
        })
      );
    });

    it('should return RateLimitExceededError for rate-limited templated emails', async () => {
      mockOutboundService.sendTemplatedEmail.mockResolvedValue({
        status: 'failed',
        error: 'Rate limit exceeded',
      });

      const result = await adapter.sendTemplatedEmail(templateOptions, emailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('RateLimitExceededError');
    });

    it('should return EmailSendError for other failures', async () => {
      mockOutboundService.sendTemplatedEmail.mockResolvedValue({
        status: 'failed',
        error: 'Template render failure',
      });

      const result = await adapter.sendTemplatedEmail(templateOptions, emailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('EmailSendError');
    });

    it('should catch exceptions', async () => {
      mockOutboundService.sendTemplatedEmail.mockRejectedValue(new Error('Template not found'));

      const result = await adapter.sendTemplatedEmail(templateOptions, emailOptions);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Template not found');
    });

    it('should handle replyTo in templated emails', async () => {
      mockOutboundService.sendTemplatedEmail.mockResolvedValue({
        status: 'sent',
        messageId: 'msg-001',
        provider: 'mock',
        timestamp: new Date(),
      });

      await adapter.sendTemplatedEmail(templateOptions, {
        ...emailOptions,
        replyTo: { email: 'reply@example.com', name: 'Support' },
      });

      const call = mockOutboundService.sendTemplatedEmail.mock.calls[0][2];
      expect(call.replyTo).toEqual({
        email: 'reply@example.com',
        name: 'Support',
        type: 'to',
      });
    });
  });

  describe('sendBulkEmails', () => {
    it('should send bulk emails successfully', async () => {
      const results = [
        { messageId: 'msg-1', provider: 'mock', status: 'sent', timestamp: new Date() },
        { messageId: 'msg-2', provider: 'mock', status: 'sent', timestamp: new Date() },
      ];
      mockOutboundService.sendBulkEmails.mockResolvedValue(results);

      const emails = [
        { ...baseEmailOptions, messageId: 'msg-1' },
        { ...baseEmailOptions, messageId: 'msg-2' },
      ];

      const result = await adapter.sendBulkEmails(emails, { concurrency: 2, delayMs: 50 });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
    });

    it('should pass concurrency and delay options', async () => {
      mockOutboundService.sendBulkEmails.mockResolvedValue([]);

      await adapter.sendBulkEmails([], { concurrency: 10, delayMs: 200 });

      expect(mockOutboundService.sendBulkEmails).toHaveBeenCalledWith(expect.any(Array), {
        concurrency: 10,
        delayMs: 200,
      });
    });

    it('should catch exceptions and return EmailSendError', async () => {
      mockOutboundService.sendBulkEmails.mockRejectedValue(new Error('Bulk send failed'));

      const result = await adapter.sendBulkEmails([baseEmailOptions]);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Bulk send failed');
    });

    it('should handle non-Error exceptions in bulk', async () => {
      mockOutboundService.sendBulkEmails.mockRejectedValue(42);

      const result = await adapter.sendBulkEmails([baseEmailOptions]);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });
  });

  describe('parseInboundEmail', () => {
    it('should parse a raw email and return mapped result', async () => {
      mockInboundParser.parse.mockReturnValue({
        id: 'parsed-1',
        headers: {
          messageId: 'msg-inbound-1',
          inReplyTo: undefined,
          references: [],
          subject: 'Incoming Subject',
          date: new Date('2026-01-15'),
          from: { address: 'external@example.com', name: 'External' },
          to: [{ address: 'internal@example.com', name: 'Internal' }],
          cc: [{ address: 'cc@example.com', name: 'CC Person' }],
          bcc: [{ address: 'bcc@example.com', name: 'BCC Person' }],
          replyTo: { address: 'reply@example.com', name: 'Reply' },
          dkim: 'pass',
          spf: 'pass',
          dmarc: 'pass',
        },
        textBody: 'Plain text body',
        htmlBody: '<p>HTML body</p>',
        attachments: [
          {
            filename: 'file.txt',
            content: Buffer.from('hello'),
            contentType: 'text/plain',
            isInline: false,
            contentId: 'cid-att-1',
          },
        ],
        rawSize: 5000,
        parsedAt: new Date(),
        threadId: 'thread-1',
        isReply: false,
        isForward: false,
        spamScore: 5,
        phishingIndicators: { spoofedSender: false },
        parseErrors: [],
      });

      const result = await adapter.parseInboundEmail('raw email content');

      expect(result.isSuccess).toBe(true);
      const parsed = result.value;
      expect(parsed.id).toBe('parsed-1');
      expect(parsed.headers.from.email).toBe('external@example.com');
      expect(parsed.headers.to[0].email).toBe('internal@example.com');
      expect(parsed.headers.cc[0].email).toBe('cc@example.com');
      expect(parsed.headers.bcc[0].email).toBe('bcc@example.com');
      expect(parsed.headers.replyTo.email).toBe('reply@example.com');
      expect(parsed.attachments[0].filename).toBe('file.txt');
      expect(parsed.attachments[0].contentDisposition).toBe('attachment');
      expect(parsed.threadId).toBe('thread-1');
      expect(parsed.spamScore).toBe(5);
    });

    it('should map inline attachments correctly', async () => {
      mockInboundParser.parse.mockReturnValue({
        id: 'parsed-2',
        headers: {
          messageId: 'msg-2',
          subject: 'Test',
          date: new Date(),
          from: { address: 'a@example.com', name: 'A' },
          to: [{ address: 'b@example.com', name: 'B' }],
        },
        attachments: [
          {
            filename: 'logo.png',
            content: Buffer.from('png-data'),
            contentType: 'image/png',
            isInline: true,
            contentId: 'cid-logo',
          },
        ],
        rawSize: 1000,
        parsedAt: new Date(),
        isReply: false,
        isForward: false,
      });

      const result = await adapter.parseInboundEmail('raw');

      expect(result.isSuccess).toBe(true);
      expect(result.value.attachments[0].contentDisposition).toBe('inline');
      expect(result.value.attachments[0].contentId).toBe('cid-logo');
    });

    it('should handle undefined optional headers', async () => {
      mockInboundParser.parse.mockReturnValue({
        id: 'parsed-3',
        headers: {
          messageId: 'msg-3',
          subject: 'Minimal',
          date: new Date(),
          from: { address: 'a@example.com' },
          to: [{ address: 'b@example.com' }],
          // cc, bcc, replyTo all absent
        },
        attachments: [],
        rawSize: 200,
        parsedAt: new Date(),
        isReply: false,
        isForward: false,
      });

      const result = await adapter.parseInboundEmail('minimal raw');

      expect(result.isSuccess).toBe(true);
      expect(result.value.headers.cc).toBeUndefined();
      expect(result.value.headers.bcc).toBeUndefined();
      expect(result.value.headers.replyTo).toBeUndefined();
    });

    it('should catch parse exceptions and return EmailParseError', async () => {
      mockInboundParser.parse.mockImplementation(() => {
        throw new Error('Malformed MIME');
      });

      const result = await adapter.parseInboundEmail('bad data');

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('EmailParseError');
      expect(result.error.message).toBe('Malformed MIME');
    });

    it('should handle non-Error exceptions in parse', async () => {
      mockInboundParser.parse.mockImplementation(() => {
        throw 'string error';
      });

      const result = await adapter.parseInboundEmail('bad');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('should accept Buffer input', async () => {
      mockInboundParser.parse.mockReturnValue({
        id: 'buf-1',
        headers: {
          messageId: 'msg-buf',
          subject: 'Buffer Test',
          date: new Date(),
          from: { address: 'a@example.com' },
          to: [{ address: 'b@example.com' }],
        },
        attachments: [],
        rawSize: 100,
        parsedAt: new Date(),
        isReply: false,
        isForward: false,
      });

      const result = await adapter.parseInboundEmail(Buffer.from('raw email'));

      expect(result.isSuccess).toBe(true);
      expect(mockInboundParser.parse).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });

  describe('checkDeliverability', () => {
    it('should return healthy deliverability status', async () => {
      mockOutboundService.checkDeliverability.mockResolvedValue({
        healthy: true,
        stats: {
          sent: 1000,
          delivered: 980,
          bounced: 10,
          deliverabilityRate: 0.98,
        },
        provider: 'mock',
      });

      const result = await adapter.checkDeliverability();

      expect(result.isSuccess).toBe(true);
      expect(result.value.healthy).toBe(true);
      expect(result.value.provider).toBe('mock');
    });

    it('should catch exceptions and return DeliverabilityError', async () => {
      mockOutboundService.checkDeliverability.mockRejectedValue(new Error('Provider unreachable'));

      const result = await adapter.checkDeliverability();

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe('DeliverabilityError');
      expect(result.error.message).toBe('Provider unreachable');
    });

    it('should handle non-Error exceptions', async () => {
      mockOutboundService.checkDeliverability.mockRejectedValue(null);

      const result = await adapter.checkDeliverability();

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });
  });

  describe('checkBounce', () => {
    it('should return null for basic implementation', async () => {
      const result = await adapter.checkBounce('msg-123');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('registerTemplate', () => {
    it('should delegate template registration to outbound service', () => {
      adapter.registerTemplate('welcome', {
        subject: 'Welcome {{name}}',
        html: '<h1>Hello {{name}}</h1>',
        text: 'Hello {{name}}',
      });

      expect(mockOutboundService.registerTemplate).toHaveBeenCalledWith('welcome', {
        subject: 'Welcome {{name}}',
        html: '<h1>Hello {{name}}</h1>',
        text: 'Hello {{name}}',
      });
    });
  });

  describe('validateEmail', () => {
    it('should return true for valid emails', () => {
      expect(adapter.validateEmail('user@example.com')).toBe(true);
      expect(adapter.validateEmail('test.user@sub.domain.com')).toBe(true);
      expect(adapter.validateEmail('a+b@example.org')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(adapter.validateEmail('')).toBe(false);
      expect(adapter.validateEmail('notanemail')).toBe(false);
      expect(adapter.validateEmail('@example.com')).toBe(false);
      expect(adapter.validateEmail('user@')).toBe(false);
      expect(adapter.validateEmail('user @example.com')).toBe(false);
    });
  });

  describe('createEmailServiceAdapter (factory)', () => {
    it('should create an instance with default config', () => {
      const instance = createEmailServiceAdapter();
      expect(instance).toBeInstanceOf(EmailServiceAdapter);
    });

    it('should create an instance with custom config', () => {
      const instance = createEmailServiceAdapter({
        sendgridApiKey: 'key',
        useMock: true,
      });
      expect(instance).toBeInstanceOf(EmailServiceAdapter);
    });
  });
});
