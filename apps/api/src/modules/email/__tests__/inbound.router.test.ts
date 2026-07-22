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
import {
  createPublicContext,
  createTestContext,
  prismaMock,
  TEST_UUIDS,
} from '../../../test/setup';

// Mock the InboundEmailParser from adapters - preserve other exports via importOriginal
vi.mock('@intelliflow/adapters', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    InboundEmailParser: class MockInboundEmailParser {
      parse(_rawEmail: string) {
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
  };
});

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
      tenantId: TEST_UUIDS.tenant,
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
      (prismaMock.emailRecord.update as any).mockResolvedValue({
        ...mockExistingEmail,
        metadata: { archived: true },
      });

      const result = await protectedCaller.processEmail({
        emailId: 'test-email-123',
        action: 'archive',
      });

      expect(result.success).toBe(true);
    });

    it('should handle spam action', async () => {
      (prismaMock.emailRecord.findFirst as any).mockResolvedValue(mockExistingEmail);
      (prismaMock.emailRecord.update as any).mockResolvedValue({
        ...mockExistingEmail,
        metadata: { spam: true },
      });

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
      (prismaMock.emailRecord.create as any).mockResolvedValue({
        ...mockExistingEmail,
        id: 'forward-record-id',
      });
      (prismaMock.emailRecord.update as any).mockResolvedValue({
        ...mockExistingEmail,
        metadata: { forwarded: true },
      });

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
      (prismaMock.emailAttachment.findFirst as any).mockResolvedValue(null);

      const result = await protectedCaller.getAttachment({
        emailId: 'test-email-123',
        attachmentId: 'test-attachment-123',
      });

      expect(result).toBeNull();
    });

    it('should issue only ONE query (emailAttachment.findFirst with tenantId) — NP-046', async () => {
      (prismaMock.emailAttachment.findFirst as any).mockResolvedValue({
        id: 'att-1',
        emailId: 'test-email-123',
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        fileUrl: 'https://storage.example.com/file.pdf',
      });

      const result = await protectedCaller.getAttachment({
        emailId: 'test-email-123',
        attachmentId: 'att-1',
      });

      // Verify a single attachment query (not two sequential queries)
      expect(prismaMock.emailAttachment.findFirst).toHaveBeenCalledTimes(1);
      expect(prismaMock.emailAttachment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'att-1',
            emailId: 'test-email-123',
          }),
        })
      );
      // emailRecord.findFirst should NOT be called separately
      expect(prismaMock.emailRecord.findFirst).not.toHaveBeenCalled();

      expect(result).not.toBeNull();
      expect(result?.filename).toBe('file.pdf');
    });
  });
});

describe('markAsRead', () => {
  const caller = inboundEmailRouter.createCaller(createTestContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a single email as read by emailId', async () => {
    (prismaMock.emailRecord.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await caller.markAsRead({
      emailId: 'test-email-123',
    });

    expect(result.success).toBe(true);
    expect(prismaMock.emailRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'test-email-123', isRead: false }),
        data: expect.objectContaining({ isRead: true }),
      })
    );
  });

  it('marks all emails in thread as read when threadId provided', async () => {
    (prismaMock.emailRecord.updateMany as any).mockResolvedValue({ count: 3 });

    const result = await caller.markAsRead({
      emailId: 'test-email-123',
      threadId: 'thread-abc',
    });

    expect(result.success).toBe(true);
    expect(prismaMock.emailRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isRead: false }),
        data: expect.objectContaining({ isRead: true }),
      })
    );
  });

  it('returns { success: true } on success', async () => {
    (prismaMock.emailRecord.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await caller.markAsRead({ emailId: 'any-id' });
    expect(result).toEqual({ success: true });
  });
});

