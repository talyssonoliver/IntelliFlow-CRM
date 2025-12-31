import { Result, DomainError } from '@intelliflow/domain';

/**
 * Email Service Port
 * Defines the contract for email operations (outbound and inbound)
 * Implementation lives in adapters layer
 *
 * @see IFC-144: Email Infrastructure with SPF/DKIM/DMARC
 */

/**
 * Email recipient
 */
export interface EmailRecipient {
  email: string;
  name?: string;
  type?: 'to' | 'cc' | 'bcc';
}

/**
 * Email attachment (for email service operations)
 * Note: Use this for email-specific attachment handling
 */
export interface EmailServiceAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
  contentDisposition?: 'attachment' | 'inline';
  contentId?: string;
}

/**
 * Outbound email options
 */
export interface OutboundEmailOptions {
  messageId?: string;
  from: EmailRecipient;
  replyTo?: EmailRecipient;
  recipients: EmailRecipient[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailServiceAttachment[];
  headers?: Record<string, string>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  trackOpens?: boolean;
  trackClicks?: boolean;
  priority?: 'high' | 'normal' | 'low';
  scheduledAt?: Date;
}

/**
 * Email send result
 */
export interface EmailSendResult {
  messageId: string;
  provider: string;
  status: 'sent' | 'queued' | 'failed';
  timestamp: Date;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Parsed inbound email
 */
export interface ParsedEmail {
  id: string;
  headers: {
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
    subject: string;
    date?: Date;
    from: EmailRecipient;
    to: EmailRecipient[];
    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];
    replyTo?: EmailRecipient;
    dkim?: 'pass' | 'fail' | 'none';
    spf?: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none';
    dmarc?: 'pass' | 'fail' | 'none';
  };
  textBody?: string;
  htmlBody?: string;
  attachments: EmailServiceAttachment[];
  rawSize: number;
  parsedAt: Date;
  threadId?: string;
  isReply: boolean;
  isForward: boolean;
  spamScore?: number;
  phishingIndicators?: string[];
  parseErrors?: string[];
}

/**
 * Deliverability statistics
 */
export interface DeliverabilityStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  deliverabilityRate: number;
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Bounce information
 */
export interface BounceInfo {
  messageId: string;
  type: 'hard' | 'soft' | 'complaint';
  reason: string;
  timestamp: Date;
  recipient: string;
}

/**
 * Template rendering options
 */
export interface TemplateRenderOptions {
  templateName: string;
  variables: Record<string, string>;
}

/**
 * Domain Errors
 */
export class EmailSendError extends DomainError {
  readonly code = 'EMAIL_SEND_ERROR';
  constructor(message: string) {
    super(`Email send failed: ${message}`);
  }
}

export class EmailParseError extends DomainError {
  readonly code = 'EMAIL_PARSE_ERROR';
  constructor(message: string) {
    super(`Email parsing failed: ${message}`);
  }
}

export class RateLimitExceededError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  constructor(domain: string) {
    super(`Rate limit exceeded for domain: ${domain}`);
  }
}

export class DeliverabilityError extends DomainError {
  readonly code = 'DELIVERABILITY_ERROR';
  constructor(message: string) {
    super(`Deliverability issue: ${message}`);
  }
}

/**
 * Email Service Port Interface
 * Implementation in adapters layer
 */
export interface EmailServicePort {
  /**
   * Send outbound email
   * KPI: Deliverability >= 95%
   */
  sendEmail(options: OutboundEmailOptions): Promise<Result<EmailSendResult, DomainError>>;

  /**
   * Send templated email
   */
  sendTemplatedEmail(
    template: TemplateRenderOptions,
    emailOptions: Omit<OutboundEmailOptions, 'subject' | 'htmlBody' | 'textBody'>
  ): Promise<Result<EmailSendResult, DomainError>>;

  /**
   * Send bulk emails
   */
  sendBulkEmails(
    emails: OutboundEmailOptions[],
    options?: { concurrency?: number; delayMs?: number }
  ): Promise<Result<EmailSendResult[], DomainError>>;

  /**
   * Parse inbound email
   * KPI: Parse accuracy >= 99%
   */
  parseInboundEmail(rawEmail: string | Buffer): Promise<Result<ParsedEmail, DomainError>>;

  /**
   * Check deliverability health
   */
  checkDeliverability(): Promise<
    Result<{
      healthy: boolean;
      stats: DeliverabilityStats;
      provider: string;
    }, DomainError>
  >;

  /**
   * Check if email bounced
   */
  checkBounce(messageId: string): Promise<Result<BounceInfo | null, DomainError>>;

  /**
   * Register email template
   */
  registerTemplate(
    name: string,
    template: { subject: string; html: string; text?: string }
  ): void;

  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean;
}
