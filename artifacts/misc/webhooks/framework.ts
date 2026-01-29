/**
 * Webhook Framework
 *
 * A comprehensive framework for building webhook endpoints:
 * - Multi-source webhook handling
 * - Automatic signature verification
 * - Event routing and processing
 * - Retry and dead-letter handling
 * - Observability and monitoring
 *
 * Usage:
 * ```typescript
 * const framework = new WebhookFramework();
 *
 * framework.registerSource({
 *   name: 'stripe',
 *   secret: process.env.STRIPE_WEBHOOK_SECRET,
 *   signatureVerifier: StripeSignatureVerifier,
 * });
 *
 * framework.on('payment_intent.succeeded', async (event) => {
 *   // Handle payment success
 * });
 *
 * // Express integration
 * app.post('/webhooks/:source', framework.expressHandler());
 * ```
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Webhook event structure
 */
export interface WebhookEvent<T = unknown> {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  version: string;
  payload: T;
  metadata?: Record<string, unknown>;
  raw?: string;
}

/**
 * Webhook handler context
 */
export interface WebhookContext {
  requestId: string;
  source: string;
  receivedAt: Date;
  verified: boolean;
  headers: Record<string, string>;
  ip?: string;
}

/**
 * Event handler function
 */
export type EventHandler<T = unknown> = (
  event: WebhookEvent<T>,
  context: WebhookContext
) => Promise<void>;

/**
 * Middleware function
 */
