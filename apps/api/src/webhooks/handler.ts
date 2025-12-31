/**
 * Webhook Handler
 *
 * Central webhook endpoint handler with:
 * - Signature verification
 * - Event routing
 * - Async processing
 * - Error handling
 *
 * KPI Target: Zero duplicate webhooks
 */

import { z } from 'zod';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

// Webhook event schema
export const WebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string().datetime(),
  version: z.string().default('1.0'),
  source: z.string(),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// Webhook request context
export interface WebhookContext {
  requestId: string;
  receivedAt: Date;
  source: string;
  signature?: string;
  signatureHeader?: string;
  rawBody: string;
  headers: Record<string, string>;
  verified: boolean;
}

// Handler result
export interface WebhookHandlerResult {
  success: boolean;
  eventId?: string;
  message?: string;
  statusCode: number;
  retryable?: boolean;
  processingTime?: number;
}

// Event handler function type
export type EventHandler<T = unknown> = (
  event: WebhookEvent,
  payload: T,
  context: WebhookContext
) => Promise<void>;

// Signature verifier interface
export interface SignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean;
  getHeaderName(): string;
}

// Webhook configuration
export interface WebhookConfig {
  source: string;
  secret: string;
  signatureVerifier: SignatureVerifier;
  enabled: boolean;
  allowedEvents?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * HMAC-SHA256 signature verifier (common for most webhooks)
 */
export class HmacSha256Verifier implements SignatureVerifier {
  private prefix: string;
  private headerName: string;

  constructor(options?: { prefix?: string; headerName?: string }) {
    this.prefix = options?.prefix || '';
    this.headerName = options?.headerName || 'x-signature';
  }

  verify(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.prefix + createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  getHeaderName(): string {
    return this.headerName;
  }
}

/**
 * Stripe webhook signature verifier
 */
export class StripeSignatureVerifier implements SignatureVerifier {
  private toleranceSeconds: number;

  constructor(toleranceSeconds = 300) {
    this.toleranceSeconds = toleranceSeconds;
  }

