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
// Re-export platform resilience for downstream consumers
export { resilientCall } from '@intelliflow/platform/resilience';

// ============================================================================
// Types & Schemas
// ============================================================================

export const EmailPayloadSchema = z.object({
  to: z.union([z.email(), z.array(z.email())]),
  cc: z.array(z.email()).optional(),
  bcc: z.array(z.email()).optional(),
  subject: z.string().min(1).max(998), // RFC 2822 limit
  body: z.string(),
  htmlBody: z.string().optional(),
  replyTo: z.email().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.union([z.string(), z.instanceof(Buffer)]),
        contentType: z.string().optional(),
      })
    )
    .optional(),
  headers: z.record(z.string(), z.string()).optional(),
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
  /**
   * Transport provider. `'resend'` sends over the Resend HTTP API
   * (api.resend.com:443) instead of SMTP — required on Railway, whose egress
   * hangs on smtp.resend.com. `'smtp'` (default) uses nodemailer.
   */
  provider?: 'smtp' | 'resend';
  /** Resend API key — required when `provider === 'resend'`. */
  apiKey?: string;
  /** Resend API base URL (override for testing). Defaults to https://api.resend.com */
  apiBaseUrl?: string;
  /** Timeout (ms) for the Resend HTTP request and the SMTP socket. Defaults to 15000. */
  requestTimeoutMs?: number;
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
  private useResend = false;
  private readonly config: EmailChannelConfig;
  private readonly circuitBreaker: SimpleCircuitBreaker;
  private readonly logger: pino.Logger;
  private sentCount = 0;
  private failedCount = 0;

  constructor(config: EmailChannelConfig, logger?: pino.Logger) {
    this.config = config;
    this.logger =
      logger ??
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
    // Resend HTTP API transport: no SMTP socket and no verify() call. Railway's
    // egress hangs on smtp.resend.com (both 465 and 587), so outbound mail goes
    // over HTTPS (api.resend.com:443) via fetch instead of nodemailer.
    // Issue #316 / #26.
    if (this.config.provider === 'resend') {
      this.useResend = true;
      if (!this.config.apiKey) {
        this.logger.warn(
          'Email provider is "resend" but no API key configured — starting in ' +
            'degraded mode (email jobs will fail until RESEND_API_KEY is set)'
        );
      } else {
        this.logger.info('Email transporter initialized (Resend HTTP API)');
      }
      return;
    }

    // SMTP transport (nodemailer). Socket timeouts are mandatory: without them
    // transporter.verify() hangs indefinitely when the SMTP host is unreachable
    // (e.g. Railway → smtp.resend.com), which prevents the degrade path below
    // from ever firing and wedges worker startup. Issue #319 / #26.
    const socketTimeout = this.config.requestTimeoutMs ?? 15000;
    const connectTimeout = Math.min(socketTimeout, 10000);

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
      connectionTimeout: connectTimeout,
      greetingTimeout: connectTimeout,
      socketTimeout,
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

    // Verify connection — NON-FATAL (degrade, don't throw). When SMTP is not
    // configured/reachable in an environment (e.g. email not yet provisioned in
    // prod, where the default points at localhost:1025), the worker must still
    // start so SMS + webhook channels work; email delivery jobs then fail
    // individually (and retry) instead of crash-looping the whole worker.
    // Issue #319.
    try {
      await this.transporter.verify();
      this.logger.info('Email transporter initialized and verified');
    } catch (error) {
      this.logger.warn(
        { error, host: this.config.host, port: this.config.port },
        'Email SMTP verify failed — starting in degraded mode (email jobs will be attempted per-delivery and may fail until SMTP is configured)'
      );
    }
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

    // Resend HTTP API path bypasses nodemailer entirely.
    if (this.useResend) {
      return this.deliverViaResend(validatedPayload, metadata, startTime);
    }

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
        pending: (result.pending as string[]) || [],
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
   * Deliver an email via the Resend HTTP API (POST https://api.resend.com/emails).
   * Used when `provider === 'resend'` — sends over HTTPS/443 so it works from
   * environments (Railway) whose egress blocks/hangs on SMTP.
   */
  private async deliverViaResend(
    payload: EmailPayload,
    metadata: Record<string, unknown>,
    startTime: number
  ): Promise<EmailDeliveryResult> {
    const toList = Array.isArray(payload.to) ? payload.to : [payload.to];

    try {
      const messageId = await this.circuitBreaker.execute(async () => {
        if (!this.config.apiKey) {
          throw new Error('Resend API key not configured');
        }

        const baseUrl = this.config.apiBaseUrl || 'https://api.resend.com';
        const requestBody: Record<string, unknown> = {
          from: this.config.fromName
            ? `${this.config.fromName} <${this.config.from}>`
            : this.config.from,
          to: toList,
          subject: payload.subject,
          text: payload.body,
          ...(payload.htmlBody ? { html: payload.htmlBody } : {}),
          ...(payload.cc ? { cc: payload.cc } : {}),
          ...(payload.bcc ? { bcc: payload.bcc } : {}),
          ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
          headers: {
            'X-Correlation-ID': metadata.correlationId as string,
            'X-Tenant-ID': metadata.tenantId as string,
            ...payload.headers,
          },
          ...(payload.attachments
            ? {
                attachments: payload.attachments.map((a) => ({
                  filename: a.filename,
                  content: Buffer.isBuffer(a.content)
                    ? a.content.toString('base64')
                    : Buffer.from(a.content).toString('base64'),
                })),
              }
            : {}),
        };

        const response = await fetch(`${baseUrl}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 15000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`Resend API error ${response.status}: ${errorText}`.trim());
        }

        const json = (await response.json().catch(() => ({}))) as { id?: string };
        return json.id;
      });

      const deliveryTimeMs = Date.now() - startTime;
      this.sentCount++;

      this.logger.info(
        { messageId, to: toList, deliveryTimeMs },
        'Email sent successfully (Resend)'
      );

      return {
        success: true,
        messageId,
        accepted: toList,
        rejected: [],
        pending: [],
        deliveredAt: new Date().toISOString(),
        deliveryTimeMs,
      };
    } catch (error) {
      const deliveryTimeMs = Date.now() - startTime;
      this.failedCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        { error: errorMessage, to: toList, deliveryTimeMs },
        'Email delivery failed (Resend)'
      );

      return {
        success: false,
        accepted: [],
        rejected: toList,
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
  // Accept SMTP_* (canonical) or legacy EMAIL_* names — the .env historically
  // defined EMAIL_HOST/PORT/USER/PASSWORD/SECURE, which the worker never read, so
  // email silently fell back to localhost. Issue #316.
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPassword = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;

  // Provider selection: explicit EMAIL_PROVIDER wins; otherwise auto-detect
  // Resend from the presence of RESEND_API_KEY. Railway egress hangs on
  // smtp.resend.com, so when a Resend key is available we send over the HTTP
  // API instead of SMTP. Issue #316 / #26.
  const resendApiKey = process.env.RESEND_API_KEY;
  const explicitProvider = process.env.EMAIL_PROVIDER?.toLowerCase();
  const useResend =
    explicitProvider === 'resend' || (!!resendApiKey && explicitProvider !== 'smtp');

  const parsedTimeout = Number.parseInt(process.env.EMAIL_REQUEST_TIMEOUT_MS || '15000', 10);

  const config: EmailChannelConfig = {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'localhost',
    port: Number.parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '1025', 10), // Mailhog port for dev
    secure: (process.env.SMTP_SECURE || process.env.EMAIL_SECURE) === 'true',
    auth:
      smtpUser && smtpPassword
        ? {
            user: smtpUser,
            pass: smtpPassword,
          }
        : undefined,
    from: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@intelliflow.com',
    fromName: process.env.EMAIL_FROM_NAME || 'IntelliFlow CRM',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 10,
    provider: useResend ? 'resend' : 'smtp',
    apiKey: resendApiKey,
    requestTimeoutMs: Number.isFinite(parsedTimeout) ? parsedTimeout : 15000,
  };

  return new EmailChannel(config, logger);
}
