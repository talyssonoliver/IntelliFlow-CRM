/**
 * Real Notification Service Adapter
 *
 * Bridges NotificationServicePort to EmailServiceAdapter for production email delivery.
 * SMS and Push channels return fail results (not configured in MVP).
 *
 * @implements {NotificationServicePort}
 * @task IFC-223 - Wire actual Email Outbound Adapter
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
import { NotificationDeliveryError } from '@intelliflow/application';
import type { EmailServiceAdapter } from '../messaging/email/EmailServiceAdapter';
import { randomUUID } from 'node:crypto';

export interface RealNotificationConfig {
  fromAddress: string;
  fromName?: string;
}

export class RealNotificationServiceAdapter implements NotificationServicePort {
  constructor(
    private readonly emailAdapter: EmailServiceAdapter,
    private readonly config: RealNotificationConfig
  ) {}

  async sendEmail(
    options: EmailNotificationOptions
  ): Promise<Result<NotificationResult, DomainError>> {
    if (!options.to || options.to.length === 0) {
      return Result.fail(new NotificationDeliveryError('email', 'Recipients list is empty'));
    }

    const recipients = [
      ...options.to.map((email) => ({ email, type: 'to' as const })),
      ...(options.cc || []).map((email) => ({ email, type: 'cc' as const })),
      ...(options.bcc || []).map((email) => ({ email, type: 'bcc' as const })),
    ];

    const outboundOptions = {
      from: {
        email: this.config.fromAddress,
        name: this.config.fromName,
      },
      recipients,
      subject: options.subject,
      htmlBody: options.htmlBody,
      textBody: options.textBody,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      replyTo: options.replyTo ? { email: options.replyTo } : undefined,
      headers: options.headers,
    };

    const result = await this.emailAdapter.sendEmail(outboundOptions);

    if (result.isFailure) {
      const err = result.error;
      return Result.fail(
        new NotificationDeliveryError(
          'email',
          err instanceof Error ? err.message : 'Email send failed'
        )
      );
    }

    const sendResult = result.value;
    const notificationResult: NotificationResult = {
      id: sendResult.messageId,
      channel: 'email',
      status: sendResult.status === 'failed' ? 'failed' : 'sent',
      sentAt: sendResult.timestamp,
      providerMessageId: sendResult.messageId,
      error: sendResult.error,
    };

    return Result.ok(notificationResult);
  }

  async sendSms(
    _options: SmsNotificationOptions
  ): Promise<Result<NotificationResult, DomainError>> {
    return Result.fail(new NotificationDeliveryError('sms', 'SMS not configured'));
  }

  async sendPush(
    _options: PushNotificationOptions
  ): Promise<Result<NotificationResult, DomainError>> {
    return Result.fail(new NotificationDeliveryError('push', 'Push not configured'));
  }

  async schedule(
    channel: NotificationChannel,
    _scheduledAt: Date,
    options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions,
    priority: NotificationPriority = 'normal'
  ): Promise<Result<ScheduledNotification, DomainError>> {
    if (channel === 'email') {
      const emailResult = await this.sendEmail(options as EmailNotificationOptions);
      if (emailResult.isFailure) {
        return Result.fail(emailResult.error);
      }

      const notifResult = emailResult.value;
      const scheduled: ScheduledNotification = {
        id: notifResult.id,
        channel: 'email',
        scheduledAt: new Date(),
        priority,
        status: 'sent',
        retryCount: 0,
        maxRetries: 3,
        payload: options as EmailNotificationOptions,
      };
      return Result.ok(scheduled);
    }

    return Result.fail(
      new NotificationDeliveryError(channel, `${channel} scheduling not configured`)
    );
  }

  async cancelScheduled(_notificationId: string): Promise<Result<void, DomainError>> {
    return Result.ok(undefined);
  }

  async getStatus(notificationId: string): Promise<Result<NotificationResult, DomainError>> {
    return Result.ok({
      id: notificationId,
      channel: 'email',
      status: 'pending',
    });
  }

  async sendBatch(
    notifications: Array<{
      channel: NotificationChannel;
      options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions;
    }>
  ): Promise<Result<NotificationResult[], DomainError>> {
    const results: NotificationResult[] = [];

    for (const notif of notifications) {
      let result: Result<NotificationResult, DomainError>;
      if (notif.channel === 'email') {
        result = await this.sendEmail(notif.options as EmailNotificationOptions);
      } else if (notif.channel === 'sms') {
        result = await this.sendSms(notif.options as SmsNotificationOptions);
      } else {
        result = await this.sendPush(notif.options as PushNotificationOptions);
      }

      if (result.isFailure) {
        return Result.fail(result.error);
      }
      results.push(result.value);
    }

    return Result.ok(results);
  }

  validateEmail(email: string): boolean {
    return this.emailAdapter.validateEmail(email);
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
  }
}
