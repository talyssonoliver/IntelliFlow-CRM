/**
 * Inbound Email Router B11 Tests - covers remaining uncovered branches
 *
 * Targets:
 * - webhook: Mailgun provider path (rawEmail or '' fallback)
 * - webhook: SendGrid without headers (build minimal headers)
 * - webhook: reconstructSendGridEmail - subject, dkim, SPF headers
 * - webhook: reconstructSendGridEmail - html body fallback
 * - webhook: spam score >= 70 detection
 * - webhook: attachments processing path
 * - webhook: parser throwing error
 * - processEmail: forward without forwardTo already tested but covering edge
 * - reconstructSendGridEmail: minimal headers without each optional
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPublicContext, createTestContext } from '../../../test/setup';

// Track parse calls for controlling behavior
const mockParseFn = vi.hoisted(() => vi.fn());

vi.mock('@intelliflow/adapters', () => ({
  InboundEmailParser: class MockParser {
    parse(rawEmail: string) {
      return mockParseFn(rawEmail);
    }
  },
}));

import { inboundEmailRouter } from '../inbound.router';

function defaultParsedEmail(overrides: Record<string, any> = {}) {
  return {
    id: 'email-123',
    headers: {
      messageId: '<msg@example.com>',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'inbox@intelliflow.com', name: '' }],
      subject: 'Test Subject',
      date: new Date().toISOString(),
    },
    textBody: 'Test body',
    htmlBody: '<p>Test body</p>',
    attachments: [],
    threadId: null,
    isReply: false,
    isForward: false,
    spamScore: 10,
    ...overrides,
  };
}

describe('Inbound Email Router b11 - uncovered branches', () => {
  const publicCaller = inboundEmailRouter.createCaller(createPublicContext());
  const protectedCaller = inboundEmailRouter.createCaller(createTestContext());

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseFn.mockReturnValue(defaultParsedEmail());
  });

  describe('webhook - Mailgun provider', () => {
    it('should handle Mailgun with rawEmail', async () => {
      const result = await publicCaller.webhook({
        rawEmail: 'From: test@example.com\r\nSubject: Test\r\n\r\nBody',
        provider: 'mailgun',
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-123');
    });

    it('should handle Mailgun without rawEmail (empty string fallback)', async () => {
      const result = await publicCaller.webhook({
        provider: 'mailgun',
      });

      expect(result.success).toBe(true);
      expect(mockParseFn).toHaveBeenCalledWith('');
    });
  });

  describe('webhook - SendGrid without headers (minimal headers)', () => {
    it('should build minimal headers from individual fields', async () => {
      const result = await publicCaller.webhook({
        from: 'sender@example.com',
        to: 'inbox@intelliflow.com',
        subject: 'Minimal Test',
        text: 'Hello',
        dkim: 'v=1; a=rsa-sha256; d=example.com',
        SPF: 'pass',
        provider: 'sendgrid',
      });

      expect(result.success).toBe(true);
      // Verify the raw email was constructed with proper headers
      const rawArg = mockParseFn.mock.calls[0][0] as string;
      expect(rawArg).toContain('From: sender@example.com');
      expect(rawArg).toContain('To: inbox@intelliflow.com');
      expect(rawArg).toContain('Subject: Minimal Test');
      expect(rawArg).toContain('DKIM-Signature: v=1; a=rsa-sha256; d=example.com');
      expect(rawArg).toContain('Received-SPF: pass');
      expect(rawArg).toContain('Hello');
    });

    it('should use html body when text is not present', async () => {
      const result = await publicCaller.webhook({
        from: 'sender@example.com',
        html: '<p>HTML body</p>',
        provider: 'sendgrid',
      });

      expect(result.success).toBe(true);
      const rawArg = mockParseFn.mock.calls[0][0] as string;
      expect(rawArg).toContain('<p>HTML body</p>');
    });
  });

  describe('webhook - high spam score', () => {
    it('should log spam and return success without processing', async () => {
      mockParseFn.mockReturnValue(defaultParsedEmail({ spamScore: 85 }));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await publicCaller.webhook({
        rawEmail: 'From: spam@example.com\r\n\r\nBuy now!',
        provider: 'raw',
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-123');
      expect(warnSpy).toHaveBeenCalledWith(
        'Spam email detected',
        expect.objectContaining({ spamScore: 85 }),
      );
      warnSpy.mockRestore();
    });
  });

  describe('webhook - attachments processing', () => {
    it('should process attachments when present', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockParseFn.mockReturnValue(defaultParsedEmail({
        attachments: [
          {
            filename: 'doc.pdf',
            contentType: 'application/pdf',
            size: 1024,
            checksum: 'abc123',
          },
          {
            filename: 'image.png',
            contentType: 'image/png',
            size: 2048,
            checksum: 'def456',
          },
        ],
      }));

      const result = await publicCaller.webhook({
        rawEmail: 'From: test@example.com\r\n\r\nWith attachments',
        provider: 'raw',
      });

      expect(result.success).toBe(true);
      // processAttachments should log each attachment
      expect(logSpy).toHaveBeenCalledWith(
        'Processing attachment',
        expect.objectContaining({ filename: 'doc.pdf' }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        'Processing attachment',
        expect.objectContaining({ filename: 'image.png' }),
      );
      logSpy.mockRestore();
    });
  });

  describe('webhook - parser throws error', () => {
    it('should throw INTERNAL_SERVER_ERROR when parser fails', async () => {
      mockParseFn.mockImplementation(() => {
        throw new Error('Invalid MIME format');
      });

      await expect(
        publicCaller.webhook({
          rawEmail: 'not a valid email',
          provider: 'raw',
        }),
      ).rejects.toThrow('Failed to process inbound email');
    });
  });

  describe('webhook - SendGrid with only from (no to, subject, dkim, SPF)', () => {
    it('should build minimal headers with just from', async () => {
      const result = await publicCaller.webhook({
        from: 'only-from@example.com',
        text: 'Just from',
        provider: 'sendgrid',
      });

      expect(result.success).toBe(true);
      const rawArg = mockParseFn.mock.calls[0][0] as string;
      expect(rawArg).toContain('From: only-from@example.com');
      expect(rawArg).toContain('Content-Type: text/plain; charset=utf-8');
    });
  });

  describe('listEmails - with caseId filter', () => {
    it('should accept caseId parameter', async () => {
      const result = await protectedCaller.listEmails({
        tenantId: 'test-tenant',
        caseId: 'case-123',
        limit: 20,
        offset: 0,
      });

      expect(result.emails).toEqual([]);
    });
  });

  describe('listEmails - with threadId filter', () => {
    it('should accept threadId parameter', async () => {
      const result = await protectedCaller.listEmails({
        tenantId: 'test-tenant',
        threadId: 'thread-123',
        limit: 10,
        offset: 0,
      });

      expect(result.emails).toEqual([]);
    });
  });
});
