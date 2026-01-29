/**
 * Notifications Domain Module
 * @see IFC-157: Notification service MVP
 */

// Value Objects
export { NotificationId } from './NotificationId';

// Entities
export { Notification } from './Notification';
export type {
  NotificationChannel,
  NotificationStatus,
  NotificationPriority,
} from './Notification';
export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_PRIORITIES,
} from './Notification';

export { NotificationPreference } from './NotificationPreference';
export type {
  DeliveryFrequency,
  NotificationCategory,
  ChannelPreference,
} from './NotificationPreference';

// Events
export {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationDeliveredEvent,
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationPreferenceUpdatedEvent,
  NotificationScheduledEvent,
  NotificationMovedToDLQEvent,
} from './NotificationEvents';

// Repository Interfaces
export type { NotificationRepository, NotificationQueryOptions } from './NotificationRepository';
export type { NotificationPreferenceRepository } from './NotificationPreferenceRepository';
