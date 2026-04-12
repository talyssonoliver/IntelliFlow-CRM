import { Result, DomainError } from '@intelliflow/domain';

/**
 * Webhook Service Port
 * Defines the contract for webhook operations
 * Implementation lives in adapters layer
 *
 * @see IFC-144: Webhook Infrastructure with Idempotency and Retries
 */

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
export type WebhookEventHandler<T = unknown> = (
  event: WebhookEvent<T>,
  context: WebhookContext
) => Promise<void>;

/**
 * Webhook source configuration
 */
export interface WebhookSourceConfig {
  name: string;
  secret: string;
  signatureHeader: string;
  signatureVerifier: 'hmac-sha256' | 'stripe' | 'github' | 'custom';
  enabled?: boolean;
  allowedEvents?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Webhook handling result
 */
export interface WebhookHandleResult {
  success: boolean;
  eventId?: string;
  message?: string;
  statusCode: number;
  processingTimeMs?: number;
}

/**
 * Webhook metrics
 */
export interface WebhookMetrics {
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

/**
 * Dead letter entry
 */
export interface DeadLetterEntry {
  event: WebhookEvent;
  context: WebhookContext;
  error: string;
  failedAt: Date;
  attempts: number;
}

/**
 * Domain Errors
 */
export class WebhookVerificationError extends DomainError {
  readonly code = 'WEBHOOK_VERIFICATION_ERROR';
  constructor(source: string) {
    super(`Webhook signature verification failed for source: ${source}`);
  }
}

export class WebhookProcessingError extends DomainError {
  readonly code = 'WEBHOOK_PROCESSING_ERROR';
  constructor(message: string) {
    super(`Webhook processing failed: ${message}`);
  }
}

export class WebhookSourceNotFoundError extends DomainError {
  readonly code = 'WEBHOOK_SOURCE_NOT_FOUND';
  constructor(source: string) {
    super(`Webhook source not found: ${source}`);
  }
}

export class DuplicateWebhookError extends DomainError {
  readonly code = 'DUPLICATE_WEBHOOK';
  constructor(eventId: string) {
    super(`Duplicate webhook event: ${eventId}`);
  }
}

/**
 * Webhook Service Port Interface
 * Implementation in adapters layer
 */
export interface WebhookServicePort {
  /**
   * Register a webhook source
   */
  registerSource(config: WebhookSourceConfig): void;

  /**
   * Unregister a webhook source
   */
  unregisterSource(name: string): boolean;

  /**
   * Register an event handler
   */
  onEvent<T = unknown>(eventType: string, handler: WebhookEventHandler<T>): void;

  /**
   * Register a handler for all events
   */
  onAllEvents<T = unknown>(handler: WebhookEventHandler<T>): void;

  /**
   * Handle incoming webhook request
   * KPI: Reliability >= 99%, Idempotency >= 100%
   */
  handleWebhook(
    sourceName: string,
    rawBody: string,
    headers: Record<string, string>,
    ip?: string
  ): Promise<Result<WebhookHandleResult, DomainError>>;

  /**
   * Process pending retries
   * Uses exponential backoff: [1s, 5s, 30s]
   */
  processRetries(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }>;

  /**
   * Get framework metrics
   */
  getMetrics(): WebhookMetrics;

  /**
   * Get dead letter entries
   */
  getDeadLetterEntries(): DeadLetterEntry[];

  /**
   * Reprocess dead letter entry
   */
  reprocessDeadLetter(eventId: string): Promise<boolean>;

  /**
   * Cleanup expired entries
   */
  cleanup(): { idempotencyRemoved: number };

  /**
   * Get registered source names
   */
  getSources(): string[];
}
