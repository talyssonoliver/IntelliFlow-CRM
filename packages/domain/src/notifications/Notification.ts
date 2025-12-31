/**
 * Notification Entity
 * Core domain entity for the notification service
 * @see IFC-157: Notification service MVP
 */
import { AggregateRoot } from '../shared/AggregateRoot';
import { NotificationId } from './NotificationId';
import {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationDeliveredEvent,
} from './NotificationEvents';

/**
 * Notification delivery channels
 */
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push' | 'webhook';

/**
 * Notification status
 */
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read' | 'bounced';

/**
 * Notification priority
 */
export type NotificationPriority = 'high' | 'normal' | 'low';

/**
 * Notification constants (single source of truth)
 */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push', 'webhook'] as const;
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'delivered', 'failed', 'read', 'bounced'] as const;
export const NOTIFICATION_PRIORITIES = ['high', 'normal', 'low'] as const;

interface NotificationProps {
  tenantId: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  htmlBody?: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  templateId?: string;
  templateVariables?: Record<string, string>;
  metadata?: Record<string, unknown>;
  providerMessageId?: string;
  error?: string;
  retryCount: number;
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateNotificationInput {
  id: NotificationId;
  tenantId: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  htmlBody?: string;
  priority?: NotificationPriority;
  templateId?: string;
  templateVariables?: Record<string, string>;
  metadata?: Record<string, unknown>;
  scheduledAt?: Date;
}

export class Notification extends AggregateRoot<NotificationId> {
  private props: NotificationProps;

  private constructor(id: NotificationId, props: NotificationProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get tenantId(): string {
    return this.props.tenantId;
  }

  get recipientId(): string {
    return this.props.recipientId;
  }

  get recipientEmail(): string | undefined {
    return this.props.recipientEmail;
  }

  get recipientPhone(): string | undefined {
    return this.props.recipientPhone;
  }

  get channel(): NotificationChannel {
    return this.props.channel;
  }

  get subject(): string {
    return this.props.subject;
  }

  get body(): string {
    return this.props.body;
  }

  get htmlBody(): string | undefined {
    return this.props.htmlBody;
  }

  get priority(): NotificationPriority {
    return this.props.priority;
  }

  get status(): NotificationStatus {
    return this.props.status;
  }

  get templateId(): string | undefined {
    return this.props.templateId;
  }

  get templateVariables(): Record<string, string> | undefined {
    return this.props.templateVariables;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }

  get providerMessageId(): string | undefined {
    return this.props.providerMessageId;
  }

  get error(): string | undefined {
    return this.props.error;
  }

  get retryCount(): number {
    return this.props.retryCount;
  }

  get scheduledAt(): Date | undefined {
    return this.props.scheduledAt;
  }

  get sentAt(): Date | undefined {
    return this.props.sentAt;
  }

  get deliveredAt(): Date | undefined {
    return this.props.deliveredAt;
  }

  get readAt(): Date | undefined {
    return this.props.readAt;
  }

  get failedAt(): Date | undefined {
    return this.props.failedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Create a new notification
   */
  static create(input: CreateNotificationInput): Notification {
    const now = new Date();
    const props: NotificationProps = {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      recipientEmail: input.recipientEmail,
      recipientPhone: input.recipientPhone,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      htmlBody: input.htmlBody,
      priority: input.priority ?? 'normal',
      status: 'pending',
      templateId: input.templateId,
      templateVariables: input.templateVariables,
      metadata: input.metadata,
      retryCount: 0,
      scheduledAt: input.scheduledAt,
      createdAt: now,
      updatedAt: now,
    };

    const notification = new Notification(input.id, props);

    notification.addDomainEvent(
      new NotificationCreatedEvent(
        notification.id.value,
        notification.tenantId,
        notification.recipientId,
        notification.channel,
        notification.priority
      )
    );

    return notification;
  }

  /**
   * Reconstruct from persistence
   */
  static reconstitute(
    id: NotificationId,
    props: NotificationProps
  ): Notification {
    return new Notification(id, props);
  }

  /**
   * Mark notification as sent
   */
  markAsSent(providerMessageId: string): void {
    if (this.props.status !== 'pending') {
      throw new Error('Cannot send notification that is not pending');
    }

    this.props.status = 'sent';
    this.props.providerMessageId = providerMessageId;
    this.props.sentAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new NotificationSentEvent(
        this.id.value,
        this.props.tenantId,
        this.props.recipientId,
        this.props.channel,
        providerMessageId
      )
    );
  }

  /**
   * Mark notification as delivered
   */
  markAsDelivered(): void {
    if (this.props.status !== 'sent') {
      throw new Error('Cannot deliver notification that was not sent');
    }

    this.props.status = 'delivered';
    this.props.deliveredAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new NotificationDeliveredEvent(
        this.id.value,
        this.props.tenantId,
        this.props.recipientId,
        this.props.channel
      )
    );
  }

  /**
   * Mark notification as failed
   */
  markAsFailed(error: string): void {
    this.props.status = 'failed';
    this.props.error = error;
    this.props.failedAt = new Date();
    this.props.retryCount += 1;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new NotificationFailedEvent(
        this.id.value,
        this.props.tenantId,
        this.props.recipientId,
        this.props.channel,
        error,
        this.props.retryCount
      )
    );
  }

  /**
   * Mark notification as read (in-app notifications)
   */
  markAsRead(): void {
    if (this.props.status !== 'delivered' && this.props.status !== 'sent') {
      throw new Error('Cannot mark as read a notification that was not delivered');
    }

    this.props.status = 'read';
    this.props.readAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new NotificationReadEvent(
        this.id.value,
        this.props.tenantId,
        this.props.recipientId
      )
    );
  }

  /**
   * Reset for retry after failure
   */
  resetForRetry(): void {
    if (this.props.status !== 'failed') {
      throw new Error('Can only retry failed notifications');
    }

    this.props.status = 'pending';
    this.props.error = undefined;
    this.props.updatedAt = new Date();
  }

  /**
   * Check if notification can be retried
   */
  canRetry(maxRetries: number): boolean {
    return this.props.status === 'failed' && this.props.retryCount < maxRetries;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      tenantId: this.props.tenantId,
      recipientId: this.props.recipientId,
      recipientEmail: this.props.recipientEmail,
      recipientPhone: this.props.recipientPhone,
      channel: this.props.channel,
      subject: this.props.subject,
      body: this.props.body,
      htmlBody: this.props.htmlBody,
      priority: this.props.priority,
      status: this.props.status,
      templateId: this.props.templateId,
      templateVariables: this.props.templateVariables,
      metadata: this.props.metadata,
      providerMessageId: this.props.providerMessageId,
      error: this.props.error,
      retryCount: this.props.retryCount,
      scheduledAt: this.props.scheduledAt?.toISOString(),
      sentAt: this.props.sentAt?.toISOString(),
      deliveredAt: this.props.deliveredAt?.toISOString(),
      readAt: this.props.readAt?.toISOString(),
      failedAt: this.props.failedAt?.toISOString(),
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
