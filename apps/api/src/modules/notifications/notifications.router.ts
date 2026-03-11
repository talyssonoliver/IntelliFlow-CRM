/**
 * Notifications Router
 *
 * Provides type-safe tRPC endpoints for notification management:
 * - List notifications (paginated, filtered)
 * - Get unread count
 * - Mark as read (single/multiple/all)
 * - Delete notifications
 * - Notification preferences
 * - Real-time subscription via WebSocket
 *
 * Task: IFC-183 - Notifications tRPC Router
 * KPIs: All endpoints <200ms; real-time latency <100ms; test coverage >=90%
 *
 * Uses Notification table (not DomainEvent) per IFC-157 migration.
 * All endpoints use tenantProcedure for tenant isolation.
 */

import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { type Context } from '../../context';
import {
  notificationListQuerySchema,
  markAsReadInputSchema,
  deleteNotificationsInputSchema,
  updatePreferencesInputSchema,
  notificationSubscriptionInputSchema,
  batchNotificationActionSchema,
  type NotificationListResponse,
  type UnreadCountResponse,
  type MarkAsReadResponse,
  type DeleteNotificationsResponse,
  type NotificationPreferences,
  type BatchNotificationResponse,
  type Notification,
  type NotificationEvent,
  NOTIFICATION_TYPES,
} from '@intelliflow/validators';

// =============================================================================
// Event Emitter for Real-time Updates
// Uses an in-process EventEmitter scoped to a single server instance.
// Note: For multi-instance deployments, swap this for a Redis pub/sub adapter
//       so that notifications published on one instance are received on all.
// =============================================================================

import { EventEmitter } from 'node:events';

const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(100);

type NotificationEventType = 'new' | 'read' | 'deleted' | 'updated';

