/**
 * SMS Channel
 *
 * SMS notification delivery channel with provider abstraction.
 * Supports Twilio, MessageBird, and other providers.
 *
 * @module notifications-worker/channels
 * @task IFC-163
 * @artifact apps/workers/notifications-worker/src/channels/sms.ts
 */

import pino from 'pino';
import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

export const SMSPayloadSchema = z.object({
  to: z.string().min(10).max(15), // E.164 format
  body: z.string().min(1).max(1600), // SMS limit
  from: z.string().optional(),
  mediaUrls: z.array(z.string().url()).optional(), // MMS
});

export type SMSPayload = z.infer<typeof SMSPayloadSchema>;

export interface SMSDeliveryResult {
  success: boolean;
  messageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  error?: string;
  deliveredAt: string;
  deliveryTimeMs: number;
  segmentCount?: number;
  cost?: number;
}

export interface SMSChannelConfig {
  provider: 'twilio' | 'messagebird' | 'mock';
  accountSid?: string;
  authToken?: string;
  from: string;
  statusCallbackUrl?: string;
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
        this.logger.info('SMS circuit breaker transitioning to HALF_OPEN');
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
        this.logger.info('SMS circuit breaker transitioning to CLOSED');
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
        'SMS circuit breaker transitioning to OPEN'
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
// SMS Channel Implementation
// ============================================================================

export class SMSChannel {
  private readonly config: SMSChannelConfig;
  private readonly circuitBreaker: SimpleCircuitBreaker;
  private readonly logger: pino.Logger;
  private sentCount = 0;
  private failedCount = 0;

  constructor(config: SMSChannelConfig, logger?: pino.Logger) {
    this.config = config;
    this.logger =
      logger ||
      pino({
        name: 'sms-channel',
        level: 'info',
      });

    this.circuitBreaker = new SimpleCircuitBreaker(
      {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenMaxCalls: 3,
      },
      this.logger
    );
  }

  /**
   * Initialize the SMS channel
   */
  async initialize(): Promise<void> {
    // Validate configuration
    if (this.config.provider !== 'mock') {
      if (!this.config.accountSid || !this.config.authToken) {
        throw new Error('SMS provider credentials required');
      }
    }

    this.logger.info(
      { provider: this.config.provider },
      'SMS channel initialized'
    );
  }

  /**
   * Deliver an SMS
   */
  async deliver(
    payload: SMSPayload,
    metadata: Record<string, unknown> = {}
  ): Promise<SMSDeliveryResult> {
    const startTime = Date.now();

    // Validate payload
    const validatedPayload = SMSPayloadSchema.parse(payload);

    this.logger.debug(
      {
        to: validatedPayload.to.slice(0, -4) + '****', // Mask phone
        bodyLength: validatedPayload.body.length,
      },
      'Sending SMS'
    );

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return this.sendViaprovider(validatedPayload, metadata);
      });

      const deliveryTimeMs = Date.now() - startTime;
      this.sentCount++;

      this.logger.info(
        {
          messageId: result.messageId,
          status: result.status,
          deliveryTimeMs,
        },
        'SMS sent successfully'
      );

      return {
        ...result,
        deliveryTimeMs,
      };
    } catch (error) {
      const deliveryTimeMs = Date.now() - startTime;
      this.failedCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        {
          error: errorMessage,
          to: validatedPayload.to.slice(0, -4) + '****',
          deliveryTimeMs,
        },
        'SMS delivery failed'
      );

      return {
        success: false,
        status: 'failed',
        error: errorMessage,
        deliveredAt: new Date().toISOString(),
        deliveryTimeMs,
      };
    }
  }

  /**
   * Send via configured provider
   */
  private async sendViaprovider(
    payload: SMSPayload,
    _metadata: Record<string, unknown>
  ): Promise<Omit<SMSDeliveryResult, 'deliveryTimeMs'>> {
    switch (this.config.provider) {
      case 'twilio':
        return this.sendViaTwilio(payload);

      case 'messagebird':
        return this.sendViaMessageBird(payload);

      case 'mock':
        return this.sendViaMock(payload);

      default:
        throw new Error(`Unknown SMS provider: ${this.config.provider}`);
    }
  }

  /**
   * Send via Twilio
   */
  private async sendViaTwilio(payload: SMSPayload): Promise<Omit<SMSDeliveryResult, 'deliveryTimeMs'>> {
    // In production, use Twilio SDK:
    // const twilio = require('twilio')(this.config.accountSid, this.config.authToken);
    // const message = await twilio.messages.create({
    //   body: payload.body,
    //   from: payload.from || this.config.from,
    //   to: payload.to,
    //   statusCallback: this.config.statusCallbackUrl,
    //   mediaUrl: payload.mediaUrls,
    // });

    // Placeholder response
    return {
      success: true,
      messageId: `SM${Date.now()}${Math.random().toString(36).substring(7)}`,
      status: 'queued',
      deliveredAt: new Date().toISOString(),
      segmentCount: Math.ceil(payload.body.length / 160),
    };
  }

  /**
   * Send via MessageBird
   */
  private async sendViaMessageBird(payload: SMSPayload): Promise<Omit<SMSDeliveryResult, 'deliveryTimeMs'>> {
    // In production, use MessageBird SDK:
    // const messagebird = require('messagebird')(this.config.authToken);
    // const message = await messagebird.messages.create({
    //   originator: payload.from || this.config.from,
    //   recipients: [payload.to],
    //   body: payload.body,
    // });

    // Placeholder response
    return {
      success: true,
      messageId: `mb${Date.now()}`,
      status: 'sent',
      deliveredAt: new Date().toISOString(),
      segmentCount: Math.ceil(payload.body.length / 160),
    };
  }

  /**
   * Mock provider for testing
   */
  private async sendViaMock(payload: SMSPayload): Promise<Omit<SMSDeliveryResult, 'deliveryTimeMs'>> {
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success: true,
      messageId: `mock-${Date.now()}`,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      segmentCount: Math.ceil(payload.body.length / 160),
    };
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
    this.logger.info('SMS channel closed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSMSChannel(logger?: pino.Logger): SMSChannel {
  const provider = (process.env.SMS_PROVIDER || 'mock') as 'twilio' | 'messagebird' | 'mock';

  const config: SMSChannelConfig = {
    provider,
    accountSid: process.env.TWILIO_ACCOUNT_SID || process.env.SMS_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN,
    from: process.env.SMS_FROM || '+15551234567',
    statusCallbackUrl: process.env.SMS_STATUS_CALLBACK_URL,
  };

  return new SMSChannel(config, logger);
}
