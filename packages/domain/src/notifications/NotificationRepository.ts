/**
 * NotificationRepository Interface
 * Port for notification persistence
 * @see IFC-157: Notification service MVP
 */
import { Notification, NotificationChannel, NotificationStatus } from './Notification';
import { NotificationId } from './NotificationId';

/**
 * Query options for finding notifications
 */
export interface NotificationQueryOptions {
  tenantId: string;
  recipientId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus | NotificationStatus[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * NotificationRepository Interface
 * Defines the contract for notification persistence
 */
export interface NotificationRepository {
  /**
   * Save a notification (create or update)
   */
  save(notification: Notification): Promise<void>;

  /**
   * Find notification by ID
   */
  findById(id: NotificationId): Promise<Notification | null>;

  /**
   * Find notifications by query
   */
  findByQuery(options: NotificationQueryOptions): Promise<Notification[]>;

  /**
   * Find pending notifications for delivery
   */
  findPendingForDelivery(
    tenantId: string,
    limit?: number
  ): Promise<Notification[]>;

  /**
   * Find scheduled notifications ready to send
   */
  findScheduledReadyToSend(
    now: Date,
    limit?: number
  ): Promise<Notification[]>;

  /**
   * Find failed notifications for retry
   */
  findFailedForRetry(
    maxRetries: number,
    limit?: number
  ): Promise<Notification[]>;

  /**
   * Count unread notifications for a recipient
   */
  countUnread(
    tenantId: string,
    recipientId: string
  ): Promise<number>;

  /**
   * Get recent notifications for a recipient
   */
  getRecentForRecipient(
    tenantId: string,
    recipientId: string,
    channel: NotificationChannel,
    limit?: number
  ): Promise<Notification[]>;

  /**
   * Mark all notifications as read for a recipient
   */
  markAllAsRead(
    tenantId: string,
    recipientId: string
  ): Promise<number>;

  /**
   * Delete old notifications (retention policy)
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Check if notification exists
   */
  exists(id: NotificationId): Promise<boolean>;
}
