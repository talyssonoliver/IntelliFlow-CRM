/**
 * Notifications Worker Entry Point
 *
 * Multi-channel notification delivery worker supporting email, SMS, and webhooks.
 * Uses circuit breaker pattern for resilience and integrates with domain notification entity.
 *
 * REUSES: packages/domain/src/notifications/Notification.ts
 * REUSES: packages/adapters/src/email/outlook/client.ts patterns
 *
 * @module @intelliflow/notifications-worker
 * @task IFC-163
 * @artifact apps/workers/notifications-worker/src/main.ts
 */

import { Job } from 'bullmq';
import pino from 'pino';
import { z } from 'zod';
import { BaseWorker, type ComponentHealth } from '@intelliflow/worker-shared';
import { EmailChannel, createEmailChannel, type EmailPayload } from './channels/email';
import { SMSChannel, createSMSChannel, type SMSPayload } from './channels/sms';

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUE_NAMES = {
  EMAIL: 'intelliflow-notifications-email',
  SMS: 'intelliflow-notifications-sms',
  WEBHOOK: 'intelliflow-notifications-webhook',
  PUSH: 'intelliflow-notifications-push',
} as const;

// ============================================================================
// Schemas & Types
// ============================================================================

const NotificationPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const NotificationChannelSchema = z.enum(['EMAIL', 'SMS', 'WEBHOOK', 'PUSH']);

