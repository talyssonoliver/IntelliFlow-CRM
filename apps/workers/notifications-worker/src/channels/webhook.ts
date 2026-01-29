/**
 * Webhook Channel
 *
 * Webhook notification delivery channel for HTTP callbacks.
 * Supports configurable retry, authentication, and payload signing.
 *
 * @module notifications-worker/channels
 * @task IFC-163
 * @artifact apps/workers/notifications-worker/src/channels/webhook.ts
 */

import { createHmac, randomBytes } from 'crypto';
import pino from 'pino';
import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

export const WebhookPayloadSchema = z.object({
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  body: z.union([z.string(), z.record(z.unknown())]),
  headers: z.record(z.string()).optional(),
  timeout: z.number().int().min(1000).max(60000).default(30000),
  retryOnStatus: z.array(z.number().int()).default([429, 500, 502, 503, 504]),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export interface WebhookDeliveryResult {
  success: boolean;
  requestId: string;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  deliveredAt: string;
  deliveryTimeMs: number;
  attempts: number;
}

export interface WebhookChannelConfig {
  /** Secret for signing payloads (HMAC-SHA256) */
  signingSecret?: string;
  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Maximum retries per delivery */
  maxRetries: number;
  /** Retry backoff delays in milliseconds */
  retryBackoff: number[];
  /** User agent string */
  userAgent: string;
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
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        this.logger.info('Webhook circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError(this.config.resetTimeoutMs - timeSinceFailure);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new CircuitBreakerOpenError(this.config.resetTimeoutMs);
    }

    try {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenCalls++;
      }

      const result = await fn();

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.logger.info('Webhook circuit breaker transitioning to CLOSED');
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
        'Webhook circuit breaker transitioning to OPEN'
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
// Webhook Channel Implementation
// ============================================================================

export class WebhookChannel {
  private readonly config: WebhookChannelConfig;
  private readonly circuitBreaker: SimpleCircuitBreaker;
  private readonly logger: pino.Logger;
  private sentCount = 0;
  private failedCount = 0;

  constructor(config: WebhookChannelConfig, logger?: pino.Logger) {
    this.config = config;
    this.logger =
      logger ||
      pino({
        name: 'webhook-channel',
        level: 'info',
      });

    this.circuitBreaker = new SimpleCircuitBreaker(
      {
        failureThreshold: 10,
        resetTimeoutMs: 30000,
        halfOpenMaxCalls: 5,
      },
      this.logger
    );
  }

  /**
   * Initialize the webhook channel
   */
  async initialize(): Promise<void> {
    this.logger.info('Webhook channel initialized');
  }

  /**
   * Deliver a webhook notification
   */
  async deliver(
    payload: WebhookPayload,
    metadata: Record<string, unknown> = {}
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    // Validate payload
    const validatedPayload = WebhookPayloadSchema.parse(payload);

    this.logger.debug(
      {
        requestId,
        url: this.maskUrl(validatedPayload.url),
        method: validatedPayload.method,
      },
      'Sending webhook'
    );

    let attempts = 0;
    let lastError: Error | null = null;
    let lastStatusCode: number | undefined;

    // Retry loop with backoff
    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const result = await this.circuitBreaker.execute(async () => {
          return this.sendRequest(validatedPayload, requestId, metadata);
        });

        const deliveryTimeMs = Date.now() - startTime;
        this.sentCount++;

        this.logger.info(
          {
            requestId,
            statusCode: result.statusCode,
            deliveryTimeMs,
            attempts,
          },
          'Webhook delivered successfully'
        );

        return {
          ...result,
          requestId,
          deliveryTimeMs,
          attempts,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Extract status code if available
        if ('statusCode' in (error as unknown as Record<string, unknown>)) {
          lastStatusCode = (error as unknown as Record<string, number>).statusCode;
        }

        // Check if we should retry based on status code
        const shouldRetry =
          lastStatusCode &&
          validatedPayload.retryOnStatus.includes(lastStatusCode) &&
          attempts <= this.config.maxRetries;

        if (shouldRetry) {
          const backoffMs = this.config.retryBackoff[attempts - 1] || this.config.retryBackoff[this.config.retryBackoff.length - 1];
          this.logger.warn(
            {
              requestId,
              statusCode: lastStatusCode,
              attempt: attempts,
              nextRetryMs: backoffMs,
            },
            'Webhook delivery failed, retrying'
          );
          await this.sleep(backoffMs);
        } else {
          break;
        }
      }
    }

    // All retries exhausted
    const deliveryTimeMs = Date.now() - startTime;
    this.failedCount++;

    this.logger.error(
      {
        requestId,
        error: lastError?.message,
        statusCode: lastStatusCode,
        deliveryTimeMs,
        attempts,
      },
      'Webhook delivery failed after all retries'
    );

    return {
      success: false,
      requestId,
      statusCode: lastStatusCode,
      error: lastError?.message || 'Unknown error',
      deliveredAt: new Date().toISOString(),
      deliveryTimeMs,
      attempts,
    };
  }

  /**
   * Send HTTP request
   */
  private async sendRequest(
    payload: WebhookPayload,
    requestId: string,
    metadata: Record<string, unknown>
  ): Promise<Omit<WebhookDeliveryResult, 'requestId' | 'deliveryTimeMs' | 'attempts'>> {
    const body =
      typeof payload.body === 'string'
        ? payload.body
        : JSON.stringify(payload.body);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.config.userAgent,
      'X-Request-ID': requestId,
      'X-Timestamp': new Date().toISOString(),
      ...payload.headers,
    };

    // Add correlation ID if available
    if (metadata.correlationId) {
      headers['X-Correlation-ID'] = String(metadata.correlationId);
    }

    // Add signature if signing secret is configured
    if (this.config.signingSecret) {
      const signature = this.signPayload(body, this.config.signingSecret);
      headers['X-Webhook-Signature'] = signature;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      payload.timeout || this.config.defaultTimeoutMs
    );

    try {
      const response = await fetch(payload.url, {
        method: payload.method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { statusCode: number };
        error.statusCode = response.status;
        throw error;
      }

      return {
        success: true,
        statusCode: response.status,
        responseBody: responseBody.slice(0, 1000), // Truncate large responses
        deliveredAt: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout') as Error & { statusCode: number };
        timeoutError.statusCode = 408;
        throw timeoutError;
      }

      throw error;
    }
  }

  /**
   * Sign payload using HMAC-SHA256
   */
  private signPayload(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${payload}`;
    const signature = createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `wh_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Mask URL for logging (hide sensitive query params)
   */
  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.search = parsed.search ? '[MASKED]' : '';
      return parsed.toString();
    } catch {
      return '[INVALID_URL]';
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * Close the channel
   */
  async close(): Promise<void> {
    this.logger.info('Webhook channel closed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWebhookChannel(logger?: pino.Logger): WebhookChannel {
  const config: WebhookChannelConfig = {
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET,
    defaultTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '30000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryBackoff: [1000, 5000, 30000], // From dlq-triage.md
    userAgent: process.env.WEBHOOK_USER_AGENT || 'IntelliFlow-CRM/1.0',
  };

  return new WebhookChannel(config, logger);
}
