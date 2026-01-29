/**
 * PrismaNotificationRepository
 * Prisma implementation of NotificationRepository port
 * @see IFC-157: Notification service MVP
 */
import { PrismaClient, Prisma } from '@intelliflow/db';
import {
  Notification,
  NotificationId,
  NotificationChannel,
  NotificationStatus,
  NotificationPriority,
  NotificationRepository,
  NotificationQueryOptions,
} from '@intelliflow/domain';

// Prisma DB enum types (uppercase)
type DbNotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK';
type DbNotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ' | 'BOUNCED';
type DbNotificationPriority = 'HIGH' | 'NORMAL' | 'LOW';

/**
 * Maps domain channel to Prisma enum
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

/**
 * Maps Prisma enum to domain channel
 */
function toDomainChannel(channel: DbNotificationChannel): NotificationChannel {
  const mapping: Record<DbNotificationChannel, NotificationChannel> = {
    IN_APP: 'in_app',
    EMAIL: 'email',
    SMS: 'sms',
    PUSH: 'push',
    WEBHOOK: 'webhook',
  };
  return mapping[channel];
}

/**
 * Maps domain status to Prisma enum
 */
function toDbStatus(status: NotificationStatus): DbNotificationStatus {
  const mapping: Record<NotificationStatus, DbNotificationStatus> = {
    pending: 'PENDING',
    sent: 'SENT',
    delivered: 'DELIVERED',
    failed: 'FAILED',
    read: 'READ',
    bounced: 'BOUNCED',
  };
  return mapping[status];
}

/**
 * Maps Prisma enum to domain status
 */
function toDomainStatus(status: DbNotificationStatus): NotificationStatus {
  const mapping: Record<DbNotificationStatus, NotificationStatus> = {
    PENDING: 'pending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    FAILED: 'failed',
    READ: 'read',
    BOUNCED: 'bounced',
  };
  return mapping[status];
}

/**
 * Maps domain priority to Prisma enum
 */
function toDbPriority(priority: NotificationPriority): DbNotificationPriority {
  const mapping: Record<NotificationPriority, DbNotificationPriority> = {
    high: 'HIGH',
    normal: 'NORMAL',
    low: 'LOW',
  };
  return mapping[priority];
}

/**
 * Maps Prisma enum to domain priority
 */
function toDomainPriority(priority: DbNotificationPriority): NotificationPriority {
  const mapping: Record<DbNotificationPriority, NotificationPriority> = {
    HIGH: 'high',
    NORMAL: 'normal',
    LOW: 'low',
  };
  return mapping[priority];
}

// Type for Prisma notification record
type NotificationRecord = Awaited<ReturnType<PrismaClient['notification']['findFirst']>>;

/**
 * Convert Prisma record to domain entity
 */
