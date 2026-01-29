/**
 * Email Service Adapter
 * Implements EmailServicePort using outbound and inbound email services
 * Bridges hexagonal architecture ports to concrete implementations
 *
 * @see IFC-144: Email Infrastructure
 */

import { Result } from '@intelliflow/domain';
import type {
  EmailServicePort,
  OutboundEmailOptions,
  EmailSendResult,
  ParsedEmail,
  DeliverabilityStats,
  BounceInfo,
  TemplateRenderOptions,
} from '@intelliflow/application';
import {
  EmailSendError,
  EmailParseError,
  RateLimitExceededError,
  DeliverabilityError,
} from '@intelliflow/application';
import {
  OutboundEmailService,
  createOutboundEmailService,
  type OutboundEmail,
} from './outbound';
import { InboundEmailParser, createInboundEmailParser } from './inbound';

/**
 * Email Service Adapter Configuration
 */
export interface EmailServiceAdapterConfig {
  sendgridApiKey?: string;
  useMock?: boolean;
  rateLimits?: {
    maxPerSecond: number;
    maxPerMinute: number;
    maxPerHour: number;
    maxPerDay: number;
  };
  deliverabilityThreshold?: number;
}

/**
 * Email Service Adapter
 * Implements the EmailServicePort interface
 */
export class EmailServiceAdapter implements EmailServicePort {
  private outboundService: OutboundEmailService;
  private inboundParser: InboundEmailParser;

  constructor(config: EmailServiceAdapterConfig = {}) {
    this.outboundService = createOutboundEmailService({
      sendgridApiKey: config.sendgridApiKey,
      useMock: config.useMock,
      rateLimits: config.rateLimits,
    });
    this.inboundParser = createInboundEmailParser();
  }