describe('getUnreadCounts', () => {
  const caller = inboundEmailRouter.createCaller(createTestContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Inbox is now computed as two DB counts (total unread − flagged unread)
  // instead of loading every unread row and filtering in-app. Route each
  // count() call to a value by inspecting its `where`, so assertions don't
  // depend on Promise.all execution order.
  function mockCounts(values: {
    inboxTotal?: number;
    inboxFlagged?: number;
    sent?: number;
    drafts?: number;
    trash?: number;
    spam?: number;
  }) {
    (prismaMock.emailRecord.count as any).mockImplementation((args: any) => {
      const where = args?.where ?? {};
      if (Array.isArray(where.OR)) return Promise.resolve(values.inboxFlagged ?? 0);
      const path = where.metadata?.path?.[0];
      if (path === 'isDraft') return Promise.resolve(values.drafts ?? 0);
      if (path === 'isSpam') return Promise.resolve(values.spam ?? 0);
      if (path === 'isTrashed') return Promise.resolve(values.trash ?? 0);
      if (where.status) return Promise.resolve(values.sent ?? 0);
      return Promise.resolve(values.inboxTotal ?? 0); // plain {tenantId, isRead:false}
    });
  }

  it('returns zero counts for all folders when no unread emails', async () => {
    mockCounts({});

    const result = await caller.getUnreadCounts({});

    expect(result).toMatchObject({
      inbox: 0,
      sent: 0,
      drafts: 0,
      trash: 0,
      spam: 0,
    });
    // Inbox must no longer load rows into memory.
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns actual counts for each folder', async () => {
    // inbox = 5 unread total − 0 flagged = 5
    mockCounts({ inboxTotal: 5, inboxFlagged: 0, sent: 2, drafts: 1, trash: 0, spam: 0 });

    const result = await caller.getUnreadCounts({
      folders: ['inbox', 'sent', 'drafts', 'trash', 'spam'],
    });

    expect(result.inbox).toBe(5);
    expect(result.sent).toBe(2);
    expect(result.drafts).toBe(1);
    expect(result.trash).toBe(0);
    expect(result.spam).toBe(0);
  });

  it('subtracts flagged (archived/trashed/spam/draft) unread from the inbox total', async () => {
    // 10 unread, 3 of them flagged archived/trashed/spam/draft → inbox shows 7
    mockCounts({ inboxTotal: 10, inboxFlagged: 3 });

    const result = await caller.getUnreadCounts({ folders: ['inbox'] });

    expect(result.inbox).toBe(7);
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
  });

  it('inbox flagged subtraction uses positive equals:true JSON filters (missing-key safe)', async () => {
    mockCounts({ inboxTotal: 0, inboxFlagged: 0 });

    await caller.getUnreadCounts({ folders: ['inbox'] });

    const flaggedCall = (prismaMock.emailRecord.count as any).mock.calls.find((c: any[]) =>
      Array.isArray(c[0]?.where?.OR)
    );
    expect(flaggedCall?.[0].where.OR).toEqual([
      { metadata: { path: ['isArchived'], equals: true } },
      { metadata: { path: ['isTrashed'], equals: true } },
      { metadata: { path: ['isSpam'], equals: true } },
      { metadata: { path: ['isDraft'], equals: true } },
    ]);
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

describe('getRelatedMessages', () => {
  it('strips HTML tags from body to produce a plain-text preview', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      {
        id: 'email-abc',
        subject: 'Hello',
        body: '<p>Hello <strong>world</strong></p>',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);

    const caller = inboundEmailRouter.createCaller(createTestContext());
    const result = await caller.getRelatedMessages({ email: 'test@example.com' });

    expect(result).toHaveLength(1);
    expect(result[0].preview).toBe('Hello world');
    expect(result[0].subject).toBe('Hello');
    expect(result[0].receivedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns "(No preview)" when body is absent', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([
      {
        id: 'email-xyz',
        subject: 'Empty',
        body: null,
        createdAt: new Date('2025-01-02T00:00:00Z'),
      },
    ]);

    const caller = inboundEmailRouter.createCaller(createTestContext());
    const result = await caller.getRelatedMessages({ email: 'other@example.com' });

    expect(result[0].preview).toBe('(No preview)');
  });

  it('returns empty array when no matching emails exist', async () => {
    (prismaMock.emailRecord.findMany as any).mockResolvedValue([]);

    const caller = inboundEmailRouter.createCaller(createTestContext());
    const result = await caller.getRelatedMessages({ email: 'nobody@example.com' });

    expect(result).toEqual([]);
  });

  // SEC-001 (ENG-OPS-002.R01): searchContacts must scope by tenantId so an
  // authenticated user of one tenant cannot enumerate another tenant's contacts.
  describe('searchContacts — tenant isolation (SEC-001)', () => {
    it('scopes the contact query to the caller tenantId', async () => {
      (prismaMock.contact.findMany as any).mockResolvedValue([]);

      const caller = inboundEmailRouter.createCaller(createTestContext());
      await caller.searchContacts({ query: 'ali' });

      // Regression guard: the where clause MUST include the caller's tenantId.
      // Before the fix the query had no tenantId → cross-tenant leak.
      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
        })
      );
    });

    it('returns [] for short queries without hitting the database', async () => {
      (prismaMock.contact.findMany as any).mockClear();
      (prismaMock.contact.findMany as any).mockResolvedValue([]);

      const caller = inboundEmailRouter.createCaller(createTestContext());
      const result = await caller.searchContacts({ query: 'a' });

      expect(result).toEqual([]);
      expect(prismaMock.contact.findMany).not.toHaveBeenCalled();
    });
  });
});
