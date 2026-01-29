/**
 * InMemoryNotificationRepository
 * In-memory implementation for testing
 * @see IFC-157: Notification service MVP
 */
import {
  Notification,
  NotificationId,
  NotificationChannel,
  NotificationRepository,
  NotificationQueryOptions,
} from '@intelliflow/domain';

export class InMemoryNotificationRepository implements NotificationRepository {
  private notifications: Map<string, Notification> = new Map();

  async save(notification: Notification): Promise<void> {
    this.notifications.set(notification.id.value, notification);
  }

  async findById(id: NotificationId): Promise<Notification | null> {
    return this.notifications.get(id.value) ?? null;
  }

  async findByQuery(options: NotificationQueryOptions): Promise<Notification[]> {
    let results = Array.from(this.notifications.values())
      .filter(n => n.tenantId === options.tenantId);

    if (options.recipientId) {
      results = results.filter(n => n.recipientId === options.recipientId);
    }

    if (options.channel) {
      results = results.filter(n => n.channel === options.channel);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter(n => statuses.includes(n.status));
    }

    if (options.fromDate) {
      results = results.filter(n => n.createdAt >= options.fromDate!);
    }

    if (options.toDate) {
      results = results.filter(n => n.createdAt <= options.toDate!);
    }

    // Sort by createdAt desc
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async findPendingForDelivery(
    tenantId: string,
    limit: number = 100
  ): Promise<Notification[]> {
    const now = new Date();
    return Array.from(this.notifications.values())
      .filter(n =>
        n.tenantId === tenantId &&
        n.status === 'pending' &&
        (!n.scheduledAt || n.scheduledAt <= now)
      )
      .sort((a, b) => {
        // Sort by priority then by createdAt
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .slice(0, limit);
  }

  async findScheduledReadyToSend(
    now: Date,
    limit: number = 100
  ): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(n =>
        n.status === 'pending' &&
        n.scheduledAt &&
        n.scheduledAt <= now
      )
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0);
      })
      .slice(0, limit);
  }

  async findFailedForRetry(
    maxRetries: number,
    limit: number = 100
  ): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(n =>
        n.status === 'failed' &&
        n.retryCount < maxRetries
      )
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.failedAt?.getTime() ?? 0) - (b.failedAt?.getTime() ?? 0);
      })
      .slice(0, limit);
  }

  async countUnread(
    tenantId: string,
    recipientId: string
  ): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(n =>
        n.tenantId === tenantId &&
        n.recipientId === recipientId &&
        n.channel === 'in_app' &&
        (n.status === 'sent' || n.status === 'delivered') &&
        !n.readAt
      ).length;
  }

  async getRecentForRecipient(
    tenantId: string,
    recipientId: string,
    channel: NotificationChannel,
    limit: number = 50
  ): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(n =>
        n.tenantId === tenantId &&
        n.recipientId === recipientId &&
        n.channel === channel
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async markAllAsRead(
    tenantId: string,
    recipientId: string
  ): Promise<number> {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (
        notification.tenantId === tenantId &&
        notification.recipientId === recipientId &&
        notification.channel === 'in_app' &&
        (notification.status === 'sent' || notification.status === 'delivered') &&
        !notification.readAt
      ) {
        notification.markAsRead();
        count++;
      }
    }
    return count;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    let count = 0;
    for (const [id, notification] of this.notifications.entries()) {
      if (
        notification.createdAt < date &&
        ['read', 'delivered', 'bounced'].includes(notification.status)
      ) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  async exists(id: NotificationId): Promise<boolean> {
    return this.notifications.has(id.value);
  }

  // Test helpers
  clear(): void {
    this.notifications.clear();
  }

  getAll(): Notification[] {
    return Array.from(this.notifications.values());
  }

  count(): number {
    return this.notifications.size;
  }
}