  verify(payload: string, signature: string, secret: string): boolean {
    // Parse Stripe signature header
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['t'];
    const v1Signature = parts['v1'];

    if (!timestamp || !v1Signature) {
      return false;
    }

    // Check timestamp tolerance
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > this.toleranceSeconds) {
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(v1Signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  getHeaderName(): string {
    return 'stripe-signature';
  }
}

/**
 * GitHub webhook signature verifier
 */
export class GitHubSignatureVerifier implements SignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean {
    if (!signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = 'sha256=' + createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  getHeaderName(): string {
    return 'x-hub-signature-256';
  }
}

/**
 * SendGrid webhook signature verifier
 */
export class SendGridSignatureVerifier implements SignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean {
    // SendGrid uses ECDSA signature verification
    // For simplicity, using HMAC here - in production, use proper ECDSA
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  getHeaderName(): string {
    return 'x-twilio-email-event-webhook-signature';
  }
}

/**
 * Webhook event router
 */
export class WebhookEventRouter {
  private handlers: Map<string, Array<EventHandler<unknown>>> = new Map();
  private globalHandlers: Array<EventHandler<unknown>> = [];

  /**
   * Register a handler for a specific event type
   */
  on<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler as EventHandler<unknown>);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register a handler for all events
   */
  onAll<T = unknown>(handler: EventHandler<T>): void {
    this.globalHandlers.push(handler as EventHandler<unknown>);
  }

  /**
   * Remove a handler
   */
  off(eventType: string, handler: EventHandler<unknown>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Route an event to its handlers
   */
  async route(event: WebhookEvent, context: WebhookContext): Promise<void> {
    const handlers = [
      ...this.globalHandlers,
      ...(this.handlers.get(event.type) || []),
      ...(this.handlers.get('*') || []),
    ];

    if (handlers.length === 0) {
      console.warn(`No handlers registered for event type: ${event.type}`);
      return;
    }

    // Execute handlers in parallel
    const results = await Promise.allSettled(
      handlers.map(handler => handler(event, event.payload, context))
    );

    // Check for failures
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      const errors = failures.map(f => (f as PromiseRejectedResult).reason);
      console.error(`Handler errors for event ${event.id}:`, errors);
      throw new AggregateError(errors, `${failures.length} handler(s) failed`);
    }
  }

  /**
   * Check if there are handlers for an event type
   */
  hasHandlers(eventType: string): boolean {
    return this.globalHandlers.length > 0 ||
      (this.handlers.get(eventType)?.length || 0) > 0 ||
      (this.handlers.get('*')?.length || 0) > 0;
  }
}

/**
 * Main webhook handler
 */
export class WebhookHandler {
  private configs: Map<string, WebhookConfig> = new Map();
  private router: WebhookEventRouter;
  private eventLog: Map<string, { processedAt: Date; result: WebhookHandlerResult }> = new Map();
  private eventLogMaxSize: number;

  constructor(options?: { eventLogMaxSize?: number }) {
    this.router = new WebhookEventRouter();
    this.eventLogMaxSize = options?.eventLogMaxSize || 10000;
  }

  /**
   * Register a webhook source configuration
   */
  registerSource(config: WebhookConfig): void {
    this.configs.set(config.source, config);
  }

  /**
   * Remove a webhook source
   */
  removeSource(source: string): boolean {
    return this.configs.delete(source);
  }

  /**
   * Get the event router
   */
  getRouter(): WebhookEventRouter {
    return this.router;
  }

  /**
   * Handle incoming webhook request
   */
  async handleRequest(
    source: string,
    rawBody: string,
    headers: Record<string, string>
  ): Promise<WebhookHandlerResult> {
    const startTime = Date.now();
    const requestId = createHash('sha256')
      .update(`${source}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 16);

    try {
      // Get source configuration
      const config = this.configs.get(source);
      if (!config) {
        return {
          success: false,
          message: `Unknown webhook source: ${source}`,
          statusCode: 404,
          retryable: false,
        };
      }

      if (!config.enabled) {
        return {
          success: false,
          message: `Webhook source disabled: ${source}`,
          statusCode: 503,
          retryable: true,
        };
      }

      // Normalize headers to lowercase
      const normalizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = value;
      }

      // Verify signature
      const signatureHeader = config.signatureVerifier.getHeaderName();
      const signature = normalizedHeaders[signatureHeader.toLowerCase()];

      let verified = false;
      if (signature) {
        verified = config.signatureVerifier.verify(rawBody, signature, config.secret);
        if (!verified) {
          return {
            success: false,
            message: 'Invalid signature',
            statusCode: 401,
            retryable: false,
          };
        }
      } else if (config.secret) {
        return {
          success: false,
          message: 'Missing signature',
          statusCode: 401,
          retryable: false,
        };
      }

      // Parse event
      let event: WebhookEvent;
      try {
        const parsed = JSON.parse(rawBody);
        event = WebhookEventSchema.parse({
          id: parsed.id || parsed.event_id || requestId,
          type: parsed.type || parsed.event_type || parsed.event || 'unknown',
          timestamp: parsed.timestamp || parsed.created_at || new Date().toISOString(),
          version: parsed.version || '1.0',
          source,
          payload: parsed.data || parsed.payload || parsed,
          metadata: parsed.metadata,
        });
      } catch (error) {
        return {
          success: false,
          message: `Invalid event payload: ${error instanceof Error ? error.message : 'Parse error'}`,
          statusCode: 400,
          retryable: false,
        };
      }

      // Check if event is allowed
      if (config.allowedEvents && !config.allowedEvents.includes(event.type)) {
        return {
          success: true, // Acknowledge but don't process
          eventId: event.id,
          message: `Event type not handled: ${event.type}`,
          statusCode: 200,
          processingTime: Date.now() - startTime,
        };
      }

      // Check for duplicate (idempotency)
      const eventKey = `${source}:${event.id}`;
      if (this.eventLog.has(eventKey)) {
        const previous = this.eventLog.get(eventKey)!;
        return {
          success: true,
          eventId: event.id,
          message: 'Duplicate event - already processed',
          statusCode: 200,
          processingTime: Date.now() - startTime,
        };
      }

      // Build context
      const context: WebhookContext = {
        requestId,
        receivedAt: new Date(),
        source,
        signature,
        signatureHeader,
        rawBody,
        headers: normalizedHeaders,
        verified,
      };

      // Route to handlers
      try {
        await this.router.route(event, context);
      } catch (error) {
        // Log error but still acknowledge receipt
        console.error(`Error processing webhook event ${event.id}:`, error);

        const result: WebhookHandlerResult = {
          success: false,
          eventId: event.id,
          message: error instanceof Error ? error.message : 'Handler error',
          statusCode: 500,
          retryable: true,
          processingTime: Date.now() - startTime,
        };

        this.logEvent(eventKey, result);
        return result;
      }

      // Success
      const result: WebhookHandlerResult = {
        success: true,
        eventId: event.id,
        message: 'Event processed successfully',
        statusCode: 200,
        processingTime: Date.now() - startTime,
      };

      this.logEvent(eventKey, result);
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
        retryable: true,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Log processed event
   */
  private logEvent(key: string, result: WebhookHandlerResult): void {
    // Evict old entries if log is too large
    if (this.eventLog.size >= this.eventLogMaxSize) {
      const oldestKey = this.eventLog.keys().next().value;
      if (oldestKey) {
        this.eventLog.delete(oldestKey);
      }
    }

    this.eventLog.set(key, {
      processedAt: new Date(),
      result,
    });
  }

  /**
   * Check if an event was already processed
   */
  wasProcessed(source: string, eventId: string): boolean {
    return this.eventLog.has(`${source}:${eventId}`);
  }

  /**
   * Get event processing result
   */
  getEventResult(source: string, eventId: string): WebhookHandlerResult | null {
    const entry = this.eventLog.get(`${source}:${eventId}`);
    return entry?.result || null;
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog.clear();
  }

  /**
   * Get registered sources
   */
  getSources(): string[] {
    return Array.from(this.configs.keys());
  }
}

// Common event types for email webhooks
export const EmailWebhookEvents = {
  // Delivery events
  DELIVERED: 'email.delivered',
  BOUNCED: 'email.bounced',
  DEFERRED: 'email.deferred',
  DROPPED: 'email.dropped',

  // Engagement events
  OPENED: 'email.opened',
  CLICKED: 'email.clicked',
  UNSUBSCRIBED: 'email.unsubscribed',

  // Compliance events
  SPAM_REPORT: 'email.spam_report',
  BLOCKED: 'email.blocked',

  // Inbound events
  INBOUND: 'email.inbound',
} as const;

// Export factory function
export function createWebhookHandler(options?: {
  eventLogMaxSize?: number;
  sources?: WebhookConfig[];
}): WebhookHandler {
  const handler = new WebhookHandler({ eventLogMaxSize: options?.eventLogMaxSize });

  if (options?.sources) {
    for (const source of options.sources) {
      handler.registerSource(source);
    }
  }

  return handler;
}

// Export verifier factories
export const SignatureVerifiers = {
  hmacSha256: (options?: { prefix?: string; headerName?: string }) =>
    new HmacSha256Verifier(options),
  stripe: (toleranceSeconds?: number) =>
    new StripeSignatureVerifier(toleranceSeconds),
  github: () =>
    new GitHubSignatureVerifier(),
  sendgrid: () =>
    new SendGridSignatureVerifier(),
};
