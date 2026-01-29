/**
 * Email Channel
 *
 * Email notification delivery channel using Nodemailer.
 * Integrates with circuit breaker for resilience.
 *
 * REUSES: packages/adapters/src/email/outlook/client.ts patterns
 * REUSES: packages/platform/src/resilience/circuit-breaker.ts
 *
 * @module notifications-worker/channels
 * @task IFC-163
 * @artifact apps/workers/notifications-worker/src/channels/email.ts
 */

import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import pino from 'pino';
import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

export const EmailPayloadSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998), // RFC 2822 limit
  body: z.string(),
  htmlBody: z.string().optional(),
  replyTo: z.string().email().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.union([z.string(), z.instanceof(Buffer)]),
        contentType: z.string().optional(),
      })
    )
    .optional(),
  headers: z.record(z.string()).optional(),
});

export type EmailPayload = z.infer<typeof EmailPayloadSchema>;

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response?: string;
  error?: string;
  deliveredAt: string;
  deliveryTimeMs: number;
}

export interface EmailChannelConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  fromName?: string;
  pool?: boolean;
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
}

// ============================================================================
// Simple Circuit Breaker
// ============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

class SimpleCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: pino.Logger;

  constructor(config: CircuitBreakerConfig, logger: pino.Logger) {
    this.config = config;
    this.logger = logger;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError(this.config.resetTimeoutMs - timeSinceFailure);
      }
    }

    // Check HALF_OPEN call limit
    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new CircuitBreakerOpenError(this.config.resetTimeoutMs);
    }

    try {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenCalls++;
      }

      const result = await fn();

      // Success - reset on HALF_OPEN, decrement failures on CLOSED
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.logger.info('Circuit breaker transitioning to CLOSED');
      } else if (this.failureCount > 0) {
        this.failureCount--;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(
        { failureCount: this.failureCount },
        'Circuit breaker transitioning to OPEN'
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Circuit breaker is open. Retry after ${retryAfterMs}ms`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Email Channel Implementation
// ============================================================================

export class EmailChannel {
  private transporter: Transporter | null = null;
  private readonly config: EmailChannelConfig;
  private readonly circuitBreaker: SimpleCircuitBreaker;
  private readonly logger: pino.Logger;
  private sentCount = 0;
  private failedCount = 0;

  constructor(config: EmailChannelConfig, logger?: pino.Logger) {
    this.config = config;
    this.logger =
      logger ||
      pino({
        name: 'email-channel',
        level: 'info',
      });

    this.circuitBreaker = new SimpleCircuitBreaker(
      {
        failureThreshold: 5,
        resetTimeoutMs: 60000, // 1 minute
        halfOpenMaxCalls: 3,
      },
      this.logger
    );
  }

  /**
   * Initialize the email transporter
   */
  async initialize(): Promise<void> {
    // Build transport options - pool options require pool: true
    const transportOptions: SMTPTransport.Options & {
      pool?: boolean;
      maxConnections?: number;
      maxMessages?: number;
      rateDelta?: number;
      rateLimit?: number;
    } = {
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    };

    // Add pooling options if enabled
    if (this.config.pool) {
      transportOptions.pool = this.config.pool;
      transportOptions.maxConnections = this.config.maxConnections;
      transportOptions.maxMessages = this.config.maxMessages;
      transportOptions.rateDelta = this.config.rateDelta;
      transportOptions.rateLimit = this.config.rateLimit;
    }

    this.transporter = createTransport(transportOptions);

    // Verify connection
    await this.transporter.verify();
    this.logger.info('Email transporter initialized and verified');
  }

  /**
   * Deliver an email
   */
  async deliver(
    payload: EmailPayload,
    metadata: Record<string, unknown> = {}
  ): Promise<EmailDeliveryResult> {
    const startTime = Date.now();

    // Validate payload
    const validatedPayload = EmailPayloadSchema.parse(payload);

    if (!this.transporter) {
      throw new Error('Email transporter not initialized. Call initialize() first.');
    }

    this.logger.debug(
      {
        to: validatedPayload.to,
        subject: validatedPayload.subject,
      },
      'Sending email'
    );

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return this.transporter!.sendMail({
          from: this.config.fromName
            ? `"${this.config.fromName}" <${this.config.from}>`
            : this.config.from,
          to: Array.isArray(validatedPayload.to)
            ? validatedPayload.to.join(', ')
            : validatedPayload.to,
          cc: validatedPayload.cc?.join(', '),
          bcc: validatedPayload.bcc?.join(', '),
          replyTo: validatedPayload.replyTo,
          subject: validatedPayload.subject,
          text: validatedPayload.body,
          html: validatedPayload.htmlBody,
          attachments: validatedPayload.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
          headers: {
            'X-Correlation-ID': metadata.correlationId as string,
            'X-Tenant-ID': metadata.tenantId as string,
            ...validatedPayload.headers,
          },
        });
      });

      const deliveryTimeMs = Date.now() - startTime;
      this.sentCount++;

      this.logger.info(
        {
          messageId: result.messageId,
          accepted: result.accepted,
          deliveryTimeMs,
        },
        'Email sent successfully'
      );

      return {
        success: true,
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
        pending: result.pending as string[] || [],
        response: result.response,
        deliveredAt: new Date().toISOString(),
        deliveryTimeMs,
      };
    } catch (error) {
      const deliveryTimeMs = Date.now() - startTime;
      this.failedCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        {
          error: errorMessage,
          to: validatedPayload.to,
          deliveryTimeMs,
        },
        'Email delivery failed'
      );

      return {
        success: false,
        accepted: [],
        rejected: Array.isArray(validatedPayload.to) ? validatedPayload.to : [validatedPayload.to],
        pending: [],
        error: errorMessage,
        deliveredAt: new Date().toISOString(),
        deliveryTimeMs,
      };
    }
  }

  /**
   * Get channel statistics
   */
  getStats(): { sent: number; failed: number; circuitState: CircuitState } {
    return {
      sent: this.sentCount,
      failed: this.failedCount,
      circuitState: this.circuitBreaker.getState(),
    };
  }

  /**
   * Close the transporter connection
   */
  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.logger.info('Email transporter closed');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEmailChannel(logger?: pino.Logger): EmailChannel {
  const config: EmailChannelConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10), // Default to Mailhog port for dev
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    from: process.env.EMAIL_FROM || 'noreply@intelliflow.com',
    fromName: process.env.EMAIL_FROM_NAME || 'IntelliFlow CRM',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 10,
  };

  return new EmailChannel(config, logger);
}
