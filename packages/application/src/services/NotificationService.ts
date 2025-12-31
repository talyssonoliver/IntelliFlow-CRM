/**
 * NotificationService
 * Unified notification service with multi-channel delivery, templates, and preferences
 * @see IFC-157: Notification service MVP
 */
import {
  Notification,
  NotificationId,
  NotificationChannel,
  NotificationPriority,
  NotificationCategory,
  NotificationRepository,
  NotificationPreferenceRepository,
  NotificationPreference,
  NotificationSentEvent,
  NotificationFailedEvent,
  NotificationMovedToDLQEvent,
} from '@intelliflow/domain';
import {
  NotificationServicePort,
  EmailNotificationOptions,
  NotificationResult,
} from '../ports/external/NotificationServicePort';
import { EventBusPort } from '../ports/external/EventBusPort';

/**
 * Template for notifications
 */
export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  variables: string[];
}

/**
 * Options for sending a notification
 */
export interface SendNotificationOptions {
  tenantId: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  htmlBody?: string;
  priority?: NotificationPriority;
  category?: NotificationCategory;
  templateId?: string;
  templateVariables?: Record<string, string>;
  metadata?: Record<string, unknown>;
  scheduledAt?: Date;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Result of sending a notification
 */
export interface SendNotificationResult {
  notificationId: string;
  status: 'sent' | 'scheduled' | 'failed' | 'filtered';
  providerMessageId?: string;
  error?: string;
  filteredReason?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  backoffMs: number[];
  jitterFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: [1000, 5000, 30000],
  jitterFactor: 0.1,
};

/**
 * Audit logger interface for decoupling
 */
export interface NotificationAuditLogger {
  logNotificationSent(
    notification: Notification,
    providerMessageId: string
  ): Promise<void>;
  logNotificationFailed(
    notification: Notification,
    error: string,
    retryCount: number
  ): Promise<void>;
  logNotificationMovedToDLQ(
    notification: Notification,
    error: string
  ): Promise<void>;
  logPreferenceUpdated(
    preference: NotificationPreference,
    changes: Record<string, unknown>
  ): Promise<void>;
}

export class NotificationService {
  private templates: Map<string, NotificationTemplate> = new Map();

  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly preferenceRepo: NotificationPreferenceRepository,
    private readonly deliveryService: NotificationServicePort,
    private readonly eventBus: EventBusPort,
    private readonly auditLogger?: NotificationAuditLogger,
    private readonly retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {}

  /**
   * Send a notification respecting user preferences
   */
  async send(options: SendNotificationOptions): Promise<SendNotificationResult> {
    // Get user preferences
    const preference = await this.preferenceRepo.findOrCreateDefault(
      options.tenantId,
      options.recipientId
    );

    // Check if notification should be delivered based on preferences
    const category = options.category ?? 'system';
    const shouldDeliver = preference.shouldDeliverNow(options.channel, category);

    if (!shouldDeliver) {
      const reason = this.getFilterReason(preference, options.channel, category);
      return {
        notificationId: '',
        status: 'filtered',
        filteredReason: reason,
      };
    }

    // Create notification entity
    const notification = Notification.create({
      id: NotificationId.generate(),
      tenantId: options.tenantId,
      recipientId: options.recipientId,
      recipientEmail: options.recipientEmail,
      recipientPhone: options.recipientPhone,
      channel: options.channel,
      subject: options.subject,
      body: options.body,
      htmlBody: options.htmlBody,
      priority: options.priority,
      templateId: options.templateId,
      templateVariables: options.templateVariables,
      metadata: {
        ...options.metadata,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        category,
      },
      scheduledAt: options.scheduledAt,
    });

    // Save notification
    await this.notificationRepo.save(notification);

    // If scheduled for future, don't send now
    if (options.scheduledAt && options.scheduledAt > new Date()) {
      return {
        notificationId: notification.id.value,
        status: 'scheduled',
      };
    }

    // Deliver notification
    return this.deliverNotification(notification);
  }

  /**
   * Send notification using a template
   */
  async sendFromTemplate(
    templateId: string,
    options: Omit<SendNotificationOptions, 'subject' | 'body' | 'htmlBody'> & {
      variables: Record<string, string>;
    }
  ): Promise<SendNotificationResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Render template
    const subject = this.renderTemplate(template.subject, options.variables);
    const body = this.renderTemplate(template.bodyText, options.variables);
    const htmlBody = template.bodyHtml
      ? this.renderTemplate(template.bodyHtml, options.variables)
      : undefined;

