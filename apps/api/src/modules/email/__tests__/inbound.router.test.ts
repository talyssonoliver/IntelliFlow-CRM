/**
 * Inbound Email Router Tests
 *
 * Tests for inbound email webhook handling - IFC-144
 *
 * Tests cover:
 * - Webhook endpoint receiving emails from SendGrid/Mailgun/Postmark
 * - Email parsing and validation
 * - Spam detection
 * - Idempotency handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPublicContext, createTestContext, prismaMock } from '../../../test/setup';

// Mock the InboundEmailParser from adapters - class must be inline
vi.mock('@intelliflow/adapters', () => ({
  InboundEmailParser: class MockInboundEmailParser {
    parse(rawEmail: string) {
      return {
        id: 'parsed-email-123',
        headers: {
          messageId: '<msg-123@example.com>',
          from: { address: 'sender@example.com', name: 'Sender Name' },
          to: [{ address: 'inbox@intelliflow.com', name: '' }],
          subject: 'Test Email Subject',
          date: new Date().toISOString(),
        },
        textBody: 'Test email body text',
        htmlBody: '<p>Test email body</p>',
        attachments: [],
        threadId: null,
        isReply: false,
        isForward: false,
        spamScore: 10, // Low spam score
      };
    }
  },
}));

// Import after mock is set up
import { inboundEmailRouter } from '../inbound.router';

describe('Inbound Email Router', () => {
  // Public caller for webhook endpoint (no auth required)
  const publicCaller = inboundEmailRouter.createCaller(createPublicContext());
  // Authenticated caller for protected endpoints
  const protectedCaller = inboundEmailRouter.createCaller(createTestContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('webhook', () => {
    describe('SendGrid format', () => {
      it('should accept valid SendGrid webhook payload', async () => {
        const payload = {
          from: 'sender@example.com',
          to: 'inbox@intelliflow.com',
          subject: 'Test Email',
          text: 'Hello World',
          headers: 'From: sender@example.com\r\nTo: inbox@intelliflow.com\r\nSubject: Test Email',
          provider: 'sendgrid' as const,
        };

        const result = await publicCaller.webhook(payload);

        expect(result.success).toBe(true);
        expect(result.emailId).toBeDefined();
        expect(result.emailId).toBe('parsed-email-123');
      });

      it('should accept SendGrid payload without explicit provider', async () => {
        const payload = {
          from: 'sender@example.com',
          to: 'inbox@intelliflow.com',
          subject: 'Test Email',
          text: 'Hello World',
          headers: 'From: sender@example.com\r\nTo: inbox@intelliflow.com',
        };

        const result = await publicCaller.webhook(payload);

        expect(result.success).toBe(true);
        expect(result.emailId).toBeDefined();
      });

      it('should handle SendGrid payload with HTML body', async () => {
        const payload = {
          from: 'sender@example.com',
          to: 'inbox@intelliflow.com',
          subject: 'HTML Test',
          html: '<h1>Hello</h1><p>World</p>',
          headers: 'Content-Type: text/html',
          provider: 'sendgrid' as const,
        };

        const result = await publicCaller.webhook(payload);

        expect(result.success).toBe(true);
      });
    });

    describe('Raw email format', () => {
      it('should accept raw email payload', async () => {
        const rawEmail = `From: sender@example.com
To: inbox@intelliflow.com
Subject: Test Email
Content-Type: text/plain

Hello World`;

        const payload = {
          rawEmail,
          provider: 'raw' as const,
        };

        const result = await publicCaller.webhook(payload);

        expect(result.success).toBe(true);
        expect(result.emailId).toBeDefined();
      });
    });

    describe('Error handling', () => {
      it('should reject payload with no recognizable format', async () => {
        const payload = {
          // No rawEmail, no headers, no recognized provider
          someOtherField: 'value',
        };

        // Router wraps the error in INTERNAL_SERVER_ERROR when re-throwing
        await expect(publicCaller.webhook(payload as any)).rejects.toThrow();
      });
    });

    describe('Spam filtering', () => {
      it('should accept emails with spam score in payload', async () => {
        const payload = {
          from: 'sender@example.com',
          to: 'inbox@intelliflow.com',
          subject: 'Test Email with Spam Score',
          text: 'Normal email content',
          spam_score: '2.5',
          headers: 'From: sender@example.com',
          provider: 'sendgrid' as const,
        };

        // Should process successfully
        const result = await publicCaller.webhook(payload);

        expect(result.success).toBe(true);
        expect(result.emailId).toBeDefined();
      });
    });
  });

  describe('getEmail', () => {
    it('should return null for non-existent email', async () => {
      const result = await protectedCaller.getEmail({ emailId: 'non-existent-id' });

      expect(result).toBeNull();
    });
  });

  describe('listEmails', () => {
    it('should return empty list when no emails exist', async () => {
      (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.emailRecord.count as any).mockResolvedValue(0);

      const result = await protectedCaller.listEmails({

        limit: 20,
        offset: 0,
      });

      expect(result.emails).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should support pagination parameters', async () => {
      (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.emailRecord.count as any).mockResolvedValue(0);

      const result = await protectedCaller.listEmails({

        limit: 10,
        offset: 5,
      });

      expect(result).toBeDefined();
    });
  });

  describe('processEmail', () => {
    const mockExistingEmail = {
      id: 'test-email-123',
      tenantId: 'test-tenant-id',
      messageId: '<msg-123@example.com>',
      fromEmail: 'sender@example.com',
      toEmail: 'inbox@intelliflow.com',
      subject: 'Test',
      textBody: 'test',
      htmlBody: null,
      status: 'received',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should handle archive action', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);
      (prismaMock.emailRecord.update as any).mockResolvedValue({ ...mockExistingEmail, metadata: { archived: true } });

      const result = await protectedCaller.processEmail({
        emailId: 'test-email-123',
        action: 'archive',
      });

      expect(result.success).toBe(true);
    });

    it('should handle spam action', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);
      (prismaMock.emailRecord.update as any).mockResolvedValue({ ...mockExistingEmail, metadata: { spam: true } });

      const result = await protectedCaller.processEmail({
        emailId: 'test-email-123',
        action: 'spam',
      });

      expect(result.success).toBe(true);
    });

    it('should handle delete action', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);
      (prismaMock.emailRecord.delete as any).mockResolvedValue(mockExistingEmail);

      const result = await protectedCaller.processEmail({
        emailId: 'test-email-123',
        action: 'delete',
      });

      expect(result.success).toBe(true);
    });

    it('should require forwardTo for forward action', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);

      await expect(
        protectedCaller.processEmail({
          emailId: 'test-email-123',
          action: 'forward',
          // Missing forwardTo
        })
      ).rejects.toThrow('Forward address required');
    });

    it('should accept forward action with valid email', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);
      (prismaMock.emailRecord.update as any).mockResolvedValue({ ...mockExistingEmail, metadata: { forwarded: true } });

      const result = await protectedCaller.processEmail({
        emailId: 'test-email-123',
        action: 'forward',
        forwardTo: 'recipient@example.com',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getThread', () => {
    it('should return thread with empty emails for new thread', async () => {
      (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);

      const result = await protectedCaller.getThread({
        threadId: 'test-thread-123',
        limit: 20,
      });

      expect(result.threadId).toBe('test-thread-123');
      expect(result.emails).toEqual([]);
      expect(result.participantCount).toBe(0);
    });
  });

  describe('getAttachment', () => {
    it('should return null for non-existent attachment', async () => {
      const result = await protectedCaller.getAttachment({
        emailId: 'test-email-123',
        attachmentId: 'test-attachment-123',
      });

      expect(result).toBeNull();
    });
  });
});

describe('Inbound Email Router - Integration with AppRouter', () => {
  it('should be accessible via appRouter.email namespace', async () => {
    // Dynamic import to avoid circular dependencies
    const { appRouter } = await import('../../../router.js');

    // Verify the email router is properly integrated
    expect(appRouter._def.record.email).toBeDefined();
  });
});