interface NotificationEmitPayload {
  userId: string;
  eventType: NotificationEventType;
  notification?: Notification;
  notificationId: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function emitNotificationEvent(payload: NotificationEmitPayload) {
  notificationEmitter.emit(`notification:${payload.userId}`, payload);
}

/**
 * Map Prisma Notification record to validator Notification type
 */
function mapDbToNotification(record: any): Notification {
  return {
    id: record.id,
    type: record.metadata?.notificationType || 'system_alert',
    title: record.subject,
    body: record.body,
    priority: record.priority?.toLowerCase() || 'normal',
    status: record.status === 'READ' ? 'read' : record.status?.toLowerCase() || 'pending',
    isRead: record.status === 'READ',
    readAt: record.readAt || null,
    createdAt: record.createdAt,
    expiresAt: null,
    entityType: record.sourceType || null,
    entityId: record.sourceId || null,
    entityName: record.metadata?.entityName || null,
    actionUrl: record.metadata?.actionUrl || null,
    actionLabel: record.metadata?.actionLabel || null,
    actor: record.metadata?.actor || null,
    groupId: record.metadata?.groupId || null,
    groupCount: record.metadata?.groupCount,
    metadata: record.metadata,
  };
}

/**
 * Creates the event handler for the onNew subscription observable.
 * Extracted for testability — V8 coverage requires exercising the handler directly.
 */
function createSubscriptionHandler(
  userId: string,
  types?: readonly string[],
  priorities?: readonly string[]
) {
  return (emit: { next: (event: NotificationEvent) => void }) => {
    const handler = (payload: NotificationEmitPayload) => {
      if (types && types.length > 0 && payload.notification) {
        if (!types.includes(payload.notification.type as any)) {
          return;
        }
      }

      if (priorities && priorities.length > 0 && payload.notification) {
        if (!priorities.includes(payload.notification.priority as any)) {
          return;
        }
      }

      emit.next({
        eventType: payload.eventType,
        notification: payload.notification,
        notificationId: payload.notificationId,
        timestamp: new Date(),
      });
    };

    notificationEmitter.on(`notification:${userId}`, handler);

    return () => {
      notificationEmitter.off(`notification:${userId}`, handler);
    };
  };
}

// =============================================================================
// Preference Update Helpers
// =============================================================================

/** Build updated channel preferences by merging existing with input. */
function buildUpdatedChannelPrefs(
  current: Record<string, unknown>,
  input: { defaultChannels?: string[]; emailDigest?: unknown }
): Record<string, unknown> {
  return {
    ...current,
    ...(input.defaultChannels ? { defaultChannels: input.defaultChannels } : {}),
    ...(input.emailDigest ? { emailDigest: input.emailDigest } : {}),
  };
}

/** Build updated category preferences by merging with the provided preference array. */
function buildUpdatedCategoryPrefs(
  current: Record<string, unknown>,
  preferences?: Array<{ type: string; enabled?: boolean; channels?: string[]; frequency?: string }>
): Record<string, unknown> {
  if (!preferences) return current;
  const updated = { ...current };
  for (const pref of preferences) {
    updated[pref.type] = {
      ...(updated[pref.type] as Record<string, unknown>),
      enabled: pref.enabled ?? true,
      channels: pref.channels,
      frequency: pref.frequency,
    };
  }
  return updated;
}

/** Build the upsert data for notification preferences. */
function buildPreferenceUpsertData(
  tenantId: string,
  userId: string,
  input: {
    globalEnabled?: boolean;
    quietHours?: {
      enabled: boolean;
      start: string;
      end: string;
      timezone: string;
    };
  },
  channelPrefs: Record<string, unknown>,
  categoryPrefs: Record<string, unknown>
) {
  const createData = {
    tenantId,
    userId,
    doNotDisturb: input.globalEnabled === false,
    quietHoursEnabled: input.quietHours?.enabled ?? false,
    quietHoursStart: input.quietHours?.start || '22:00',
    quietHoursEnd: input.quietHours?.end || '08:00',
    timezone: input.quietHours?.timezone || 'UTC',
    channelPreferences: channelPrefs as any,
    categoryPreferences: categoryPrefs as any,
  };

  const updateData: Record<string, unknown> = {
    channelPreferences: channelPrefs as any,
    categoryPreferences: categoryPrefs as any,
  };
  if (input.globalEnabled !== undefined) {
    updateData.doNotDisturb = !input.globalEnabled;
  }
  if (input.quietHours) {
    updateData.quietHoursEnabled = input.quietHours.enabled;
    updateData.quietHoursStart = input.quietHours.start;
    updateData.quietHoursEnd = input.quietHours.end;
    updateData.timezone = input.quietHours.timezone;
  }

  return { createData, updateData };
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Build the Prisma WHERE clause for the notifications list query.
 * Extracts the sequential filter-building logic to reduce cognitive complexity.
 */
/** Append a type-filter clause using JSON path equals (single) or AND+OR (multiple). */
function applyTypeFilter(
  types: string[],
  where: Record<string, unknown>
): void {
  if (types.length === 1) {
    where.metadata = { path: ['notificationType'], equals: types[0] };
  } else {
    // Use AND to nest the OR so it doesn't collide with search OR
    const andClauses = Array.isArray(where.AND) ? (where.AND as unknown[]) : [];
    andClauses.push({
      OR: types.map((t) => ({
        metadata: { path: ['notificationType'], equals: t },
      })),
    });
    where.AND = andClauses;
  }
}

/** Apply batch-action filter to an existing where clause. */
function applyBatchFilter(
  filter: { types?: string[]; olderThan?: Date; isRead?: boolean },
  where: Record<string, unknown>
): void {
  const andClauses: unknown[] = Array.isArray(where.AND) ? (where.AND as unknown[]) : [];

  if (filter.types && filter.types.length > 0) {
    applyTypeFilter(filter.types, where);
    if (andClauses.length > 0) where.AND = andClauses;
  }

  if (filter.olderThan) where.createdAt = { lt: filter.olderThan };
  if (filter.isRead !== undefined) where.status = filter.isRead ? 'READ' : 'PENDING';
}

/** Apply date-range filter to where clause. */
function applyDateRangeFilter(
  where: Record<string, unknown>,
  fromDate?: Date,
  toDate?: Date
): void {
  if (!fromDate && !toDate) return;
  const createdAt: Record<string, Date> = {};
  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lte = toDate;
  where.createdAt = createdAt;
}

function buildNotificationListWhere(
  tenantId: string,
  userId: string,
  filters: {
    types?: string[];
    priorities?: string[];
    status?: string;
    isRead?: boolean;
    fromDate?: Date;
    toDate?: Date;
    search?: string;
    cursor?: string;
  }
): any {
  const { types, priorities, status, isRead, fromDate, toDate, search, cursor } = filters;
  const where: Record<string, unknown> = { tenantId, recipientId: userId };

  if (types && types.length > 0) applyTypeFilter(types, where);
  if (priorities && priorities.length > 0) where.priority = { in: priorities.map((p: string) => p.toUpperCase()) };
  if (status) where.status = status.toUpperCase();

  applyDateRangeFilter(where, fromDate, toDate);

  // isRead overrides status when both are supplied
  if (isRead !== undefined) where.status = isRead ? 'READ' : 'PENDING';

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { body: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (cursor) where.id = { lt: cursor };

  return where;
}

// =============================================================================
// Router Implementation
// =============================================================================

export const notificationsRouter = createTRPCRouter({
  /**
   * List notifications with pagination and filtering
   * Queries Notification table with tenant isolation
   */
  list: tenantProcedure
    .input(notificationListQuerySchema)
    .query(async ({ ctx, input }): Promise<NotificationListResponse> => {
      const startTime = performance.now();
      const userId = ctx.tenant.userId;
      const tenantId = ctx.tenant.tenantId;
      const { limit, cursor, types, priorities, status, isRead, fromDate, toDate, search } = input;

      // Build WHERE clause on Notification table
      const where: any = buildNotificationListWhere(tenantId, userId, {
        types,
        priorities,
        status,
        isRead,
        fromDate,
        toDate,
        search,
        cursor,
      });

      const records = await ctx.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
      });

      const hasMore = records.length > limit;
      const items = records.slice(0, limit);
      const notifications = items.map(mapDbToNotification);

      const [unreadCount, total] = await Promise.all([
        ctx.prisma.notification.count({
          where: { tenantId, recipientId: userId, status: 'PENDING' },
        }),
        ctx.prisma.notification.count({
          where: { tenantId, recipientId: userId },
        }),
      ]);

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[notifications.list] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        notifications,
        nextCursor: hasMore ? items.at(-1)?.id : null,
        hasMore,
        total,
        unreadCount,
      };
    }),

  /**
   * Get unread notification count by priority
   * Uses Notification table with 3-bucket response (high/normal/low)
   */
  getUnreadCount: tenantProcedure.query(async ({ ctx }): Promise<UnreadCountResponse> => {
    const startTime = performance.now();
    const userId = ctx.tenant.userId;
    const tenantId = ctx.tenant.tenantId;

    const baseWhere = { tenantId, recipientId: userId, status: 'PENDING' as const };

    const [total, highCount, normalCount, lowCount] = await Promise.all([
      ctx.prisma.notification.count({ where: baseWhere }),
      ctx.prisma.notification.count({ where: { ...baseWhere, priority: 'HIGH' } }),
      ctx.prisma.notification.count({ where: { ...baseWhere, priority: 'NORMAL' } }),
      ctx.prisma.notification.count({ where: { ...baseWhere, priority: 'LOW' } }),
    ]);

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(
        `[notifications.getUnreadCount] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`
      );
    }

    return {
      total,
      byPriority: {
        high: highCount,
        normal: normalCount,
        low: lowCount,
      },
    };
  }),

