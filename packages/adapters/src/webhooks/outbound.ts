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

import { createHmac, randomBytes } from 'node:crypto';
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
  const signature = createHmac('sha256', secret).update(signaturePayload).digest('hex');
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
  const match = /t=(\d+),v1=([a-f0-9]+)/.exec(signature);
  if (!match) return false;

  const [, timestamp, hash] = match;
  const ts = Number.parseInt(timestamp, 10);

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  // Verify signature
  const expectedSignature = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');

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

  private buildRequestHeaders(
    request: WebhookRequest,
    requestId: string,
    payload: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.config.userAgent,
      'X-Request-ID': requestId,
      'X-Timestamp': new Date().toISOString(),
      ...request.headers,
    };
    if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;
    if (this.config.signingSecret) {
      headers['X-Webhook-Signature'] = generateWebhookSignature(payload, this.config.signingSecret);
    }
    return headers;
  }

  private buildFailureResponse(
    requestId: string,
    statusCode: number | undefined,
    error: string,
    attempts: number,
    durationMs: number
  ): WebhookResponse {
    return {
      success: false,
      requestId,
      statusCode,
      error,
      attempts,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  private buildSuccessResponse(
    requestId: string,
    statusCode: number,
    responseBody: string,
    attempts: number,
    durationMs: number
  ): WebhookResponse {
    return {
      success: true,
      requestId,
      statusCode,
      responseBody: responseBody.slice(0, 1000),
      attempts,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute a single fetch attempt with timeout handling.
   * Returns the response or throws on network/timeout errors.
   */
  private async fetchWithTimeout(
    url: string,
    method: string,
    headers: Record<string, string>,
    payload: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fetch(url, { method, headers, body: payload, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle a non-OK HTTP response: log and return failure, or signal retry.
   * Returns a WebhookResponse if the error is terminal, or null to continue retrying.
   */
  private handleErrorResponse(
    response: Response,
    responseBody: string,
    requestId: string,
    url: string,
    method: string,
    payload: string,
    attempts: number,
    durationMs: number
  ): WebhookResponse | null {
    if (this.isRetryableStatus(response.status) && attempts <= this.config.maxRetries) {
      return null; // signal: retry
    }
    const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    this.logDelivery({
      requestId,
      url,
      method,
      statusCode: response.status,
      success: false,
      error: errorMsg,
      attempts,
      durationMs,
      timestamp: new Date().toISOString(),
      payloadSize: payload.length,
      responseSize: responseBody.length,
    });
    return {
      ...this.buildFailureResponse(requestId, response.status, errorMsg, attempts, durationMs),
      responseBody: responseBody.slice(0, 1000),
    };
  }

  /**
   * Execute a single attempt and return a response or null to signal retry.
   */
  private async trySendAttempt(
    request: WebhookRequest,
    requestId: string,
    method: string,
    payload: string,
    attempts: number,
    startTime: number
  ): Promise<{
    response: WebhookResponse | null;
    lastError: Error | null;
    lastStatusCode: number | undefined;
  }> {
    try {
      const headers = this.buildRequestHeaders(request, requestId, payload);
      const res = await this.fetchWithTimeout(request.url, method, headers, payload);
      const responseBody = await res.text();
      const durationMs = Date.now() - startTime;

      if (!res.ok) {
        const errorResponse = this.handleErrorResponse(
          res,
          responseBody,
          requestId,
          request.url,
          method,
          payload,
          attempts,
          durationMs
        );
        if (errorResponse)
          return { response: errorResponse, lastError: null, lastStatusCode: res.status };
        await this.sleep(this.getBackoffMs(attempts));
        return { response: null, lastError: null, lastStatusCode: res.status };
      }

      this.logDelivery({
        requestId,
        url: request.url,
        method,
        statusCode: res.status,
        success: true,
        attempts,
        durationMs,
        timestamp: new Date().toISOString(),
        payloadSize: payload.length,
        responseSize: responseBody.length,
      });
      return {
        response: this.buildSuccessResponse(
          requestId,
          res.status,
          responseBody,
          attempts,
          durationMs
        ),
        lastError: null,
        lastStatusCode: undefined,
      };
    } catch (error) {
      const lastError = error instanceof Error ? error : new Error(String(error));
      const lastStatusCode =
        error instanceof Error && error.name === 'AbortError' ? 408 : undefined;
      if (attempts <= this.config.maxRetries) {
        await this.sleep(this.getBackoffMs(attempts));
      }
      return { response: null, lastError, lastStatusCode };
    }
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
      const result = await this.trySendAttempt(
        request,
        requestId,
        method,
        payload,
        attempts,
        startTime
      );
      if (result.response) return result.response;
      if (result.lastError) lastError = result.lastError;
      if (result.lastStatusCode !== undefined) lastStatusCode = result.lastStatusCode;
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

  private isRetryableStatus(status: number): boolean {
    return [429, 500, 502, 503, 504].includes(status);
  }

  private getBackoffMs(attempts: number): number {
    return this.config.retryBackoffMs[attempts - 1] || this.config.retryBackoffMs.at(-1)!;
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
    timeoutMs: Number.parseInt(process.env.WEBHOOK_TIMEOUT_MS || '30000', 10),
    maxRetries: Number.parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    ...config,
  });
}

// Export singleton
let defaultClient: OutboundWebhookClient | null = null;

export function getOutboundWebhookClient(): OutboundWebhookClient {
  defaultClient ??= createOutboundWebhookClient();
  return defaultClient;
}