export const NotificationJobSchema = z.object({
  notificationId: z.uuid(),
  tenantId: z.uuid(),
  channel: NotificationChannelSchema,
  priority: NotificationPrioritySchema.default('NORMAL'),
  recipient: z.object({
    id: z.uuid().optional(),
    email: z.email().optional(),
    phone: z.string().optional(),
    webhookUrl: z.url().optional(),
    deviceToken: z.string().optional(),
  }),
  content: z.object({
    subject: z.string().optional(),
    body: z.string(),
    htmlBody: z.string().optional(),
    templateId: z.string().optional(),
    templateData: z.record(z.string(), z.unknown()).optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(3),
});

export type NotificationJob = z.infer<typeof NotificationJobSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

export interface NotificationResult {
  notificationId: string;
  channel: NotificationChannel;
  success: boolean;
  deliveredAt?: string;
  failedAt?: string;
  error?: string;
  providerResponse?: unknown;
  deliveryTimeMs: number;
}

interface NotificationsWorkerConfig {
  /** Enable email channel */
  enableEmail?: boolean;
  /** Enable SMS channel */
  enableSMS?: boolean;
  /** Enable webhook channel */
  enableWebhook?: boolean;
  /** Enable push notifications */
  enablePush?: boolean;
}

// ============================================================================
// Notifications Worker
// ============================================================================

export class NotificationsWorker extends BaseWorker<NotificationJob, NotificationResult> {
  private emailChannel: EmailChannel | null = null;
  private smsChannel: SMSChannel | null = null;
  private readonly workerConfig: NotificationsWorkerConfig;
  private sentByChannel: Record<string, number> = {};
  private failedByChannel: Record<string, number> = {};

  constructor(config?: NotificationsWorkerConfig) {
    const enabledQueues: string[] = [];

    // Determine which queues to process
    if (config?.enableEmail !== false) {
      enabledQueues.push(QUEUE_NAMES.EMAIL);
    }
    if (config?.enableSMS) {
      enabledQueues.push(QUEUE_NAMES.SMS);
    }
    if (config?.enableWebhook) {
      enabledQueues.push(QUEUE_NAMES.WEBHOOK);
    }
    if (config?.enablePush) {
      enabledQueues.push(QUEUE_NAMES.PUSH);
    }

    super({
      name: 'notifications-worker',
      queues: enabledQueues.length > 0 ? enabledQueues : [QUEUE_NAMES.EMAIL],
    });

    this.workerConfig = config || {};
  }

  /**
   * Initialize worker resources
   */
  protected async onStart(): Promise<void> {
    this.logger.info(
      {
        queues: this.queueNames,
        config: this.workerConfig,
      },
      'Initializing notifications worker'
    );

    // Initialize counters
    this.sentByChannel = {
      email: 0,
      sms: 0,
      webhook: 0,
      push: 0,
    };
    this.failedByChannel = {
      email: 0,
      sms: 0,
      webhook: 0,
      push: 0,
    };

    // Initialize email channel
    if (this.workerConfig.enableEmail !== false) {
      this.emailChannel = createEmailChannel(this.logger);
      await this.emailChannel.initialize();
      this.logger.info('Email channel initialized');
    }

    // Initialize SMS channel
    if (this.workerConfig.enableSMS) {
      try {
        this.smsChannel = createSMSChannel(this.logger);
        await this.smsChannel.initialize();
        this.logger.info('SMS channel initialized');
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'SMS channel initialization failed — degrading gracefully'
        );
        this.smsChannel = null;
      }
    }

    // Webhook delivery is fully implemented and fires HTTP POST to recipient URLs.
    // Push notifications require FCM/APNs credentials (ENABLE_PUSH=true).

    this.logger.info('Notifications worker initialized');
  }

  /**
   * Cleanup worker resources
   */
  protected async onStop(): Promise<void> {
    this.logger.info(
      {
        sentByChannel: this.sentByChannel,
        failedByChannel: this.failedByChannel,
      },
      'Stopping notifications worker'
    );

    // Close email channel
    if (this.emailChannel) {
      await this.emailChannel.close();
      this.emailChannel = null;
    }

    // Close SMS channel
    if (this.smsChannel) {
      await this.smsChannel.close();
      this.smsChannel = null;
    }
  }

  /**
   * Process a notification job
   */
  protected async processJob(job: Job<NotificationJob>): Promise<NotificationResult> {
    const startTime = Date.now();

    // Validate job data
    const notification = NotificationJobSchema.parse(job.data);

    this.logger.debug(
      {
        jobId: job.id,
        notificationId: notification.notificationId,
        channel: notification.channel,
        priority: notification.priority,
      },
      'Processing notification job'
    );

    // Check expiration
    if (notification.expiresAt && new Date(notification.expiresAt) < new Date()) {
      this.logger.warn(
        { notificationId: notification.notificationId },
        'Notification expired, skipping delivery'
      );
      return {
        notificationId: notification.notificationId,
        channel: notification.channel,
        success: false,
        failedAt: new Date().toISOString(),
        error: 'Notification expired',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    // Route to appropriate channel
    switch (notification.channel) {
      case 'EMAIL':
        return this.deliverEmail(notification, startTime);

      case 'SMS':
        return this.deliverSMS(notification, startTime);

      case 'WEBHOOK':
        return this.deliverWebhook(notification, startTime);

      case 'PUSH':
        return this.deliverPush(notification, startTime);

      default:
        throw new Error(`Unknown notification channel: ${notification.channel}`);
    }
  }

  /** Derive health status for a notification channel from its circuit breaker state. */
  private channelHealthStatus(
    channel: unknown,
    stats: { circuitState?: string } | undefined
  ): 'ok' | 'degraded' {
    if (!channel) return 'degraded';
    if (stats?.circuitState === 'OPEN') return 'degraded';
    return 'ok';
  }

  /**
   * Get additional health check dependencies
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    const totalSent = Object.values(this.sentByChannel).reduce((a, b) => a + b, 0);
    const totalFailed = Object.values(this.failedByChannel).reduce((a, b) => a + b, 0);

    const emailStats = this.emailChannel?.getStats();
    const smsStats = this.smsChannel?.getStats();

    return {
      email: {
        status: this.channelHealthStatus(this.emailChannel, emailStats),
        message: this.emailChannel
          ? `Sent: ${emailStats?.sent || 0}, Failed: ${emailStats?.failed || 0}, Circuit: ${emailStats?.circuitState || 'N/A'}`
          : 'Email channel disabled',
        lastCheck: new Date().toISOString(),
      },
      sms: {
        status: this.channelHealthStatus(this.smsChannel, smsStats),
        message: this.smsChannel
          ? `Sent: ${smsStats?.sent || 0}, Failed: ${smsStats?.failed || 0}, Circuit: ${smsStats?.circuitState || 'N/A'}`
          : 'SMS channel disabled',
        lastCheck: new Date().toISOString(),
      },
      webhook: {
        status: this.workerConfig.enableWebhook ? 'ok' : 'degraded',
        message: this.workerConfig.enableWebhook
          ? `Sent: ${this.sentByChannel.webhook}`
          : 'Webhook channel disabled',
        lastCheck: new Date().toISOString(),
      },
      push: {
        status: this.workerConfig.enablePush ? 'ok' : 'degraded',
        message: this.workerConfig.enablePush
          ? `Sent: ${this.sentByChannel.push}`
          : 'Push channel disabled',
        lastCheck: new Date().toISOString(),
      },
      summary: {
        status: totalFailed > totalSent * 0.1 ? 'degraded' : 'ok',
        message: `Total sent: ${totalSent}, Total failed: ${totalFailed}`,
        lastCheck: new Date().toISOString(),
      },
    };
  }

  // ============================================================================
  // Channel Delivery Methods
  // ============================================================================

  private async deliverEmail(
    notification: NotificationJob,
    startTime: number
  ): Promise<NotificationResult> {
    if (!this.emailChannel) {
      this.failedByChannel.email++;
      return {
        notificationId: notification.notificationId,
        channel: 'EMAIL',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'Email channel not initialized',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    if (!notification.recipient.email) {
      this.failedByChannel.email++;
      return {
        notificationId: notification.notificationId,
        channel: 'EMAIL',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'No email address provided',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    const emailPayload: EmailPayload = {
      to: notification.recipient.email,
      subject: notification.content.subject || 'Notification',
      body: notification.content.body,
      htmlBody: notification.content.htmlBody,
    };

    const result = await this.emailChannel.deliver(emailPayload, {
      correlationId: notification.notificationId,
      tenantId: notification.tenantId,
      ...notification.metadata,
    });

    if (result.success) {
      this.sentByChannel.email++;
      return {
        notificationId: notification.notificationId,
        channel: 'EMAIL',
        success: true,
        deliveredAt: result.deliveredAt,
        providerResponse: {
          messageId: result.messageId,
          accepted: result.accepted,
          rejected: result.rejected,
        },
        deliveryTimeMs: result.deliveryTimeMs,
      };
    } else {
      this.failedByChannel.email++;
      return {
        notificationId: notification.notificationId,
        channel: 'EMAIL',
        success: false,
        failedAt: result.deliveredAt,
        error: result.error,
        providerResponse: {
          rejected: result.rejected,
        },
        deliveryTimeMs: result.deliveryTimeMs,
      };
    }
  }

  private async deliverSMS(
    notification: NotificationJob,
    startTime: number
  ): Promise<NotificationResult> {
    this.logger.info(
      {
        notificationId: notification.notificationId,
      },
      'Processing SMS notification'
    );

    if (!this.smsChannel) {
      this.failedByChannel.sms++;
      return {
        notificationId: notification.notificationId,
        channel: 'SMS',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'SMS channel not initialized',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    if (!notification.recipient.phone) {
      this.failedByChannel.sms++;
      return {
        notificationId: notification.notificationId,
        channel: 'SMS',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'No phone number provided',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    const smsPayload: SMSPayload = {
      to: notification.recipient.phone,
      body: notification.content.body,
    };

    const result = await this.smsChannel.deliver(smsPayload, {
      correlationId: notification.notificationId,
      tenantId: notification.tenantId,
      ...notification.metadata,
    });

    if (result.success) {
      this.sentByChannel.sms++;
      return {
        notificationId: notification.notificationId,
        channel: 'SMS',
        success: true,
        deliveredAt: result.deliveredAt,
        providerResponse: {
          messageId: result.messageId,
          status: result.status,
          segmentCount: result.segmentCount,
        },
        deliveryTimeMs: result.deliveryTimeMs,
      };
    } else {
      this.failedByChannel.sms++;
      return {
        notificationId: notification.notificationId,
        channel: 'SMS',
        success: false,
        failedAt: result.deliveredAt,
        error: result.error,
        deliveryTimeMs: result.deliveryTimeMs,
      };
    }
  }

  private async deliverWebhook(
    notification: NotificationJob,
    startTime: number
  ): Promise<NotificationResult> {
    this.logger.info(
      {
        notificationId: notification.notificationId,
        webhookUrl: notification.recipient.webhookUrl,
      },
      'Processing webhook notification'
    );

    if (!notification.recipient.webhookUrl) {
      this.failedByChannel.webhook++;
      return {
        notificationId: notification.notificationId,
        channel: 'WEBHOOK',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'No webhook URL provided',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(notification.recipient.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: notification.notificationId,
          tenantId: notification.tenantId,
          ...notification.content,
          metadata: notification.metadata,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.failedByChannel.webhook++;
        return {
          notificationId: notification.notificationId,
          channel: 'WEBHOOK',
          success: false,
          failedAt: new Date().toISOString(),
          error: `Webhook returned HTTP ${response.status}`,
          providerResponse: { status: response.status, statusText: response.statusText },
          deliveryTimeMs: Date.now() - startTime,
        };
      }

      this.sentByChannel.webhook++;
      return {
        notificationId: notification.notificationId,
        channel: 'WEBHOOK',
        success: true,
        deliveredAt: new Date().toISOString(),
        providerResponse: { status: response.status },
        deliveryTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      this.failedByChannel.webhook++;
      const message = error instanceof Error ? error.message : 'Unknown webhook error';
      return {
        notificationId: notification.notificationId,
        channel: 'WEBHOOK',
        success: false,
        failedAt: new Date().toISOString(),
        error: `Webhook delivery failed: ${message}`,
        deliveryTimeMs: Date.now() - startTime,
      };
    }
  }

  private async deliverPush(
    notification: NotificationJob,
    startTime: number
  ): Promise<NotificationResult> {
    this.logger.info(
      {
        notificationId: notification.notificationId,
        deviceToken: notification.recipient.deviceToken ? '[REDACTED]' : undefined,
      },
      'Processing push notification'
    );

    if (!notification.recipient.deviceToken) {
      this.failedByChannel.push++;
      return {
        notificationId: notification.notificationId,
        channel: 'PUSH',
        success: false,
        failedAt: new Date().toISOString(),
        error: 'No device token provided',
        deliveryTimeMs: Date.now() - startTime,
      };
    }

    // Push provider not yet configured
    this.failedByChannel.push++;
    return {
      notificationId: notification.notificationId,
      channel: 'PUSH',
      success: false,
      failedAt: new Date().toISOString(),
      error: 'Push provider not configured (FCM/APNs)',
      deliveryTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Job Enqueue Helper
// ============================================================================

export async function enqueueNotification(
  notification: Omit<NotificationJob, 'retryCount'>,
  options?: {
    delay?: number;
    priority?: number;
  }
): Promise<string> {
  const { Queue } = await import('bullmq');
  const { getRedisConfig } = await import('@intelliflow/worker-shared');

  const queueName = QUEUE_NAMES[notification.channel];
  const queue = new Queue(queueName, {
    connection: getRedisConfig(),
  });

  const job = await queue.add(
    `notification:${notification.channel.toLowerCase()}`,
    { ...notification, retryCount: 0 },
    {
      delay: options?.delay,
      priority: options?.priority,
      attempts: notification.maxRetries || 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // 7 days
      },
    }
  );

  await queue.close();
  return job.id!;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const worker = new NotificationsWorker({
    enableEmail: process.env.ENABLE_EMAIL !== 'false',
    enableSMS: process.env.ENABLE_SMS === 'true',
    enableWebhook: process.env.ENABLE_WEBHOOK === 'true',
    enablePush: process.env.ENABLE_PUSH === 'true',
  });

  await worker.start();

  const logger = pino({ name: 'notifications-worker-main' });
  logger.info('Notifications worker is running. Press Ctrl+C to stop.');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => { // NOSONAR typescript:S7785 — CJS entry point, top-level await requires ESM migration
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Exports - NotificationsWorker and QUEUE_NAMES are already exported at declaration
export { EmailChannel, createEmailChannel } from './channels/email';
export type { EmailPayload, EmailDeliveryResult } from './channels/email';
export { SMSChannel, createSMSChannel } from './channels/sms';
export type { SMSPayload, SMSDeliveryResult, SMSChannelConfig } from './channels/sms';