    return this.send({
      ...options,
      channel: template.channel,
      subject,
      body,
      htmlBody,
      templateId,
      templateVariables: options.variables,
    });
  }

  /**
   * Register a notification template
   */
  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get templates by channel
   */
  getTemplates(channel?: NotificationChannel): NotificationTemplate[] {
    const all = Array.from(this.templates.values());
    if (!channel) return all;
    return all.filter(t => t.channel === channel);
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(
    tenantId: string,
    userId: string
  ): Promise<NotificationPreference> {
    return this.preferenceRepo.findOrCreateDefault(tenantId, userId);
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    tenantId: string,
    userId: string,
    updates: {
      channel?: { channel: NotificationChannel; enabled: boolean };
      category?: { category: NotificationCategory; enabled: boolean };
      quietHours?: { start: string; end: string; enabled?: boolean };
      timezone?: string;
      doNotDisturb?: boolean;
    }
  ): Promise<NotificationPreference> {
    const preference = await this.preferenceRepo.findOrCreateDefault(
      tenantId,
      userId
    );

    if (updates.channel) {
      preference.setChannelEnabled(updates.channel.channel, updates.channel.enabled);
    }

    if (updates.category) {
      preference.setCategoryEnabled(updates.category.category, updates.category.enabled);
    }

    if (updates.quietHours) {
      preference.setQuietHours(updates.quietHours.start, updates.quietHours.end);
      if (updates.quietHours.enabled !== undefined) {
        preference.setQuietHoursEnabled(updates.quietHours.enabled);
      }
    }

    if (updates.timezone) {
      preference.setTimezone(updates.timezone);
    }

    if (updates.doNotDisturb !== undefined) {
      preference.setDoNotDisturb(updates.doNotDisturb);
    }

    await this.preferenceRepo.save(preference);

    // Audit log the change
    if (this.auditLogger) {
      await this.auditLogger.logPreferenceUpdated(preference, updates);
    }

    return preference;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    return this.notificationRepo.countUnread(tenantId, userId);
  }

  /**
   * Get recent notifications for a user
   */
  async getRecent(
    tenantId: string,
    userId: string,
    channel: NotificationChannel = 'in_app',
    limit: number = 50
  ): Promise<Notification[]> {
    return this.notificationRepo.getRecentForRecipient(
      tenantId,
      userId,
      channel,
      limit
    );
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findById(
      NotificationId.create(notificationId)
    );

    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    if (notification.status === 'delivered' || notification.status === 'sent') {
      notification.markAsRead();
      await this.notificationRepo.save(notification);

      // Publish event
      const events = notification.getDomainEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }
      notification.clearDomainEvents();
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(tenantId: string, userId: string): Promise<number> {
    return this.notificationRepo.markAllAsRead(tenantId, userId);
  }

  /**
   * Process failed notifications for retry
   */
  async processRetries(): Promise<{ retried: number; movedToDLQ: number }> {
    const failedNotifications = await this.notificationRepo.findFailedForRetry(
      this.retryConfig.maxRetries,
      100
    );

    let retried = 0;
    let movedToDLQ = 0;

    for (const notification of failedNotifications) {
      if (notification.canRetry(this.retryConfig.maxRetries)) {
        notification.resetForRetry();
        await this.notificationRepo.save(notification);

        const result = await this.deliverNotification(notification);
        if (result.status === 'sent') {
          retried++;
        }
      } else {
        // Move to DLQ
        await this.moveToDLQ(notification);
        movedToDLQ++;
      }
    }

    return { retried, movedToDLQ };
  }

  /**
   * Process scheduled notifications
   */
  async processScheduled(): Promise<number> {
    const scheduledNotifications = await this.notificationRepo.findScheduledReadyToSend(
      new Date(),
      100
    );

    let processed = 0;
    for (const notification of scheduledNotifications) {
      await this.deliverNotification(notification);
      processed++;
    }

    return processed;
  }

  // Private methods

  private async deliverNotification(
    notification: Notification
  ): Promise<SendNotificationResult> {
    try {
      let result: NotificationResult;

      switch (notification.channel) {
        case 'email':
          result = await this.deliverEmail(notification);
          break;
        case 'in_app':
          result = await this.deliverInApp(notification);
          break;
        case 'sms':
          result = await this.deliverSms(notification);
          break;
        case 'push':
          result = await this.deliverPush(notification);
          break;
        default:
          throw new Error(`Unsupported channel: ${notification.channel}`);
      }

      if (result.status === 'sent' || result.status === 'delivered') {
        notification.markAsSent(result.providerMessageId ?? 'internal');
        await this.notificationRepo.save(notification);

        // Publish events
        for (const event of notification.getDomainEvents()) {
          await this.eventBus.publish(event);
        }
        notification.clearDomainEvents();

        // Audit log
        if (this.auditLogger) {
          await this.auditLogger.logNotificationSent(
            notification,
            result.providerMessageId ?? 'internal'
          );
        }

        return {
          notificationId: notification.id.value,
          status: 'sent',
          providerMessageId: result.providerMessageId,
        };
      }

      // Handle failure
      throw new Error(result.error ?? 'Delivery failed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      notification.markAsFailed(errorMessage);
      await this.notificationRepo.save(notification);

      // Publish events
      for (const event of notification.getDomainEvents()) {
        await this.eventBus.publish(event);
      }
      notification.clearDomainEvents();

      // Audit log
      if (this.auditLogger) {
        await this.auditLogger.logNotificationFailed(
          notification,
          errorMessage,
          notification.retryCount
        );
      }

      return {
        notificationId: notification.id.value,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  private async deliverEmail(notification: Notification): Promise<NotificationResult> {
    const emailOptions: EmailNotificationOptions = {
      to: notification.recipientEmail ? [notification.recipientEmail] : [],
      subject: notification.subject,
      textBody: notification.body,
      htmlBody: notification.htmlBody,
    };

    const result = await this.deliveryService.sendEmail(emailOptions);

    if (result.isFailure) {
      return {
        id: notification.id.value,
        channel: 'email',
        status: 'failed',
        error: result.error.message,
      };
    }

    return result.value;
  }

  private async deliverInApp(notification: Notification): Promise<NotificationResult> {
    // In-app notifications are stored in the database and retrieved via polling/WebSocket
    // Mark as delivered immediately since it's persisted
    return {
      id: notification.id.value,
      channel: 'in_app',
      status: 'delivered',
      deliveredAt: new Date(),
      providerMessageId: `inapp-${notification.id.value}`,
    };
  }

  private async deliverSms(notification: Notification): Promise<NotificationResult> {
    if (!notification.recipientPhone) {
      return {
        id: notification.id.value,
        channel: 'sms',
        status: 'failed',
        error: 'No recipient phone number',
      };
    }

    const result = await this.deliveryService.sendSms({
      to: notification.recipientPhone,
      message: notification.body,
    });

    if (result.isFailure) {
      return {
        id: notification.id.value,
        channel: 'sms',
        status: 'failed',
        error: result.error.message,
      };
    }

    return result.value;
  }

  private async deliverPush(notification: Notification): Promise<NotificationResult> {
    const result = await this.deliveryService.sendPush({
      userId: notification.recipientId,
      title: notification.subject,
      body: notification.body,
      data: notification.metadata as Record<string, any>,
    });

    if (result.isFailure) {
      return {
        id: notification.id.value,
        channel: 'push',
        status: 'failed',
        error: result.error.message,
      };
    }

    return result.value;
  }

  private async moveToDLQ(notification: Notification): Promise<void> {
    // Publish DLQ event
    const event = new NotificationMovedToDLQEvent(
      notification.id.value,
      notification.tenantId,
      notification.channel,
      notification.error ?? 'Unknown error',
      notification.retryCount
    );

    await this.eventBus.publish(event);

    // Audit log
    if (this.auditLogger) {
      await this.auditLogger.logNotificationMovedToDLQ(
        notification,
        notification.error ?? 'Unknown error'
      );
    }
  }

  private renderTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private getFilterReason(
    preference: NotificationPreference,
    channel: NotificationChannel,
    category: NotificationCategory
  ): string {
    if (preference.doNotDisturb) {
      return 'User has Do Not Disturb enabled';
    }

    if (!preference.isChannelEnabled(channel)) {
      return `Channel ${channel} is disabled`;
    }

    if (!preference.isCategoryEnabled(category)) {
      return `Category ${category} is disabled`;
    }

    if (preference.isInQuietHours()) {
      return 'Current time is within quiet hours';
    }

    return 'Unknown filter reason';
  }
}