  /**
   * Mark notifications as read
   * Sets readAt and status=READ on Notification table
   */
  markAsRead: tenantProcedure
    .input(markAsReadInputSchema)
    .mutation(async ({ ctx, input }): Promise<MarkAsReadResponse> => {
      const startTime = performance.now();
      const userId = ctx.tenant.userId;
      const tenantId = ctx.tenant.tenantId;
      const { notificationIds } = input;

      const result = await ctx.prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          tenantId,
          recipientId: userId,
          status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
        },
        data: {
          status: 'READ',
          readAt: new Date(),
        },
      });

      notificationIds.forEach((id) => {
        emitNotificationEvent({ userId, eventType: 'read', notificationId: id });
      });

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[notifications.markAsRead] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        success: true,
        updatedCount: result.count,
        updatedIds: notificationIds,
      };
    }),

  /**
   * Mark all notifications as read — atomic single updateMany (no TOCTOU race)
   */
  markAllAsRead: tenantProcedure.mutation(async ({ ctx }): Promise<MarkAsReadResponse> => {
    const startTime = performance.now();
    const userId = ctx.tenant.userId;
    const tenantId = ctx.tenant.tenantId;

    const result = await ctx.prisma.notification.updateMany({
      where: {
        tenantId,
        recipientId: userId,
        status: { not: 'READ' },
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[notifications.markAllAsRead] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      success: true,
      updatedCount: result.count,
      updatedIds: [],
    };
  }),

  /**
   * Delete notifications
   * permanent=true: real deleteMany; permanent=false: set status=ARCHIVED
   */
  delete: tenantProcedure
    .input(deleteNotificationsInputSchema)
    .mutation(async ({ ctx, input }): Promise<DeleteNotificationsResponse> => {
      const startTime = performance.now();
      const userId = ctx.tenant.userId;
      const tenantId = ctx.tenant.tenantId;
      const { notificationIds, permanent } = input;

      const baseWhere = {
        id: { in: notificationIds },
        tenantId,
        recipientId: userId,
      };

      let deletedCount: number;

      if (permanent) {
        const result = await ctx.prisma.notification.deleteMany({ where: baseWhere });
        deletedCount = result.count;
      } else {
        const result = await ctx.prisma.notification.updateMany({
          where: baseWhere,
          data: { status: 'ARCHIVED' as any },
        });
        deletedCount = result.count;
      }

      notificationIds.forEach((id) => {
        emitNotificationEvent({ userId, eventType: 'deleted', notificationId: id });
      });

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[notifications.delete] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        success: true,
        deletedCount,
        deletedIds: notificationIds,
      };
    }),

  /**
   * Get notification preferences from NotificationPreference table
   */
  getPreferences: tenantProcedure.query(async ({ ctx }): Promise<NotificationPreferences> => {
    const userId = ctx.tenant.userId;
    const tenantId = ctx.tenant.tenantId;

    const record = await ctx.prisma.notificationPreference.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    const channelPrefs = (record?.channelPreferences as any) || {};
    const categoryPrefs = (record?.categoryPreferences as any) || {};

    const defaultPreferences = NOTIFICATION_TYPES.map((type) => ({
      type,
      enabled: categoryPrefs[type]?.enabled ?? true,
      channels: channelPrefs[type]?.channels || ['in_app'],
      frequency: categoryPrefs[type]?.frequency || 'instant',
    }));

    return {
      userId,
      globalEnabled: record ? !record.doNotDisturb : true,
      defaultChannels: channelPrefs.defaultChannels || ['in_app', 'email'],
      quietHours: {
        enabled: record?.quietHoursEnabled ?? false,
        start: record?.quietHoursStart || '22:00',
        end: record?.quietHoursEnd || '08:00',
        timezone: record?.timezone || 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      emailDigest: channelPrefs.emailDigest || {
        enabled: false,
        frequency: 'daily',
        time: '09:00',
      },
      preferences: defaultPreferences,
      updatedAt: record?.updatedAt || new Date(),
    };
  }),

  /**
   * Update notification preferences via upsert to NotificationPreference table
   */
  updatePreferences: tenantProcedure
    .input(updatePreferencesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.tenant.userId;
      const tenantId = ctx.tenant.tenantId;

      const existing = await ctx.prisma.notificationPreference.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
      });

      const currentChannelPrefs = (existing?.channelPreferences as Record<string, unknown>) || {};
      const currentCategoryPrefs =
        (existing?.categoryPreferences as Record<string, unknown>) || {};

      const updatedChannelPrefs = buildUpdatedChannelPrefs(currentChannelPrefs, input);
      const updatedCategoryPrefs = buildUpdatedCategoryPrefs(
        currentCategoryPrefs,
        input.preferences as
          | Array<{ type: string; enabled?: boolean; channels?: string[]; frequency?: string }>
          | undefined
      );

      const { createData, updateData } = buildPreferenceUpsertData(
        tenantId,
        userId,
        input,
        updatedChannelPrefs,
        updatedCategoryPrefs
      );

      await ctx.prisma.notificationPreference.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: createData,
        update: updateData as any,
      });

      return { success: true, message: 'Preferences updated successfully' };
    }),

  /**
   * Batch notification actions
   */
  batchAction: tenantProcedure
    .input(batchNotificationActionSchema)
    .mutation(async ({ ctx, input }): Promise<BatchNotificationResponse> => {
      const startTime = performance.now();
      const userId = ctx.tenant.userId;
      const tenantId = ctx.tenant.tenantId;
      const { action, notificationIds, filter } = input;

      const where: any = {
        tenantId,
        recipientId: userId,
      };

      if (notificationIds && notificationIds.length > 0) {
        where.id = { in: notificationIds };
      }

      if (filter) {
        applyBatchFilter(filter, where);
      }

      let result;
      switch (action) {
        case 'mark_read':
          result = await ctx.prisma.notification.updateMany({
            where,
            data: { status: 'READ', readAt: new Date() },
          });
          break;
        case 'mark_unread':
          result = await ctx.prisma.notification.updateMany({
            where,
            data: { status: 'PENDING', readAt: null },
          });
          break;
        case 'archive':
          result = await ctx.prisma.notification.updateMany({
            where,
            data: { status: 'ARCHIVED' as any },
          });
          break;
        case 'delete':
          result = await ctx.prisma.notification.deleteMany({ where });
          break;
        /* v8 ignore next 4 -- Zod enum validation prevents reaching default */
        default:
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown action: ${action}`,
          });
      }

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[notifications.batchAction] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        success: true,
        affectedCount: result.count,
      };
    }),

  /**
   * Real-time notification subscription
   * KPI: Real-time latency <100ms (in-process EventEmitter)
   */
  onNew: tenantProcedure
    .input(notificationSubscriptionInputSchema)
    // NOSONAR typescript:S1874 — legacy observable subscription, tRPC v11 async iterator migration tracked separately
    .subscription(({ ctx, input }) => {
      const userId = ctx.tenant.userId;
      return observable<NotificationEvent>(
        createSubscriptionHandler(userId, input.types, input.priorities)
      );
    }),
});

// =============================================================================
// Export helper for creating notifications
// =============================================================================

/**
 * Create and emit a new notification
 * Writes to Notification table (not DomainEvent). Uses Prisma @default(cuid()) for ID.
 */
export async function createNotification(
  prisma: Context['prisma'],
  params: {
    userId: string;
    tenantId: string;
    type: (typeof NOTIFICATION_TYPES)[number];
    title: string;
    body: string;
    priority?: 'high' | 'normal' | 'low';
    entityType?: string;
    entityId?: string;
    entityName?: string;
    actionUrl?: string;
    actionLabel?: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }
): Promise<Notification> {
  const priorityEnum = (params.priority || 'normal').toUpperCase();

  const record = await prisma.notification.create({
    data: {
      tenantId: params.tenantId,
      recipientId: params.userId,
      channel: 'IN_APP',
      subject: params.title,
      body: params.body,
      priority: priorityEnum as any,
      status: 'PENDING',
      category: 'SYSTEM',
      sourceType: params.entityType,
      sourceId: params.entityId,
      metadata: {
        notificationType: params.type,
        entityName: params.entityName,
        actionUrl: params.actionUrl,
        actionLabel: params.actionLabel,
        ...params.metadata,
      },
    },
  });

  const notification: Notification = {
    id: record.id,
    type: params.type,
    title: params.title,
    body: params.body,
    priority: params.priority || 'normal',
    status: 'pending',
    isRead: false,
    readAt: null,
    createdAt: record.createdAt,
    expiresAt: params.expiresAt || null,
    entityType: params.entityType || null,
    entityId: params.entityId || null,
    entityName: params.entityName || null,
    actionUrl: params.actionUrl || null,
    actionLabel: params.actionLabel || null,
    actor: null,
    groupId: null,
    metadata: record.metadata as any,
  };

  emitNotificationEvent({
    userId: params.userId,
    eventType: 'new',
    notification,
    notificationId: record.id,
  });

  return notification;
}

// Export for testing
export { notificationEmitter, createSubscriptionHandler };

export type NotificationsRouter = typeof notificationsRouter;
