/**
 * Webhook Service Adapter
 * Implements WebhookServicePort using the webhook framework
 * Bridges hexagonal architecture ports to concrete implementations
 *
 * @see IFC-144: Webhook Infrastructure with Idempotency and Retries
 */

import { Result } from '@intelliflow/domain';
import type {
  WebhookServicePort,
  WebhookSourceConfig,
  WebhookEventHandler,
  WebhookHandleResult,
  WebhookMetrics,
  DeadLetterEntry,
} from '@intelliflow/application';
import {
  WebhookVerificationError,
  WebhookProcessingError,
  WebhookSourceNotFoundError,
} from '@intelliflow/application';
import {
  WebhookFramework,
  createWebhookFramework,
  SignatureVerifiers,
  type SignatureVerifyFn,
} from '@intelliflow/webhooks';

/**
 * Webhook Service Adapter Configuration
 */
export interface WebhookServiceAdapterConfig {
  maxPayloadSize?: number;
  idempotencyTtlMs?: number;
  retryEnabled?: boolean;
  maxRetries?: number;
  deadLetterEnabled?: boolean;
  metricsEnabled?: boolean;
  loggingEnabled?: boolean;
}

/**
 * Webhook Service Adapter
 * Implements the WebhookServicePort interface
 */
export class WebhookServiceAdapter implements WebhookServicePort {
  private framework: WebhookFramework;

  constructor(config: WebhookServiceAdapterConfig = {}) {
    this.framework = createWebhookFramework({
      maxPayloadSize: config.maxPayloadSize,
      idempotencyTtlMs: config.idempotencyTtlMs,
      retryEnabled: config.retryEnabled,
      maxRetries: config.maxRetries,
      deadLetterEnabled: config.deadLetterEnabled,
      metricsEnabled: config.metricsEnabled,
      loggingEnabled: config.loggingEnabled,
    });
  }

  registerSource(config: WebhookSourceConfig): void {
    // Map signature verifier string to actual function
    let verifier: SignatureVerifyFn;
    switch (config.signatureVerifier) {
      case 'hmac-sha256':
        verifier = SignatureVerifiers.hmacSha256;
        break;
      case 'stripe':
        verifier = SignatureVerifiers.stripe;
        break;
      case 'github':
        verifier = SignatureVerifiers.github;
        break;
      case 'custom':
        // For custom verifiers, expect the secret to contain the verification logic
        verifier = SignatureVerifiers.hmacSha256; // Default fallback
        break;
      default:
        throw new Error(`Unknown signature verifier: ${config.signatureVerifier}`);
    }

    this.framework.registerSource({
      name: config.name,
      secret: config.secret,
      signatureHeader: config.signatureHeader,
      signatureVerifier: verifier,
      enabled: config.enabled ?? true,
      allowedEvents: config.allowedEvents,
      metadata: config.metadata,
    });
  }

  unregisterSource(name: string): boolean {
    return this.framework.unregisterSource(name);
  }

  onEvent<T = unknown>(eventType: string, handler: WebhookEventHandler<T>): void {
    this.framework.on(eventType, handler);
  }

  onAllEvents<T = unknown>(handler: WebhookEventHandler<T>): void {
    this.framework.onAll(handler);
  }

  async handleWebhook(
    sourceName: string,
    rawBody: string,
    headers: Record<string, string>,
    ip?: string
  ): Promise<
    Result<
      WebhookHandleResult,
      WebhookVerificationError | WebhookProcessingError | WebhookSourceNotFoundError
    >
  > {
    try {
      const result = await this.framework.handle(sourceName, rawBody, headers, ip);

      if (!result.success) {
        if (result.statusCode === 404) {
          return Result.fail(new WebhookSourceNotFoundError(sourceName));
        }
        if (result.statusCode === 401) {
          return Result.fail(new WebhookVerificationError(sourceName));
        }
        return Result.fail(new WebhookProcessingError(result.message || 'Unknown error'));
      }

      return Result.ok(result);
    } catch (error) {
      return Result.fail(
        new WebhookProcessingError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async processRetries(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    return this.framework.processRetries();
  }

  getMetrics(): WebhookMetrics {
    return this.framework.getMetrics();
  }

  getDeadLetterEntries(): DeadLetterEntry[] {
    return this.framework.getDeadLetterEntries();
  }

  async reprocessDeadLetter(eventId: string): Promise<boolean> {
    return this.framework.reprocessDeadLetter(eventId);
  }

  cleanup(): { idempotencyRemoved: number } {
    return this.framework.cleanup();
  }

  getSources(): string[] {
    return this.framework.getSources();
  }
}

/**
 * Factory function to create WebhookServiceAdapter
 */
export function createWebhookServiceAdapter(
  config: WebhookServiceAdapterConfig = {}
): WebhookServiceAdapter {
  return new WebhookServiceAdapter(config);
}

// Re-export domain errors for convenience
export {
  WebhookVerificationError,
  WebhookProcessingError,
  WebhookSourceNotFoundError,
};