export type Middleware = (
  event: WebhookEvent,
  context: WebhookContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Signature verification function
 */
export type SignatureVerifyFn = (
  payload: string,
  signature: string,
  secret: string
) => boolean;

/**
 * Source configuration
 */
export interface WebhookSourceConfig {
  name: string;
  secret: string;
  signatureHeader: string;
  signatureVerifier: SignatureVerifyFn;
  enabled?: boolean;
  allowedEvents?: string[];
  eventTransformer?: (raw: unknown) => WebhookEvent;
  metadata?: Record<string, unknown>;
}

/**
 * Framework configuration
 */
export interface WebhookFrameworkConfig {
  maxPayloadSize?: number;
  idempotencyTtlMs?: number;
  retryEnabled?: boolean;
  maxRetries?: number;
  deadLetterEnabled?: boolean;
  metricsEnabled?: boolean;
  loggingEnabled?: boolean;
}

/**
 * Handler result
 */
export interface HandleResult {
  success: boolean;
  eventId?: string;
  message?: string;
  statusCode: number;
  processingTimeMs?: number;
}

/**
 * Framework metrics
 */
export interface FrameworkMetrics {
  eventsReceived: number;
  eventsProcessed: number;
  eventsFailed: number;
  eventsRetried: number;
  eventsDeadLettered: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  averageProcessingTimeMs: number;
  lastEventAt?: Date;
}

// ============================================================================
// Signature Verifiers
// ============================================================================

/**
 * HMAC-SHA256 signature verifier
 */
export const hmacSha256Verify: SignatureVerifyFn = (payload, signature, secret) => {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

/**
 * Stripe signature verifier
 */
export const stripeVerify: SignatureVerifyFn = (payload, signature, secret) => {
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const v1 = parts['v1'];
  if (!timestamp || !v1) return false;

  // Check timestamp (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
};

/**
 * GitHub signature verifier
 */
export const githubVerify: SignatureVerifyFn = (payload, signature, secret) => {
  if (!signature.startsWith('sha256=')) return false;

  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

// ============================================================================
// Default Event Transformers
// ============================================================================

/**
 * Generic event transformer
 */
export function defaultEventTransformer(raw: unknown): WebhookEvent {
  const data = raw as Record<string, unknown>;
  return {
    id: (data.id || data.event_id || createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)) as string,
    type: (data.type || data.event_type || data.event || 'unknown') as string,
    source: 'unknown',
    timestamp: data.timestamp ? new Date(data.timestamp as string) : new Date(),
    version: (data.version || data.api_version || '1.0') as string,
    payload: data.data || data.payload || data,
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Stripe event transformer
 */
export function stripeEventTransformer(raw: unknown): WebhookEvent {
  const data = raw as Record<string, unknown>;
  return {
    id: data.id as string,
    type: data.type as string,
    source: 'stripe',
    timestamp: new Date((data.created as number) * 1000),
    version: (data.api_version || '2023-10-16') as string,
    payload: data.data as unknown,
    metadata: { livemode: data.livemode },
  };
}

/**
 * SendGrid event transformer
 */
export function sendgridEventTransformer(raw: unknown): WebhookEvent {
  const data = raw as Record<string, unknown>;
  return {
    id: (data.sg_message_id || data.event_id || createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)) as string,
    type: `email.${data.event}`,
    source: 'sendgrid',
    timestamp: data.timestamp ? new Date((data.timestamp as number) * 1000) : new Date(),
    version: '1.0',
    payload: data,
  };
}

// ============================================================================
// Idempotency Store
// ============================================================================

class IdempotencyStore {
  private entries = new Map<string, { processedAt: Date; result: unknown }>();
  private ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.processedAt.getTime() > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  get(key: string): unknown | undefined {
    if (!this.has(key)) return undefined;
    return this.entries.get(key)?.result;
  }

  set(key: string, result: unknown): void {
    this.entries.set(key, { processedAt: new Date(), result });
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (now - entry.processedAt.getTime() > this.ttlMs) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

// ============================================================================
// Retry Queue
// ============================================================================

interface RetryEntry {
  event: WebhookEvent;
  context: WebhookContext;
  attempts: number;
  nextAttemptAt: Date;
  error?: string;
}

class RetryQueue {
  private entries = new Map<string, RetryEntry>();
  private maxRetries: number;

  constructor(maxRetries = 5) {
    this.maxRetries = maxRetries;
  }

  add(event: WebhookEvent, context: WebhookContext, error: string): void {
    const existing = this.entries.get(event.id);
    const attempts = (existing?.attempts || 0) + 1;

    if (attempts >= this.maxRetries) {
      this.entries.delete(event.id);
      return; // Max retries exceeded
    }

    const delay = Math.min(1000 * Math.pow(2, attempts), 300000); // Exponential backoff, max 5 min
    this.entries.set(event.id, {
      event,
      context,
      attempts,
      nextAttemptAt: new Date(Date.now() + delay),
      error,
    });
  }

  getReady(): RetryEntry[] {
    const now = new Date();
    const ready: RetryEntry[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.nextAttemptAt <= now) {
        ready.push(entry);
        this.entries.delete(id);
      }
    }
    return ready;
  }

  size(): number {
    return this.entries.size;
  }
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

interface DeadLetterEntry {
  event: WebhookEvent;
  context: WebhookContext;
  error: string;
  failedAt: Date;
  attempts: number;
}

class DeadLetterQueue {
  private entries: DeadLetterEntry[] = [];

  add(entry: RetryEntry): void {
    this.entries.push({
      event: entry.event,
      context: entry.context,
      error: entry.error || 'Unknown error',
      failedAt: new Date(),
      attempts: entry.attempts,
    });
  }

  getAll(): DeadLetterEntry[] {
    return [...this.entries];
  }

  remove(eventId: string): boolean {
    const index = this.entries.findIndex(e => e.event.id === eventId);
    if (index >= 0) {
      this.entries.splice(index, 1);
      return true;
    }
    return false;
  }

  size(): number {
    return this.entries.length;
  }
}

// ============================================================================
// Webhook Framework
// ============================================================================

/**
 * Main Webhook Framework class
 */
export class WebhookFramework {
  private sources = new Map<string, WebhookSourceConfig>();
  private handlers = new Map<string, Array<EventHandler<unknown>>>();
  private globalHandlers: Array<EventHandler<unknown>> = [];
  private middleware: Middleware[] = [];
  private idempotency: IdempotencyStore;
  private retryQueue: RetryQueue;
  private deadLetterQueue: DeadLetterQueue;
  private config: Required<WebhookFrameworkConfig>;
  private metrics: FrameworkMetrics;
  private processingTimes: number[] = [];

  constructor(config?: WebhookFrameworkConfig) {
    this.config = {
      maxPayloadSize: config?.maxPayloadSize || 5 * 1024 * 1024, // 5MB
      idempotencyTtlMs: config?.idempotencyTtlMs || 24 * 60 * 60 * 1000, // 24h
      retryEnabled: config?.retryEnabled ?? true,
      maxRetries: config?.maxRetries || 5,
      deadLetterEnabled: config?.deadLetterEnabled ?? true,
      metricsEnabled: config?.metricsEnabled ?? true,
      loggingEnabled: config?.loggingEnabled ?? true,
    };

    this.idempotency = new IdempotencyStore(this.config.idempotencyTtlMs);
    this.retryQueue = new RetryQueue(this.config.maxRetries);
    this.deadLetterQueue = new DeadLetterQueue();

    this.metrics = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsRetried: 0,
      eventsDeadLettered: 0,
      eventsByType: {},
      eventsBySource: {},
      averageProcessingTimeMs: 0,
    };
  }

  // ===========================================================================
  // Source Registration
  // ===========================================================================

  /**
   * Register a webhook source
   */
  registerSource(config: WebhookSourceConfig): this {
    this.sources.set(config.name, {
      enabled: true,
      ...config,
    });
    return this;
  }

  /**
   * Unregister a webhook source
   */
  unregisterSource(name: string): boolean {
    return this.sources.delete(name);
  }

  /**
   * Get registered source names
   */
  getSources(): string[] {
    return Array.from(this.sources.keys());
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  /**
   * Register an event handler
   */
  on<T = unknown>(eventType: string, handler: EventHandler<T>): this {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler as EventHandler<unknown>);
    this.handlers.set(eventType, handlers);
    return this;
  }

  /**
   * Register a handler for all events
   */
  onAll<T = unknown>(handler: EventHandler<T>): this {
    this.globalHandlers.push(handler as EventHandler<unknown>);
    return this;
  }

  /**
   * Remove an event handler
   */
  off(eventType: string, handler: EventHandler<unknown>): boolean {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return false;
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
      return true;
    }
    return false;
  }

  // ===========================================================================
  // Middleware
  // ===========================================================================

  /**
   * Add middleware
   */
  use(middleware: Middleware): this {
    this.middleware.push(middleware);
    return this;
  }

  // ===========================================================================
  // Main Handler
  // ===========================================================================

  /**
   * Handle incoming webhook request
   */
  async handle(
    sourceName: string,
    rawBody: string,
    headers: Record<string, string>,
    ip?: string
  ): Promise<HandleResult> {
    const startTime = Date.now();
    const requestId = createHash('sha256')
      .update(`${sourceName}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 16);

    if (this.config.metricsEnabled) {
      this.metrics.eventsReceived++;
      this.metrics.eventsBySource[sourceName] = (this.metrics.eventsBySource[sourceName] || 0) + 1;
    }

    try {
      // Get source config
      const source = this.sources.get(sourceName);
      if (!source) {
        return { success: false, message: `Unknown source: ${sourceName}`, statusCode: 404 };
      }

      if (!source.enabled) {
        return { success: false, message: `Source disabled: ${sourceName}`, statusCode: 503 };
      }

      // Check payload size
      if (rawBody.length > this.config.maxPayloadSize) {
        return { success: false, message: 'Payload too large', statusCode: 413 };
      }

      // Normalize headers
      const normalizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = value;
      }

      // Verify signature
      const signature = normalizedHeaders[source.signatureHeader.toLowerCase()];
      let verified = false;

      if (signature) {
        verified = source.signatureVerifier(rawBody, signature, source.secret);
        if (!verified) {
          return { success: false, message: 'Invalid signature', statusCode: 401 };
        }
      } else if (source.secret) {
        return { success: false, message: 'Missing signature', statusCode: 401 };
      }

      // Parse and transform event
      let event: WebhookEvent;
      try {
        const parsed = JSON.parse(rawBody);
        const transformer = source.eventTransformer || defaultEventTransformer;
        event = transformer(parsed);
        event.source = sourceName;
        event.raw = rawBody;
      } catch (error) {
        return {
          success: false,
          message: `Parse error: ${error instanceof Error ? error.message : 'Unknown'}`,
          statusCode: 400,
        };
      }

      // Update metrics
      if (this.config.metricsEnabled) {
        this.metrics.eventsByType[event.type] = (this.metrics.eventsByType[event.type] || 0) + 1;
        this.metrics.lastEventAt = new Date();
      }

      // Check if event type is allowed
      if (source.allowedEvents && !source.allowedEvents.includes(event.type)) {
        return {
          success: true,
          eventId: event.id,
          message: `Event type ignored: ${event.type}`,
          statusCode: 200,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Check idempotency
      const idempotencyKey = `${sourceName}:${event.id}`;
      if (this.idempotency.has(idempotencyKey)) {
        return {
          success: true,
          eventId: event.id,
          message: 'Duplicate event',
          statusCode: 200,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Build context
      const context: WebhookContext = {
        requestId,
        source: sourceName,
        receivedAt: new Date(),
        verified,
        headers: normalizedHeaders,
        ip,
      };

      // Get handlers
      const handlers = [
        ...this.globalHandlers,
        ...(this.handlers.get(event.type) || []),
        ...(this.handlers.get('*') || []),
      ];

      if (handlers.length === 0) {
        if (this.config.loggingEnabled) {
          console.warn(`No handlers for event type: ${event.type}`);
        }
        return {
          success: true,
          eventId: event.id,
          message: 'No handlers registered',
          statusCode: 200,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Execute middleware and handlers
      try {
        await this.executeWithMiddleware(event, context, async () => {
          await Promise.all(handlers.map(h => h(event, context)));
        });

        // Mark as processed
        this.idempotency.set(idempotencyKey, { success: true });

        if (this.config.metricsEnabled) {
          this.metrics.eventsProcessed++;
          this.updateProcessingTime(Date.now() - startTime);
        }

        return {
          success: true,
          eventId: event.id,
          message: 'Processed successfully',
          statusCode: 200,
          processingTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (this.config.retryEnabled) {
          this.retryQueue.add(event, context, errorMessage);
          this.metrics.eventsRetried++;
        }

        if (this.config.metricsEnabled) {
          this.metrics.eventsFailed++;
        }

        return {
          success: false,
          eventId: event.id,
          message: errorMessage,
          statusCode: 500,
          processingTimeMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute handlers with middleware chain
   */
  private async executeWithMiddleware(
    event: WebhookEvent,
    context: WebhookContext,
    handler: () => Promise<void>
  ): Promise<void> {
    const chain = [...this.middleware].reverse();

    let next = handler;
    for (const middleware of chain) {
      const currentNext = next;
      next = () => middleware(event, context, currentNext);
    }

    await next();
  }

  /**
   * Update average processing time
   */
  private updateProcessingTime(timeMs: number): void {
    this.processingTimes.push(timeMs);
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
    this.metrics.averageProcessingTimeMs =
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  // ===========================================================================
  // Retry Processing
  // ===========================================================================

  /**
   * Process pending retries
   */
  async processRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const ready = this.retryQueue.getReady();
    let succeeded = 0;
    let failed = 0;

    for (const entry of ready) {
      const handlers = [
        ...this.globalHandlers,
        ...(this.handlers.get(entry.event.type) || []),
        ...(this.handlers.get('*') || []),
      ];

      try {
        await this.executeWithMiddleware(entry.event, entry.context, async () => {
          await Promise.all(handlers.map(h => h(entry.event, entry.context)));
        });
        succeeded++;
        this.idempotency.set(`${entry.context.source}:${entry.event.id}`, { success: true });
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (entry.attempts >= this.config.maxRetries - 1) {
          if (this.config.deadLetterEnabled) {
            this.deadLetterQueue.add({ ...entry, error: errorMessage });
            this.metrics.eventsDeadLettered++;
          }
        } else {
          this.retryQueue.add(entry.event, entry.context, errorMessage);
        }
      }
    }

    return { processed: ready.length, succeeded, failed };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get framework metrics
   */
  getMetrics(): FrameworkMetrics {
    return { ...this.metrics };
  }

  /**
   * Get dead letter entries
   */
  getDeadLetterEntries(): DeadLetterEntry[] {
    return this.deadLetterQueue.getAll();
  }

  /**
   * Reprocess dead letter entry
   */
  async reprocessDeadLetter(eventId: string): Promise<boolean> {
    const entries = this.deadLetterQueue.getAll();
    const entry = entries.find(e => e.event.id === eventId);
    if (!entry) return false;

    this.deadLetterQueue.remove(eventId);

    const handlers = [
      ...this.globalHandlers,
      ...(this.handlers.get(entry.event.type) || []),
      ...(this.handlers.get('*') || []),
    ];

    try {
      await Promise.all(handlers.map(h => h(entry.event, entry.context)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): { idempotencyRemoved: number } {
    const idempotencyRemoved = this.idempotency.cleanup();
    return { idempotencyRemoved };
  }

  /**
   * Express-style handler factory
   */
  expressHandler(): (req: {
    params: { source: string };
    body: string;
    headers: Record<string, string>;
    ip?: string;
  }) => Promise<{ status: number; json: unknown }> {
    return async (req) => {
      const result = await this.handle(
        req.params.source,
        req.body,
        req.headers,
        req.ip
      );

      return {
        status: result.statusCode,
        json: {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
          processingTimeMs: result.processingTimeMs,
        },
      };
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export const SignatureVerifiers = {
  hmacSha256: hmacSha256Verify,
  stripe: stripeVerify,
  github: githubVerify,
};

export const EventTransformers = {
  default: defaultEventTransformer,
  stripe: stripeEventTransformer,
  sendgrid: sendgridEventTransformer,
};

export function createWebhookFramework(config?: WebhookFrameworkConfig): WebhookFramework {
  return new WebhookFramework(config);
}
