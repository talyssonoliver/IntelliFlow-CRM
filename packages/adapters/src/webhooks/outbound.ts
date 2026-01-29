/**
 * Outbound Webhook Utilities
 *
 * Provides utilities for sending outbound webhooks with:
 * - HMAC signature generation
 * - Retry with exponential backoff
 * - Request/response logging
 *
 * @module adapters/webhooks
 * @task IFC-171 - Implement webhook notification channel
 * @artifact packages/adapters/src/webhooks/outbound.ts
 */

import { createHmac, randomBytes } from 'crypto';
import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

export const OutboundWebhookConfigSchema = z.object({
  signingSecret: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(60000).default(30000),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryBackoffMs: z.array(z.number()).default([1000, 5000, 30000]),
  userAgent: z.string().default('IntelliFlow-CRM/1.0'),
});

export type OutboundWebhookConfig = z.infer<typeof OutboundWebhookConfigSchema>;

export interface WebhookRequest {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  payload: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface WebhookResponse {
  success: boolean;
  requestId: string;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  attempts: number;
  durationMs: number;
  timestamp: string;
}

export interface WebhookDeliveryLog {
  requestId: string;
  url: string;
  method: string;
  statusCode?: number;
  success: boolean;
  error?: string;
  attempts: number;
  durationMs: number;
  timestamp: string;
  payloadSize: number;
  responseSize?: number;
}

// ============================================================================
// Signature Generation
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signaturePayload = `${ts}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');
  return `t=${ts},v1=${signature}`;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  const match = signature.match(/t=(\d+),v1=([a-f0-9]+)/);
  if (!match) return false;

  const [, timestamp, hash] = match;
  const ts = parseInt(timestamp, 10);

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  // Verify signature
  const expectedSignature = createHmac('sha256', secret)
    .update(`${ts}.${payload}`)
    .digest('hex');

  return hash === expectedSignature;
}

// ============================================================================
// Outbound Webhook Client
// ============================================================================

export class OutboundWebhookClient {
  private readonly config: OutboundWebhookConfig;
  private deliveryLogs: WebhookDeliveryLog[] = [];
  private readonly maxLogSize = 1000;

  constructor(config?: Partial<OutboundWebhookConfig>) {
    this.config = OutboundWebhookConfigSchema.parse(config || {});
  }

  /**
   * Send a webhook with retry logic
   */
  async send(request: WebhookRequest): Promise<WebhookResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const method = request.method || 'POST';
    const payload = JSON.stringify(request.payload);

    let attempts = 0;
    let lastError: Error | null = null;
    let lastStatusCode: number | undefined;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': this.config.userAgent,
          'X-Request-ID': requestId,
          'X-Timestamp': new Date().toISOString(),
          ...request.headers,
        };

        // Add idempotency key if provided
        if (request.idempotencyKey) {
          headers['Idempotency-Key'] = request.idempotencyKey;
        }

        // Add signature if secret is configured
        if (this.config.signingSecret) {
          headers['X-Webhook-Signature'] = generateWebhookSignature(
            payload,
            this.config.signingSecret
          );
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeoutMs
        );

        const response = await fetch(request.url, {
          method,
          headers,
          body: payload,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.text();
        const durationMs = Date.now() - startTime;

        if (!response.ok) {
          lastStatusCode = response.status;

          // Check if we should retry based on status code
          const retryableStatuses = [429, 500, 502, 503, 504];
          if (retryableStatuses.includes(response.status) && attempts <= this.config.maxRetries) {
            const backoffMs = this.config.retryBackoffMs[attempts - 1] ||
              this.config.retryBackoffMs[this.config.retryBackoffMs.length - 1];
            await this.sleep(backoffMs);
            continue;
          }

          this.logDelivery({
            requestId,
            url: request.url,
            method,
            statusCode: response.status,
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            attempts,
            durationMs,
            timestamp: new Date().toISOString(),
            payloadSize: payload.length,
            responseSize: responseBody.length,
          });

          return {
            success: false,
            requestId,
            statusCode: response.status,
            responseBody: responseBody.slice(0, 1000),
            error: `HTTP ${response.status}: ${response.statusText}`,
            attempts,
            durationMs,
            timestamp: new Date().toISOString(),
          };
        }

        this.logDelivery({
          requestId,
          url: request.url,
          method,
          statusCode: response.status,
          success: true,
          attempts,
          durationMs,
          timestamp: new Date().toISOString(),
          payloadSize: payload.length,
          responseSize: responseBody.length,
        });

        return {
          success: true,
          requestId,
          statusCode: response.status,
          responseBody: responseBody.slice(0, 1000),
          attempts,
          durationMs,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.name === 'AbortError') {
          lastStatusCode = 408;
        }

        // Retry on network errors
        if (attempts <= this.config.maxRetries) {
          const backoffMs = this.config.retryBackoffMs[attempts - 1] ||
            this.config.retryBackoffMs[this.config.retryBackoffMs.length - 1];
          await this.sleep(backoffMs);
          continue;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    this.logDelivery({
      requestId,
      url: request.url,
      method,
      statusCode: lastStatusCode,
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts,
      durationMs,
      timestamp: new Date().toISOString(),
      payloadSize: payload.length,
    });

    return {
      success: false,
      requestId,
      statusCode: lastStatusCode,
      error: lastError?.message || 'Unknown error after all retries',
      attempts,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send multiple webhooks concurrently
   */
  async sendBatch(requests: WebhookRequest[]): Promise<WebhookResponse[]> {
    return Promise.all(requests.map((req) => this.send(req)));
  }

  /**
   * Get recent delivery logs
   */
  getDeliveryLogs(limit: number = 100): WebhookDeliveryLog[] {
    return this.deliveryLogs.slice(-limit);
  }

  /**
   * Get delivery statistics
   */
  getStats(): {
    totalSent: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    averageDurationMs: number;
  } {
    const logs = this.deliveryLogs;
    const successCount = logs.filter((l) => l.success).length;
    const totalDuration = logs.reduce((sum, l) => sum + l.durationMs, 0);

    return {
      totalSent: logs.length,
      successCount,
      failureCount: logs.length - successCount,
      successRate: logs.length > 0 ? (successCount / logs.length) * 100 : 0,
      averageDurationMs: logs.length > 0 ? totalDuration / logs.length : 0,
    };
  }

  private generateRequestId(): string {
    return `wh_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private logDelivery(log: WebhookDeliveryLog): void {
    this.deliveryLogs.push(log);
    if (this.deliveryLogs.length > this.maxLogSize) {
      this.deliveryLogs = this.deliveryLogs.slice(-this.maxLogSize);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createOutboundWebhookClient(
  config?: Partial<OutboundWebhookConfig>
): OutboundWebhookClient {
  return new OutboundWebhookClient({
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET,
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '30000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    ...config,
  });
}

// Export singleton
let defaultClient: OutboundWebhookClient | null = null;

export function getOutboundWebhookClient(): OutboundWebhookClient {
  if (!defaultClient) {
    defaultClient = createOutboundWebhookClient();
  }
  return defaultClient;
}
