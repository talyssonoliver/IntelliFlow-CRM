import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Result } from '@intelliflow/domain';
import { RealNotificationServiceAdapter } from '../RealNotificationServiceAdapter';
import type { EmailServiceAdapter } from '../../messaging/email/EmailServiceAdapter';
import type { EmailSendResult } from '../../messaging/email/outbound';

function createMockEmailAdapter(overrides: Partial<EmailServiceAdapter> = {}): EmailServiceAdapter {
  const defaultResult: EmailSendResult = {
    messageId: 'test-msg-123',
    provider: 'mock',
    status: 'sent',
    timestamp: new Date('2026-03-07T00:00:00Z'),
  };

  return {
    sendEmail: vi.fn().mockResolvedValue(Result.ok(defaultResult)),
    sendTemplatedEmail: vi.fn().mockResolvedValue(Result.ok(defaultResult)),
    sendBulkEmails: vi.fn().mockResolvedValue(Result.ok([defaultResult])),
    parseInboundEmail: vi.fn(),
    checkDeliverability: vi.fn(),
    checkBounce: vi.fn(),
    registerTemplate: vi.fn(),
    validateEmail: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as EmailServiceAdapter;
}

describe('RealNotificationServiceAdapter', () => {
  let adapter: RealNotificationServiceAdapter;
  let mockEmailAdapter: EmailServiceAdapter;

  beforeEach(() => {
    mockEmailAdapter = createMockEmailAdapter();
    adapter = new RealNotificationServiceAdapter(mockEmailAdapter, {
      fromAddress: 'noreply@intelliflow.com',
      fromName: 'IntelliFlow',
    });
  });

  describe('sendEmail()', () => {
    it('maps to → recipients correctly', async () => {
      const result = await adapter.sendEmail({
        to: ['user@example.com'],
        subject: 'Test',
        textBody: 'Hello',
      });

      expect(result.isSuccess).toBe(true);
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [{ email: 'user@example.com', type: 'to' }],
        })
      );
    });

    it('injects configured from address', async () => {
      await adapter.sendEmail({
        to: ['user@example.com'],
        subject: 'Test',
        textBody: 'Hello',
      });

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { email: 'noreply@intelliflow.com', name: 'IntelliFlow' },
        })
      );
    });

    it('maps cc and bcc fields correctly', async () => {
      await adapter.sendEmail({
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test',
        textBody: 'Hello',
      });

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            { email: 'to@example.com', type: 'to' },
            { email: 'cc@example.com', type: 'cc' },
            { email: 'bcc@example.com', type: 'bcc' },
          ],
        })
      );
    });

    it('maps subject, htmlBody, textBody through', async () => {
      await adapter.sendEmail({
        to: ['user@example.com'],
        subject: 'My Subject',
        htmlBody: '<p>Hello</p>',
        textBody: 'Hello',
      });

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'My Subject',
          htmlBody: '<p>Hello</p>',
          textBody: 'Hello',
        })
      );
    });

    it('maps attachments correctly', async () => {
      await adapter.sendEmail({
        to: ['user@example.com'],
        subject: 'Test',
        textBody: 'Hello',
        attachments: [
          {
            filename: 'doc.pdf',
            content: 'base64content',
            contentType: 'application/pdf',
          },
        ],
      });

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'doc.pdf',
              content: 'base64content',
              contentType: 'application/pdf',
            },
          ],
        })
      );
    });

    it('returns Result.fail when to array is empty', async () => {
      const result = await adapter.sendEmail({
        to: [],
        subject: 'Test',
        textBody: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Recipients list is empty');
      expect(mockEmailAdapter.sendEmail).not.toHaveBeenCalled();
    });

    it('propagates Result.fail from underlying EmailServiceAdapter', async () => {
      const { EmailSendError } = await import('@intelliflow/application');
      mockEmailAdapter = createMockEmailAdapter({
        sendEmail: vi.fn().mockResolvedValue(Result.fail(new EmailSendError('Provider rejected'))),
      });
      adapter = new RealNotificationServiceAdapter(mockEmailAdapter, {
        fromAddress: 'noreply@intelliflow.com',
      });

      const result = await adapter.sendEmail({
        to: ['user@example.com'],
        subject: 'Test',
        textBody: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Provider rejected');
    });
  });

  describe('sendSms()', () => {
    it('returns Result.fail with SMS not configured message', async () => {
      const result = await adapter.sendSms({
        to: '+1234567890',
        message: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('SMS not configured');
    });
  });

  describe('sendPush()', () => {
    it('returns Result.fail with Push not configured message', async () => {
      const result = await adapter.sendPush({
        userId: 'user-1',
        title: 'Test',
        body: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Push not configured');
    });
  });

  describe('schedule()', () => {
    it('calls sendEmail() immediately for email channel', async () => {
      const result = await adapter.schedule('email', new Date('2026-04-01T00:00:00Z'), {
        to: ['user@example.com'],
        subject: 'Scheduled',
        textBody: 'Hello',
      });

      expect(result.isSuccess).toBe(true);
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalled();
      const scheduled = result.value;
      expect(scheduled.channel).toBe('email');
      expect(scheduled.status).toBe('sent');
    });

    it('returns fail for non-email channel', async () => {
      const result = await adapter.schedule('sms', new Date('2026-04-01T00:00:00Z'), {
        to: '+1234567890',
        message: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('sms scheduling not configured');
    });

    it('propagates email send failure', async () => {
      const { EmailSendError } = await import('@intelliflow/application');
      mockEmailAdapter = createMockEmailAdapter({
        sendEmail: vi.fn().mockResolvedValue(Result.fail(new EmailSendError('Network error'))),
      });
      adapter = new RealNotificationServiceAdapter(mockEmailAdapter, {
        fromAddress: 'noreply@intelliflow.com',
      });

      const result = await adapter.schedule('email', new Date('2026-04-01T00:00:00Z'), {
        to: ['user@example.com'],
        subject: 'Fail',
        textBody: 'Hello',
      });

      expect(result.isFailure).toBe(true);
    });
  });

  describe('cancelScheduled()', () => {
    it('returns Result.ok(undefined)', async () => {
      const result = await adapter.cancelScheduled('notif-123');
      expect(result.isSuccess).toBe(true);
    });
  });

  describe('getStatus()', () => {
    it('returns pending status', async () => {
      const result = await adapter.getStatus('notif-123');
      expect(result.isSuccess).toBe(true);
      const status = result.value;
      expect(status.id).toBe('notif-123');
      expect(status.status).toBe('pending');
    });
  });

  describe('sendBatch()', () => {
    it('sends all email items and collects results', async () => {
      const result = await adapter.sendBatch([
        { channel: 'email', options: { to: ['a@example.com'], subject: 'A', textBody: 'A' } },
        { channel: 'email', options: { to: ['b@example.com'], subject: 'B', textBody: 'B' } },
      ]);

      expect(result.isSuccess).toBe(true);
      const results = result.value;
      expect(results).toHaveLength(2);
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('returns fail when batch contains sms item', async () => {
      const result = await adapter.sendBatch([
        { channel: 'sms', options: { to: '+1234567890', message: 'Hello' } },
      ]);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('SMS not configured');
    });

    it('returns fail when batch contains push item', async () => {
      const result = await adapter.sendBatch([
        { channel: 'push', options: { userId: 'u1', title: 'Test', body: 'Hello' } },
      ]);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Push not configured');
    });
  });

  describe('validateEmail()', () => {
    it('delegates to emailAdapter', () => {
      adapter.validateEmail('test@example.com');
      expect(mockEmailAdapter.validateEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('validatePhoneNumber()', () => {
    it('validates E.164 format', () => {
      expect(adapter.validatePhoneNumber('+1234567890')).toBe(true);
      expect(adapter.validatePhoneNumber('+447911123456')).toBe(true);
      expect(adapter.validatePhoneNumber('1234567890')).toBe(false);
      expect(adapter.validatePhoneNumber('+0123456789')).toBe(false);
      expect(adapter.validatePhoneNumber('')).toBe(false);
    });
  });
});
