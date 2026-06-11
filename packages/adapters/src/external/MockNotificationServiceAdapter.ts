/**
 * Mock Notification Service Adapter
 *
 * In-memory implementation of NotificationServicePort for development and testing.
 * Stores all calls for inspection without actually sending notifications.
 *
 * @implements {NotificationServicePort}
 * @task IFC-158 - Scheduling communications
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  NotificationServicePort,
  NotificationChannel,
  NotificationPriority,
  NotificationResult,
  ScheduledNotification,
  EmailNotificationOptions,
  SmsNotificationOptions,
  PushNotificationOptions,
} from '@intelliflow/application';

let idCounter = 0;
function nextId(): string {
  return `mock-notif-${++idCounter}`;
}

export class MockNotificationServiceAdapter implements NotificationServicePort {
  /** Sent emails for test inspection */
  readonly sentEmails: Array<{ options: EmailNotificationOptions; result: NotificationResult }> =
    [];
  /** Sent SMS for test inspection */
  readonly sentSms: Array<{ options: SmsNotificationOptions; result: NotificationResult }> = [];
  /** Sent push notifications for test inspection */
  readonly sentPush: Array<{ options: PushNotificationOptions; result: NotificationResult }> = [];
  /** Scheduled notifications for test inspection */
  readonly scheduled: Map<string, ScheduledNotification> = new Map();
  /** Cancelled notification IDs */
  readonly cancelledIds: Set<string> = new Set();

  async sendEmail(
    options: EmailNotificationOptions
  ): Promise<Result<NotificationResult, DomainError>> {
    const result: NotificationResult = {
      id: nextId(),
      channel: 'email',
      status: 'sent',
      sentAt: new Date(),
    };
    this.sentEmails.push({ options, result });
    return Result.ok(result);
  }

  async sendSms(options: SmsNotificationOptions): Promise<Result<NotificationResult, DomainError>> {
    const result: NotificationResult = {
      id: nextId(),
      channel: 'sms',
      status: 'sent',
      sentAt: new Date(),
    };
    this.sentSms.push({ options, result });
    return Result.ok(result);
  }

  async sendPush(
    options: PushNotificationOptions
  ): Promise<Result<NotificationResult, DomainError>> {
    const result: NotificationResult = {
      id: nextId(),
      channel: 'push',
      status: 'sent',
      sentAt: new Date(),
    };
    this.sentPush.push({ options, result });
    return Result.ok(result);
  }

  async schedule(
    channel: NotificationChannel,
    scheduledAt: Date,
    options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions,
    priority: NotificationPriority = 'normal'
  ): Promise<Result<ScheduledNotification, DomainError>> {
    const notification: ScheduledNotification = {
      id: nextId(),
      channel,
      scheduledAt,
      priority,
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      payload: options,
    };
    this.scheduled.set(notification.id, notification);
    return Result.ok(notification);
  }

  async cancelScheduled(notificationId: string): Promise<Result<void, DomainError>> {
    this.cancelledIds.add(notificationId);
    this.scheduled.delete(notificationId);
    return Result.ok(undefined);
  }

  async getStatus(notificationId: string): Promise<Result<NotificationResult, DomainError>> {
    const result: NotificationResult = {
      id: notificationId,
      channel: 'email',
      status: this.cancelledIds.has(notificationId) ? 'failed' : 'delivered',
    };
    return Result.ok(result);
  }

  async sendBatch(
    notifications: Array<{
      channel: NotificationChannel;
      options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions;
    }>
  ): Promise<Result<NotificationResult[], DomainError>> {
    const results: NotificationResult[] = [];
    for (const notif of notifications) {
      const result: NotificationResult = {
        id: nextId(),
        channel: notif.channel,
        status: 'sent',
        sentAt: new Date(),
      };
      results.push(result);
    }
    return Result.ok(results);
  }

  validateEmail(email: string): boolean {
    // RFC 5321 local-part max 64 + @ + domain max 255 = 320. Bounding
    // before the three-`[^\s@]+` regex defuses polynomial-redos on
    // input missing `@`; bounded input is then linear.
    if (email.length > 320) return false;
    return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/.test(email);
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
  }

  /** Test helper: reset all stored data */
  reset(): void {
    this.sentEmails.length = 0;
    this.sentSms.length = 0;
    this.sentPush.length = 0;
    this.scheduled.clear();
    this.cancelledIds.clear();
    idCounter = 0;
  }
}
