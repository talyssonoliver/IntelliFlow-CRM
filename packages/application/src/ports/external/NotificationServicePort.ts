import { Result, DomainError } from '@intelliflow/domain';

/**
 * Notification Service Port
 * Defines the contract for sending notifications (email, SMS, push)
 * for appointment reminders and scheduling updates
 *
 * @see IFC-137: Notification service MVP
 * @see IFC-158: Scheduling communications with reminders
 */

/**
 * Notification Channel Types
 */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook' | 'in_app';

/**
 * Notification Priority
 */
export type NotificationPriority = 'high' | 'normal' | 'low';

/**
 * Notification Status
 */
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

/**
 * Email Notification Options
 */
export interface EmailNotificationOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
}

/**
 * Email Attachment
 */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
  encoding?: 'base64' | 'utf-8';
}

/**
 * SMS Notification Options
 */
export interface SmsNotificationOptions {
  to: string; // Phone number in E.164 format
  message: string;
  from?: string; // Sender ID or phone number
}

/**
 * Push Notification Options
 */
export interface PushNotificationOptions {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  icon?: string;
  badge?: number;
  sound?: string;
  clickAction?: string;
}

/**
 * Scheduled Notification
 */
export interface ScheduledNotification {
  id: string;
  channel: NotificationChannel;
  scheduledAt: Date;
  priority: NotificationPriority;
  status: NotificationStatus;
  retryCount: number;
  maxRetries: number;
  payload: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions;
}

/**
 * Notification Result
 */
export interface NotificationResult {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  error?: string;
  providerMessageId?: string;
}

/**
 * Domain Errors for Notifications
 */
export class NotificationDeliveryError extends DomainError {
  readonly code = 'NOTIFICATION_DELIVERY_ERROR';
  constructor(channel: NotificationChannel, message: string) {
    super(`${channel} notification delivery failed: ${message}`);
  }
}

export class NotificationSchedulingError extends DomainError {
  readonly code = 'NOTIFICATION_SCHEDULING_ERROR';
  constructor(message: string) {
    super(`Notification scheduling failed: ${message}`);
  }
}

/**
 * Notification Service Port Interface
 * Implementation lives in adapters layer
 */
export interface NotificationServicePort {
  /**
   * Send email notification immediately
   */
  sendEmail(options: EmailNotificationOptions): Promise<Result<NotificationResult, DomainError>>;

  /**
   * Send SMS notification immediately
   */
  sendSms(options: SmsNotificationOptions): Promise<Result<NotificationResult, DomainError>>;

  /**
   * Send push notification immediately
   */
  sendPush(options: PushNotificationOptions): Promise<Result<NotificationResult, DomainError>>;

  /**
   * Schedule notification for future delivery
   */
  schedule(
    channel: NotificationChannel,
    scheduledAt: Date,
    options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions,
    priority?: NotificationPriority
  ): Promise<Result<ScheduledNotification, DomainError>>;

  /**
   * Cancel scheduled notification
   */
  cancelScheduled(notificationId: string): Promise<Result<void, DomainError>>;

  /**
   * Get notification status
   */
  getStatus(notificationId: string): Promise<Result<NotificationResult, DomainError>>;

  /**
   * Batch send notifications
   */
  sendBatch(
    notifications: Array<{
      channel: NotificationChannel;
      options: EmailNotificationOptions | SmsNotificationOptions | PushNotificationOptions;
    }>
  ): Promise<Result<NotificationResult[], DomainError>>;

  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean;

  /**
   * Validate phone number format (E.164)
   */
  validatePhoneNumber(phoneNumber: string): boolean;
}

/**
 * Reminder Service Port
 * Specialized service for appointment reminders
 */
export interface ReminderServicePort {
  /**
   * Schedule reminder for appointment
   * Creates notifications across multiple channels
   */
  scheduleAppointmentReminder(
    appointmentId: string,
    reminderMinutes: number,
    appointmentStartTime: Date,
    recipientEmail: string,
    recipientPhone?: string,
    channels?: NotificationChannel[]
  ): Promise<Result<ScheduledNotification[], DomainError>>;

  /**
   * Cancel all reminders for an appointment
   */
  cancelAppointmentReminders(appointmentId: string): Promise<Result<void, DomainError>>;

  /**
   * Reschedule reminders when appointment changes
   */
  rescheduleAppointmentReminders(
    appointmentId: string,
    newStartTime: Date
  ): Promise<Result<ScheduledNotification[], DomainError>>;

  /**
   * Get upcoming reminders for an appointment
   */
  getAppointmentReminders(
    appointmentId: string
  ): Promise<Result<ScheduledNotification[], DomainError>>;
}
