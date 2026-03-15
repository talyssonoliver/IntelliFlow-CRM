/**
 * PrismaNotificationAuditLogger
 * Prisma implementation of the NotificationAuditLogger interface
 * @see IFC-157: Notification service MVP
 *
 * Writes audit events to the notification_delivery_logs and notification_dlq tables.
 */
import { PrismaClient } from '@intelliflow/db';
import type { NotificationAuditLogger } from '@intelliflow/application';
import type { Notification, NotificationChannel, NotificationPreference } from '@intelliflow/domain';

// Prisma DB enum types (uppercase) — matches the Prisma-generated enum
type DbNotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK';

/**
 * Maps domain channel (lowercase) to Prisma DB enum (uppercase).
 * Follows the same pattern used by PrismaNotificationRepository.
 */
function toDbChannel(channel: NotificationChannel): DbNotificationChannel {
  const mapping: Record<NotificationChannel, DbNotificationChannel> = {
    in_app: 'IN_APP',
    email: 'EMAIL',
    sms: 'SMS',
    push: 'PUSH',
    webhook: 'WEBHOOK',
  };
  return mapping[channel];
}

export class PrismaNotificationAuditLogger implements NotificationAuditLogger {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Log a successfully delivered notification to the delivery log.
   */
  async logNotificationSent(notification: Notification, providerMessageId: string): Promise<void> {
    await this.prisma.notificationDeliveryLog.create({
      data: {
        notificationId: notification.id.value,
        attemptNumber: notification.retryCount + 1,
        channel: toDbChannel(notification.channel),
        status: 'SUCCESS',
        providerMessageId,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Log a delivery failure to the delivery log.
   */
  async logNotificationFailed(
    notification: Notification,
    error: string,
    retryCount: number
  ): Promise<void> {
    await this.prisma.notificationDeliveryLog.create({
      data: {
        notificationId: notification.id.value,
        attemptNumber: retryCount + 1,
        channel: toDbChannel(notification.channel),
        status: 'FAILED',
        errorMessage: error,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Log a notification being moved to the dead-letter queue.
   */
  async logNotificationMovedToDLQ(notification: Notification, error: string): Promise<void> {
    await this.prisma.notificationDLQ.create({
      data: {
        notificationId: notification.id.value,
        tenantId: notification.tenantId,
        channel: toDbChannel(notification.channel),
        recipientId: notification.recipientId,
        subject: notification.subject,
        body: notification.body,
        lastError: error,
        retryCount: notification.retryCount,
      },
    });
  }

  /**
   * Log a preference update as an audit entry in the delivery log.
   * Uses the audit record pattern: notificationId = 'pref:{userId}', status = 'AUDIT'.
   */
  async logPreferenceUpdated(
    preference: NotificationPreference,
    changes: Record<string, unknown>
  ): Promise<void> {
    await this.prisma.notificationDeliveryLog.create({
      data: {
        notificationId: `pref:${preference.userId}`,
        attemptNumber: 1,
        channel: 'IN_APP' as DbNotificationChannel,
        status: 'AUDIT',
        providerResponse: changes as object,
        completedAt: new Date(),
      },
    });
  }
}
