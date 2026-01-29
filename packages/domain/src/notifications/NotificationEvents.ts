/**
 * Notification Domain Events
 * Events emitted during notification lifecycle
 * @see IFC-157: Notification service MVP
 */
import { DomainEvent } from '../shared/DomainEvent';
import { NotificationChannel, NotificationPriority } from './Notification';

/**
 * Emitted when a notification is created
 */
export class NotificationCreatedEvent extends DomainEvent {
  readonly eventType = 'NotificationCreated';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly channel: NotificationChannel,
    public readonly priority: NotificationPriority
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
      channel: this.channel,
      priority: this.priority,
    };
  }
}

/**
 * Emitted when a notification is sent successfully
 */
export class NotificationSentEvent extends DomainEvent {
  readonly eventType = 'NotificationSent';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly channel: NotificationChannel,
    public readonly providerMessageId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
      channel: this.channel,
      providerMessageId: this.providerMessageId,
    };
  }
}

/**
 * Emitted when a notification is delivered
 */
export class NotificationDeliveredEvent extends DomainEvent {
  readonly eventType = 'NotificationDelivered';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly channel: NotificationChannel
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
      channel: this.channel,
    };
  }
}

/**
 * Emitted when a notification delivery fails
 */
export class NotificationFailedEvent extends DomainEvent {
  readonly eventType = 'NotificationFailed';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly channel: NotificationChannel,
    public readonly error: string,
    public readonly retryCount: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
      channel: this.channel,
      error: this.error,
      retryCount: this.retryCount,
    };
  }
}

/**
 * Emitted when a notification is read (in-app notifications)
 */
export class NotificationReadEvent extends DomainEvent {
  readonly eventType = 'NotificationRead';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
    };
  }
}

/**
 * Emitted when notification preferences are updated
 */
export class NotificationPreferenceUpdatedEvent extends DomainEvent {
  readonly eventType = 'NotificationPreferenceUpdated';

  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly channel: NotificationChannel,
    public readonly enabled: boolean
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      userId: this.userId,
      tenantId: this.tenantId,
      channel: this.channel,
      enabled: this.enabled,
    };
  }
}

/**
 * Emitted when a notification is scheduled
 */
export class NotificationScheduledEvent extends DomainEvent {
  readonly eventType = 'NotificationScheduled';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly scheduledAt: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      recipientId: this.recipientId,
      scheduledAt: this.scheduledAt.toISOString(),
    };
  }
}

/**
 * Emitted when a notification is moved to DLQ
 */
export class NotificationMovedToDLQEvent extends DomainEvent {
  readonly eventType = 'NotificationMovedToDLQ';

  constructor(
    public readonly notificationId: string,
    public readonly tenantId: string,
    public readonly channel: NotificationChannel,
    public readonly error: string,
    public readonly retryCount: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      notificationId: this.notificationId,
      tenantId: this.tenantId,
      channel: this.channel,
      error: this.error,
      retryCount: this.retryCount,
    };
  }
}