function toDomainEntity(record: NonNullable<NotificationRecord>): Notification {
  return Notification.reconstitute(
    NotificationId.create(record.id),
    {
      tenantId: record.tenantId,
      recipientId: record.recipientId,
      recipientEmail: record.recipientEmail ?? undefined,
      recipientPhone: record.recipientPhone ?? undefined,
      channel: toDomainChannel(record.channel),
      subject: record.subject,
      body: record.body,
      htmlBody: record.htmlBody ?? undefined,
      priority: toDomainPriority(record.priority),
      status: toDomainStatus(record.status),
      templateId: record.templateId ?? undefined,
      templateVariables: record.templateVariables as Record<string, string> | undefined,
      metadata: record.metadata as Record<string, unknown> | undefined,
      providerMessageId: record.providerMessageId ?? undefined,
      error: record.error ?? undefined,
      retryCount: record.retryCount,
      scheduledAt: record.scheduledAt ?? undefined,
      sentAt: record.sentAt ?? undefined,
      deliveredAt: record.deliveredAt ?? undefined,
      readAt: record.readAt ?? undefined,
      failedAt: record.failedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  );
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(notification: Notification): Promise<void> {
    const data = {
      tenantId: notification.tenantId,
      recipientId: notification.recipientId,
      recipientEmail: notification.recipientEmail,
      recipientPhone: notification.recipientPhone,
      channel: toDbChannel(notification.channel),
      subject: notification.subject,
      body: notification.body,
      htmlBody: notification.htmlBody,
      priority: toDbPriority(notification.priority),
      status: toDbStatus(notification.status),
      templateId: notification.templateId,
      templateVariables: notification.templateVariables as Prisma.InputJsonValue,
      metadata: notification.metadata as Prisma.InputJsonValue,
      providerMessageId: notification.providerMessageId,
      error: notification.error,
      retryCount: notification.retryCount,
      scheduledAt: notification.scheduledAt,
      sentAt: notification.sentAt,
      deliveredAt: notification.deliveredAt,
      readAt: notification.readAt,
      failedAt: notification.failedAt,
    };

    await this.prisma.notification.upsert({
      where: { id: notification.id.value },
      create: {
        id: notification.id.value,
        ...data,
      },
      update: data,
    });
  }

  async findById(id: NotificationId): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({
      where: { id: id.value },
    });

    return record ? toDomainEntity(record) : null;
  }

  async findByQuery(options: NotificationQueryOptions): Promise<Notification[]> {
    const where: Prisma.NotificationWhereInput = {
      tenantId: options.tenantId,
    };

    if (options.recipientId) {
      where.recipientId = options.recipientId;
    }

    if (options.channel) {
      where.channel = toDbChannel(options.channel);
    }

    if (options.status) {
      if (Array.isArray(options.status)) {
        where.status = { in: options.status.map(toDbStatus) };
      } else {
        where.status = toDbStatus(options.status);
      }
    }

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) {
        where.createdAt.gte = options.fromDate;
      }
      if (options.toDate) {
        where.createdAt.lte = options.toDate;
      }
    }

    const records = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
    });

    return records.map(toDomainEntity);
  }

  async findPendingForDelivery(
    tenantId: string,
    limit: number = 100
  ): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: {
        tenantId,
        status: 'PENDING',
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date() } },
        ],
      },
      orderBy: [
        { priority: 'asc' }, // HIGH = 0, NORMAL = 1, LOW = 2
        { createdAt: 'asc' },
      ],
      take: limit,
    });

    return records.map(toDomainEntity);
  }

  async findScheduledReadyToSend(
    now: Date,
    limit: number = 100
  ): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: {
          not: null,
          lte: now,
        },
      },
      orderBy: [
        { priority: 'asc' },
        { scheduledAt: 'asc' },
      ],
      take: limit,
    });

    return records.map(toDomainEntity);
  }

  async findFailedForRetry(
    maxRetries: number,
    limit: number = 100
  ): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: maxRetries },
      },
      orderBy: [
        { priority: 'asc' },
        { failedAt: 'asc' },
      ],
      take: limit,
    });

    return records.map(toDomainEntity);
  }

  async countUnread(
    tenantId: string,
    recipientId: string
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenantId,
        recipientId,
        channel: 'IN_APP',
        status: { in: ['SENT', 'DELIVERED'] },
        readAt: null,
      },
    });
  }

  async getRecentForRecipient(
    tenantId: string,
    recipientId: string,
    channel: NotificationChannel,
    limit: number = 50
  ): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: {
        tenantId,
        recipientId,
        channel: toDbChannel(channel),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map(toDomainEntity);
  }

  async markAllAsRead(
    tenantId: string,
    recipientId: string
  ): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId,
        recipientId,
        channel: 'IN_APP',
        status: { in: ['SENT', 'DELIVERED'] },
        readAt: null,
      },
      data: {
        status: 'READ',
        readAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: date },
        status: { in: ['READ', 'DELIVERED', 'BOUNCED'] },
      },
    });

    return result.count;
  }

  async exists(id: NotificationId): Promise<boolean> {
    const count = await this.prisma.notification.count({
      where: { id: id.value },
    });
    return count > 0;
  }
}
