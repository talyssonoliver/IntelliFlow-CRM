import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OutboundEmailService,
  MockEmailProvider,
  SendGridProvider,
  EmailRateLimiter,
  EmailTemplateRenderer,
  createOutboundEmailService,
  type OutboundEmail,
  type EmailRecipient,
  type EmailProvider,
} from '../outbound';

describe('OutboundEmailService', () => {
  describe('MockEmailProvider', () => {
    it('should send email successfully', async () => {
      const provider = new MockEmailProvider();
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', name: 'Sender', type: 'to' },
        recipients: [
          { email: 'recipient@example.com', name: 'Recipient', type: 'to' },
        ],
        subject: 'Test Email',
        htmlBody: '<p>Hello World</p>',
        textBody: 'Hello World',
      };

      const result = await provider.send(email);

      expect(result.status).toBe('sent');
      expect(result.provider).toBe('mock');
      expect(result.messageId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should track sent emails', async () => {
      const provider = new MockEmailProvider();
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', name: 'Sender', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Test',
        textBody: 'Test',
      };

      await provider.send(email);
      const sent = provider.getSentEmails();

      expect(sent).toHaveLength(1);
      expect(sent[0].email.subject).toBe('Test');
    });

    it('should clear sent emails', async () => {
      const provider = new MockEmailProvider();
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Test',
        textBody: 'Test',
      };

      await provider.send(email);
      provider.clearSentEmails();
      const sent = provider.getSentEmails();

      expect(sent).toHaveLength(0);
    });

    it('should report deliverability stats', async () => {
      const provider = new MockEmailProvider();
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Test',
        textBody: 'Test',
      };

      await provider.send(email);
      const stats = await provider.getDeliverabilityStats();

      expect(stats.deliverabilityRate).toBeGreaterThanOrEqual(0.95); // KPI: >=95%
      expect(stats.sent).toBeGreaterThan(0);
      expect(stats.delivered).toBeGreaterThan(0);
    });
  });

  describe('EmailRateLimiter', () => {
    it('should allow sending within limits', async () => {
      const limiter = new EmailRateLimiter({
        maxPerSecond: 10,
        maxPerMinute: 300,
        maxPerHour: 5000,
        maxPerDay: 50000,
      });

      const allowed = await limiter.acquire('example.com');
      expect(allowed).toBe(true);
    });

    it('should block sending when rate limit exceeded', async () => {
      const limiter = new EmailRateLimiter({
        maxPerSecond: 2,
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 1000,
      });

      // Use up the limit
      await limiter.acquire('example.com');
      await limiter.acquire('example.com');

      // Third attempt should be blocked
      const allowed = await limiter.acquire('example.com');
      expect(allowed).toBe(false);
    });

    it('should reset limits after time window', async () => {
      const limiter = new EmailRateLimiter({
        maxPerSecond: 1,
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 1000,
      });

      await limiter.acquire('example.com');

      // Wait for window to reset (simulate)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const allowed = await limiter.acquire('example.com');
      expect(allowed).toBe(true);
    });

    it('should track limits per domain', async () => {
      const limiter = new EmailRateLimiter({
        maxPerSecond: 1,
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 1000,
      });

      await limiter.acquire('domain1.com');
      const allowed = await limiter.acquire('domain2.com');

      expect(allowed).toBe(true); // Different domain, should be allowed
    });
  });

  describe('EmailTemplateRenderer', () => {
    it('should register and render templates', () => {
      const renderer = new EmailTemplateRenderer();
      renderer.registerTemplate('welcome', {
        subject: 'Welcome {{name}}!',
        html: '<h1>Hello {{name}}</h1>',
        text: 'Hello {{name}}',
      });

      const rendered = renderer.render('welcome', { name: 'John' });

      expect(rendered.subject).toBe('Welcome John!');
      expect(rendered.htmlBody).toBe('<h1>Hello John</h1>');
      expect(rendered.textBody).toBe('Hello John');
    });

    it('should throw error for unknown template', () => {
      const renderer = new EmailTemplateRenderer();

      expect(() => {
        renderer.render('unknown', {});
      }).toThrow('Template not found: unknown');
    });

    it('should handle missing variables gracefully', () => {
      const renderer = new EmailTemplateRenderer();
      renderer.registerTemplate('test', {
        subject: 'Hi {{name}}',
        html: '<p>{{greeting}}</p>',
      });

      const rendered = renderer.render('test', { name: 'John' });

      expect(rendered.subject).toBe('Hi John');
      expect(rendered.htmlBody).toBe('<p></p>'); // Missing variable becomes empty
    });
  });

  describe('OutboundEmailService Integration', () => {
    let service: OutboundEmailService;
    let mockProvider: MockEmailProvider;

    beforeEach(() => {
      mockProvider = new MockEmailProvider();
      service = new OutboundEmailService({
        providers: [mockProvider],
        deliverabilityThreshold: 0.95,
      });
    });

    it('should send email successfully', async () => {
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Integration Test',
        htmlBody: '<p>Test</p>',
        textBody: 'Test',
      };

      const result = await service.sendEmail(email);

      expect(result.status).toBe('sent');
      expect(result.messageId).toBeDefined();
    });

    it('should validate email schema', async () => {
      const invalidEmail = {
        from: { email: 'invalid-email', type: 'to' },
        recipients: [],
        subject: '',
      } as OutboundEmail;

      await expect(service.sendEmail(invalidEmail)).rejects.toThrow();
    });

    it('should enforce rate limits', async () => {
      const limiter = new EmailRateLimiter({
        maxPerSecond: 1,
        maxPerMinute: 2,
        maxPerHour: 10,
        maxPerDay: 100,
      });

      service = new OutboundEmailService({
        providers: [mockProvider],
        rateLimiter: limiter,
      });

      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Rate Limit Test',
        textBody: 'Test',
      };

      // First email should succeed
      const result1 = await service.sendEmail(email);
      expect(result1.status).toBe('sent');

      // Second email should be rate limited
      const result2 = await service.sendEmail(email);
      expect(result2.status).toBe('failed');
      expect(result2.error).toContain('Rate limit exceeded');
    });

    it('should send templated emails', async () => {
      service.registerTemplate('test', {
        subject: 'Hello {{name}}',
        html: '<p>Welcome {{name}}</p>',
        text: 'Welcome {{name}}',
      });

      const result = await service.sendTemplatedEmail(
        'test',
        { name: 'Alice' },
        {
          from: { email: 'sender@example.com', type: 'to' },
          recipients: [{ email: 'alice@example.com', type: 'to' }],
        }
      );

      expect(result.status).toBe('sent');

      const sent = mockProvider.getSentEmails();
      expect(sent[0].email.subject).toBe('Hello Alice');
      expect(sent[0].email.htmlBody).toBe('<p>Welcome Alice</p>');
    });

    it('should send bulk emails', async () => {
      const emails: OutboundEmail[] = Array.from({ length: 10 }, (_, i) => ({
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: `user${i}@example.com`, type: 'to' }],
        subject: `Bulk Email ${i}`,
        textBody: `Message ${i}`,
      }));

      const results = await service.sendBulkEmails(emails, {
        concurrency: 3,
        delayMs: 50,
      });

      expect(results).toHaveLength(10);
      expect(results.every(r => r.status === 'sent')).toBe(true);
    });

    it('should check deliverability health', async () => {
      const health = await service.checkDeliverability();

      expect(health.healthy).toBe(true); // Mock provider has 98% deliverability
      expect(health.stats.deliverabilityRate).toBeGreaterThanOrEqual(0.95);
      expect(health.provider).toBe('mock');
    });

    it('should failover to next provider on error', async () => {
      const failingProvider: EmailProvider = {
        name: 'failing',
        async send() {
          throw new Error('Provider error');
        },
        async getDeliverabilityStats() {
          return {
            sent: 0,
            delivered: 0,
            bounced: 0,
            complained: 0,
            opened: 0,
            clicked: 0,
            deliverabilityRate: 0,
            period: { start: new Date(), end: new Date() },
          };
        },
        async checkBounce() {
          return null;
        },
      };

      service = new OutboundEmailService({
        providers: [failingProvider, mockProvider],
      });

      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Failover Test',
        textBody: 'Test',
      };

      const result = await service.sendEmail(email);

      // Should failover to mock provider
      expect(result.status).toBe('sent');
      expect(result.provider).toBe('mock');
    });
  });

  describe('SendGridProvider', () => {
    it('should construct proper payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: async () => '',
      });

      const provider = new SendGridProvider('fake-api-key');
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', name: 'Sender', type: 'to' },
        recipients: [
          { email: 'to@example.com', name: 'To User', type: 'to' },
          { email: 'cc@example.com', name: 'CC User', type: 'cc' },
        ],
        subject: 'Test Email',
        htmlBody: '<p>Hello</p>',
        textBody: 'Hello',
        trackOpens: true,
        trackClicks: true,
        tags: ['test'],
        metadata: { campaign: 'test-campaign' },
      };

      await provider.send(email);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer fake-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const provider = new SendGridProvider('fake-api-key');
      const email: OutboundEmail = {
        from: { email: 'sender@example.com', type: 'to' },
        recipients: [{ email: 'recipient@example.com', type: 'to' }],
        subject: 'Test',
        textBody: 'Test',
      };

      const result = await provider.send(email);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('SendGrid API error');
    });
  });

  describe('Factory Function', () => {
    it('should create service with mock provider in development', () => {
      process.env.NODE_ENV = 'development';
      const service = createOutboundEmailService();

      expect(service).toBeInstanceOf(OutboundEmailService);
    });

    it('should create service with SendGrid provider when API key provided', () => {
      const service = createOutboundEmailService({
        sendgridApiKey: 'fake-api-key',
      });

      expect(service).toBeInstanceOf(OutboundEmailService);
    });

    it('should use mock provider when useMock is true', () => {
      const service = createOutboundEmailService({
        useMock: true,
        sendgridApiKey: 'fake-api-key', // Should be ignored
      });

      expect(service).toBeInstanceOf(OutboundEmailService);
    });
  });
});