  async sendEmail(
    options: OutboundEmailOptions
  ): Promise<Result<EmailSendResult, EmailSendError | RateLimitExceededError>> {
    try {
      // Map port options to outbound email format
      const email: OutboundEmail = {
        messageId: options.messageId,
        from: {
          email: options.from.email,
          name: options.from.name,
          type: 'to',
        },
        replyTo: options.replyTo
          ? {
              email: options.replyTo.email,
              name: options.replyTo.name,
              type: 'to',
            }
          : undefined,
        recipients: options.recipients.map(r => ({
          email: r.email,
          name: r.name,
          type: r.type || 'to',
        })),
        subject: options.subject,
        textBody: options.textBody,
        htmlBody: options.htmlBody,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentDisposition: a.contentDisposition || 'attachment',
          cid: a.contentId,
        })),
        headers: options.headers,
        tags: options.tags,
        metadata: options.metadata,
        trackOpens: options.trackOpens ?? true,
        trackClicks: options.trackClicks ?? true,
        priority: options.priority || 'normal',
        scheduledAt: options.scheduledAt,
      };

      const result = await this.outboundService.sendEmail(email);

      if (result.status === 'failed') {
        if (result.error?.includes('Rate limit')) {
          return Result.fail(
            new RateLimitExceededError(options.from.email.split('@')[1])
          );
        }
        return Result.fail(new EmailSendError(result.error || 'Unknown error'));
      }

      return Result.ok(result);
    } catch (error) {
      return Result.fail(
        new EmailSendError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendTemplatedEmail(
    template: TemplateRenderOptions,
    emailOptions: Omit<OutboundEmailOptions, 'subject' | 'htmlBody' | 'textBody'>
  ): Promise<Result<EmailSendResult, EmailSendError | RateLimitExceededError>> {
    try {
      const result = await this.outboundService.sendTemplatedEmail(
        template.templateName,
        template.variables,
        {
          messageId: emailOptions.messageId,
          from: {
            email: emailOptions.from.email,
            name: emailOptions.from.name,
            type: 'to',
          },
          replyTo: emailOptions.replyTo
            ? {
                email: emailOptions.replyTo.email,
                name: emailOptions.replyTo.name,
                type: 'to',
              }
            : undefined,
          recipients: emailOptions.recipients.map(r => ({
            email: r.email,
            name: r.name,
            type: r.type || 'to',
          })),
          attachments: emailOptions.attachments?.map(a => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
            contentDisposition: a.contentDisposition || 'attachment',
            cid: a.contentId,
          })),
          headers: emailOptions.headers,
          tags: emailOptions.tags,
          metadata: emailOptions.metadata,
          trackOpens: emailOptions.trackOpens ?? true,
          trackClicks: emailOptions.trackClicks ?? true,
          priority: emailOptions.priority || 'normal',
          scheduledAt: emailOptions.scheduledAt,
        }
      );

      if (result.status === 'failed') {
        if (result.error?.includes('Rate limit')) {
          return Result.fail(
            new RateLimitExceededError(emailOptions.from.email.split('@')[1])
          );
        }
        return Result.fail(new EmailSendError(result.error || 'Unknown error'));
      }

      return Result.ok(result);
    } catch (error) {
      return Result.fail(
        new EmailSendError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendBulkEmails(
    emails: OutboundEmailOptions[],
    options?: { concurrency?: number; delayMs?: number }
  ): Promise<Result<EmailSendResult[], EmailSendError>> {
    try {
      const outboundEmails: OutboundEmail[] = emails.map(e => ({
        messageId: e.messageId,
        from: { email: e.from.email, name: e.from.name, type: 'to' },
        replyTo: e.replyTo
          ? { email: e.replyTo.email, name: e.replyTo.name, type: 'to' }
          : undefined,
        recipients: e.recipients.map(r => ({
          email: r.email,
          name: r.name,
          type: r.type || 'to',
        })),
        subject: e.subject,
        textBody: e.textBody,
        htmlBody: e.htmlBody,
        attachments: e.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentDisposition: a.contentDisposition || 'attachment',
          cid: a.contentId,
        })),
        headers: e.headers,
        tags: e.tags,
        metadata: e.metadata,
        trackOpens: e.trackOpens ?? true,
        trackClicks: e.trackClicks ?? true,
        priority: e.priority || 'normal',
        scheduledAt: e.scheduledAt,
      }));

      const results = await this.outboundService.sendBulkEmails(outboundEmails, options);

      return Result.ok(results);
    } catch (error) {
      return Result.fail(
        new EmailSendError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async parseInboundEmail(
    rawEmail: string | Buffer
  ): Promise<Result<ParsedEmail, EmailParseError>> {
    try {
      const parsed = this.inboundParser.parse(rawEmail);

      // Map to port interface
      const result: ParsedEmail = {
        id: parsed.id,
        headers: {
          messageId: parsed.headers.messageId,
          inReplyTo: parsed.headers.inReplyTo,
          references: parsed.headers.references,
          subject: parsed.headers.subject,
          date: parsed.headers.date,
          from: {
            email: parsed.headers.from.address,
            name: parsed.headers.from.name,
          },
          to: parsed.headers.to.map(t => ({
            email: t.address,
            name: t.name,
          })),
          cc: parsed.headers.cc?.map(c => ({
            email: c.address,
            name: c.name,
          })),
          bcc: parsed.headers.bcc?.map(b => ({
            email: b.address,
            name: b.name,
          })),
          replyTo: parsed.headers.replyTo
            ? {
                email: parsed.headers.replyTo.address,
                name: parsed.headers.replyTo.name,
              }
            : undefined,
          dkim: parsed.headers.dkim,
          spf: parsed.headers.spf,
          dmarc: parsed.headers.dmarc,
        },
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        attachments: parsed.attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentDisposition: a.isInline ? 'inline' : 'attachment',
          contentId: a.contentId,
        })),
        rawSize: parsed.rawSize,
        parsedAt: parsed.parsedAt,
        threadId: parsed.threadId,
        isReply: parsed.isReply,
        isForward: parsed.isForward,
        spamScore: parsed.spamScore,
        phishingIndicators: parsed.phishingIndicators,
        parseErrors: parsed.parseErrors,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.fail(
        new EmailParseError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async checkDeliverability(): Promise<
    Result<
      {
        healthy: boolean;
        stats: DeliverabilityStats;
        provider: string;
      },
      DeliverabilityError
    >
  > {
    try {
      const result = await this.outboundService.checkDeliverability();
      return Result.ok(result);
    } catch (error) {
      return Result.fail(
        new DeliverabilityError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async checkBounce(messageId: string): Promise<Result<BounceInfo | null, EmailSendError>> {
    try {
      // This would call the provider's bounce check API
      // For now, return null (not implemented in basic providers)
      return Result.ok(null);
    } catch (error) {
      return Result.fail(
        new EmailSendError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  registerTemplate(
    name: string,
    template: { subject: string; html: string; text?: string }
  ): void {
    this.outboundService.registerTemplate(name, template);
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Factory function to create EmailServiceAdapter
 */
export function createEmailServiceAdapter(
  config: EmailServiceAdapterConfig = {}
): EmailServiceAdapter {
  return new EmailServiceAdapter(config);
}

// Re-export domain errors for convenience
export { EmailSendError, EmailParseError, RateLimitExceededError, DeliverabilityError };
