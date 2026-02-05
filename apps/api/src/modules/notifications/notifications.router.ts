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
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
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
  NOTIFICATION_CHANNELS,
} from '@intelliflow/validators';

// =============================================================================
// Event Emitter for Real-time Updates
// =============================================================================

import { EventEmitter } from 'events';

// Global event emitter for notification events
const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(100);

// Event types
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

/**
 * Get user ID from context
 */
function getUserId(ctx: Context): string {
  if (!ctx.user?.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User ID not found in context',
    });
  }
  return ctx.user.userId;
}

/**
 * Get tenant ID from context
 */
function getTenantId(ctx: Context): string {
  if (!ctx.user?.tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Tenant ID not found in user context',
    });
  }
  return ctx.user.tenantId;
}

/**
 * Emit notification event for real-time updates
 */
function emitNotificationEvent(payload: NotificationEmitPayload) {
  notificationEmitter.emit(`notification:${payload.userId}`, payload);
}

/**
 * Map domain event to notification
 */
function mapToNotification(event: any, userId: string): Notification {
  const payload = event.payload as any;

  return {
    id: event.id,
    type: payload?.notificationType || 'system_alert',
    title: payload?.title || event.eventType,
    body: payload?.body || payload?.description || '',
    priority: payload?.priority || 'medium',
    status: event.status === 'PROCESSED' ? 'read' : 'unread',
    isRead: event.status === 'PROCESSED',
    readAt: event.status === 'PROCESSED' ? event.processedAt : null,
    createdAt: event.occurredAt,
    expiresAt: payload?.expiresAt ? new Date(payload.expiresAt) : null,
    entityType: event.aggregateType,
    entityId: event.aggregateId,
    entityName: payload?.entityName || null,
    actionUrl: payload?.actionUrl || null,
    actionLabel: payload?.actionLabel || null,
    actor: payload?.actor || null,
    groupId: payload?.groupId || null,
    groupCount: payload?.groupCount,
    metadata: event.metadata,
  };
}

// =============================================================================
// Router Implementation
// =============================================================================

export const notificationsRouter = createTRPCRouter({
  /**
   * List notifications with pagination and filtering
   */
  list: protectedProcedure
    .input(notificationListQuerySchema)
    .query(async ({ ctx, input }): Promise<NotificationListResponse> => {
      const startTime = performance.now();
      const userId = getUserId(ctx);
      const { limit, cursor, types, priorities, status, isRead, fromDate, toDate, search } = input;

      // Build where clause for domain events (notification source)
      const where: any = {
        eventType: { startsWith: 'Notification' },
        OR: [
          { metadata: { path: ['targetUserId'], equals: userId } },
          { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
        ],
      };

      // Filter by types
      if (types && types.length > 0) {
        where.payload = {
          path: ['notificationType'],
          in: types,
        };
      }

      // Filter by date range
      if (fromDate) {
        where.occurredAt = { ...where.occurredAt, gte: fromDate };
      }
      if (toDate) {
        where.occurredAt = { ...where.occurredAt, lte: toDate };
      }

      // Filter by read status
      if (isRead !== undefined) {
        where.status = isRead ? 'PROCESSED' : 'PENDING';
      }

      // Cursor pagination
      if (cursor) {
        where.id = { lt: cursor };
      }

      // Fetch notifications from domain events
      const events = await ctx.prisma.domainEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit + 1,
      });

      const hasMore = events.length > limit;
      const items = events.slice(0, limit);

      // Map to notification format
      const notifications = items.map((event) => mapToNotification(event, userId));

      // Get unread count
      const unreadCount = await ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          status: 'PENDING',
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      });

      // Get total count
      const total = await ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      });

      const duration = performance.now() - startTime;
      if (duration > 200) {
        console.warn(`[notifications.list] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
      }

      return {
        notifications,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
        hasMore,
        total,
        unreadCount,
      };
    }),

  /**
   * Get unread notification count
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }): Promise<UnreadCountResponse> => {
    const startTime = performance.now();
    const userId = getUserId(ctx);

    // Count unread notifications
    const total = await ctx.prisma.domainEvent.count({
      where: {
        eventType: { startsWith: 'Notification' },
        status: 'PENDING',
        OR: [
          { metadata: { path: ['targetUserId'], equals: userId } },
          { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
        ],
      },
    });

    // Count by priority
    const [lowCount, mediumCount, highCount, urgentCount] = await Promise.all([
      ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          status: 'PENDING',
          payload: { path: ['priority'], equals: 'low' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      }),
      ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          status: 'PENDING',
          payload: { path: ['priority'], equals: 'medium' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      }),
      ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          status: 'PENDING',
          payload: { path: ['priority'], equals: 'high' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      }),
      ctx.prisma.domainEvent.count({
        where: {
          eventType: { startsWith: 'Notification' },
          status: 'PENDING',
          payload: { path: ['priority'], equals: 'urgent' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
      }),
    ]);

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[notifications.getUnreadCount] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      total,
      byPriority: {
        low: lowCount,
        medium: mediumCount,
        high: highCount,
        urgent: urgentCount,
      },
    };
  }),

  /**
   * Mark notifications as read
   */
  markAsRead: protectedProcedure
    .input(markAsReadInputSchema)
    .mutation(async ({ ctx, input }): Promise<MarkAsReadResponse> => {
      const startTime = performance.now();
      const userId = getUserId(ctx);
      const { notificationIds } = input;

      // Update domain events to PROCESSED status
      const result = await ctx.prisma.domainEvent.updateMany({
        where: {
          id: { in: notificationIds },
          eventType: { startsWith: 'Notification' },
          OR: [
            { metadata: { path: ['targetUserId'], equals: userId } },
            { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
          ],
        },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      // Emit events for real-time updates
      notificationIds.forEach((id) => {
        emitNotificationEvent({
          userId,
          eventType: 'read',
          notificationId: id,
        });
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
   * Mark all notifications as read
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }): Promise<MarkAsReadResponse> => {
    const startTime = performance.now();
    const userId = getUserId(ctx);

    // Get IDs of unread notifications
    const unreadEvents = await ctx.prisma.domainEvent.findMany({
      where: {
        eventType: { startsWith: 'Notification' },
        status: 'PENDING',
        OR: [
          { metadata: { path: ['targetUserId'], equals: userId } },
          { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
        ],
      },
      select: { id: true },
    });

    const ids = unreadEvents.map((e) => e.id);

    // Update all to PROCESSED
    const result = await ctx.prisma.domainEvent.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    // Emit events for real-time updates
    ids.forEach((id) => {
      emitNotificationEvent({
        userId,
        eventType: 'read',
        notificationId: id,
      });
    });

    const duration = performance.now() - startTime;
    if (duration > 200) {
      console.warn(`[notifications.markAllAsRead] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
    }

    return {
      success: true,
      updatedCount: result.count,
      updatedIds: ids,
    };
  }),

  /**
   * Delete notifications
   */
  delete: protectedProcedure
    .input(deleteNotificationsInputSchema)
    .mutation(async ({ ctx, input }): Promise<DeleteNotificationsResponse> => {
      const startTime = performance.now();
      const userId = getUserId(ctx);
      const { notificationIds, permanent } = input;

      if (permanent) {
        // Permanent delete (for domain events, we can't really delete, so mark as archived)
        const result = await ctx.prisma.domainEvent.updateMany({
          where: {
            id: { in: notificationIds },
            eventType: { startsWith: 'Notification' },
            OR: [
              { metadata: { path: ['targetUserId'], equals: userId } },
              { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
            ],
          },
          data: {
            status: 'ARCHIVED',
          },
        });

        notificationIds.forEach((id) => {
          emitNotificationEvent({
            userId,
            eventType: 'deleted',
            notificationId: id,
          });
        });

        return {
          success: true,
          deletedCount: result.count,
          deletedIds: notificationIds,
        };
      } else {
        // Soft delete - mark as archived
        const result = await ctx.prisma.domainEvent.updateMany({
          where: {
            id: { in: notificationIds },
            eventType: { startsWith: 'Notification' },
            OR: [
              { metadata: { path: ['targetUserId'], equals: userId } },
              { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
            ],
          },
          data: {
            status: 'ARCHIVED',
          },
        });

        const duration = performance.now() - startTime;
        if (duration > 200) {
          console.warn(`[notifications.delete] SLOW: ${duration.toFixed(2)}ms (target: <200ms)`);
        }

        return {
          success: true,
          deletedCount: result.count,
          deletedIds: notificationIds,
        };
      }
    }),

  /**
   * Get notification preferences
   */
  getPreferences: protectedProcedure.query(async ({ ctx }): Promise<NotificationPreferences> => {
    const userId = getUserId(ctx);

    // Get user preferences
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as any)?.notifications || {};

    // Build default preferences for all notification types
    const defaultPreferences = NOTIFICATION_TYPES.map((type) => ({
      type,
      enabled: prefs.typePreferences?.[type]?.enabled ?? true,
      channels: prefs.typePreferences?.[type]?.channels || ['in_app'],
      frequency: prefs.typePreferences?.[type]?.frequency || 'instant',
    }));

    return {
      userId,
      globalEnabled: prefs.globalEnabled ?? true,
      defaultChannels: prefs.defaultChannels || ['in_app', 'email'],
      quietHours: prefs.quietHours || {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      emailDigest: prefs.emailDigest || {
        enabled: false,
        frequency: 'daily',
        time: '09:00',
      },
      preferences: defaultPreferences,
      updatedAt: new Date(),
    };
  }),

  /**
   * Update notification preferences
   */
  updatePreferences: protectedProcedure
    .input(updatePreferencesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);

      // Get current preferences
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      const currentPrefs = (user?.preferences as any) || {};
      const currentNotifPrefs = currentPrefs.notifications || {};

      // Merge updates
      const updatedNotifPrefs = {
        ...currentNotifPrefs,
        globalEnabled: input.globalEnabled ?? currentNotifPrefs.globalEnabled,
        defaultChannels: input.defaultChannels ?? currentNotifPrefs.defaultChannels,
        quietHours: input.quietHours ?? currentNotifPrefs.quietHours,
        emailDigest: input.emailDigest ?? currentNotifPrefs.emailDigest,
      };

      // Update type-specific preferences
      if (input.preferences) {
        updatedNotifPrefs.typePreferences = updatedNotifPrefs.typePreferences || {};
        input.preferences.forEach((pref) => {
          updatedNotifPrefs.typePreferences[pref.type] = {
            ...updatedNotifPrefs.typePreferences[pref.type],
            enabled: pref.enabled ?? true,
            channels: pref.channels,
            frequency: pref.frequency,
          };
        });
      }

      // Save to user preferences
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...currentPrefs,
            notifications: updatedNotifPrefs,
          },
        },
      });

      return { success: true, message: 'Preferences updated successfully' };
    }),

  /**
   * Batch notification actions
   */
  batchAction: protectedProcedure
    .input(batchNotificationActionSchema)
    .mutation(async ({ ctx, input }): Promise<BatchNotificationResponse> => {
      const startTime = performance.now();
      const userId = getUserId(ctx);
      const { action, notificationIds, filter } = input;

      // Build where clause
      const where: any = {
        eventType: { startsWith: 'Notification' },
        OR: [
          { metadata: { path: ['targetUserId'], equals: userId } },
          { metadata: { path: ['targetUserIds'], array_contains: [userId] } },
        ],
      };

      if (notificationIds && notificationIds.length > 0) {
        where.id = { in: notificationIds };
      }

      if (filter) {
        if (filter.types && filter.types.length > 0) {
          where.payload = { path: ['notificationType'], in: filter.types };
        }
        if (filter.olderThan) {
          where.occurredAt = { lt: filter.olderThan };
        }
        if (filter.isRead !== undefined) {
          where.status = filter.isRead ? 'PROCESSED' : 'PENDING';
        }
      }

      let result;
      switch (action) {
        case 'mark_read':
          result = await ctx.prisma.domainEvent.updateMany({
            where,
            data: { status: 'PROCESSED', processedAt: new Date() },
          });
          break;
        case 'mark_unread':
          result = await ctx.prisma.domainEvent.updateMany({
            where,
            data: { status: 'PENDING', processedAt: null },
          });
          break;
        case 'archive':
        case 'delete':
          result = await ctx.prisma.domainEvent.updateMany({
            where,
            data: { status: 'ARCHIVED' },
          });
          break;
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
   *
   * Subscribes to new notifications via WebSocket
   * KPI: Real-time latency <100ms
   */
  onNew: protectedProcedure
    .input(notificationSubscriptionInputSchema)
    .subscription(({ ctx, input }) => {
      const userId = getUserId(ctx);
      const { types, priorities } = input;

      return observable<NotificationEvent>((emit) => {
        const handler = (payload: NotificationEmitPayload) => {
          // Filter by types if specified
          if (types && types.length > 0 && payload.notification) {
            if (!types.includes(payload.notification.type as any)) {
              return;
            }
          }

          // Filter by priorities if specified
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

        // Subscribe to user's notifications
        notificationEmitter.on(`notification:${userId}`, handler);

        // Cleanup on unsubscribe
        return () => {
          notificationEmitter.off(`notification:${userId}`, handler);
        };
      });
    }),
});

// =============================================================================
// Export helper for creating notifications
// =============================================================================

/**
 * Create and emit a new notification
 *
 * Use this function from other parts of the application to create notifications
 */
export async function createNotification(
  prisma: Context['prisma'],
  params: {
    userId: string;
    tenantId: string;
    type: (typeof NOTIFICATION_TYPES)[number];
    title: string;
    body: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    entityType?: string;
    entityId?: string;
    entityName?: string;
    actionUrl?: string;
    actionLabel?: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }
): Promise<Notification> {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: params.type,
    title: params.title,
    body: params.body,
    priority: params.priority || 'medium',
    status: 'unread',
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    expiresAt: params.expiresAt || null,
    entityType: params.entityType || null,
    entityId: params.entityId || null,
    entityName: params.entityName || null,
    actionUrl: params.actionUrl || null,
    actionLabel: params.actionLabel || null,
    actor: null,
    groupId: null,
    metadata: params.metadata || null,
  };

  // Store as domain event
  await prisma.domainEvent.create({
    data: {
      id: notification.id,
      eventType: `Notification.${params.type}`,
      aggregateType: params.entityType || 'User',
      aggregateId: params.entityId || params.userId,
      payload: {
        notificationType: params.type,
        title: params.title,
        body: params.body,
        priority: params.priority || 'medium',
        entityName: params.entityName,
        actionUrl: params.actionUrl,
        actionLabel: params.actionLabel,
        expiresAt: params.expiresAt?.toISOString(),
      },
      metadata: {
        targetUserId: params.userId,
        ...params.metadata,
      },
      occurredAt: new Date(),
      status: 'PENDING',
      tenantId: params.tenantId,
    },
  });

  // Emit real-time event
  emitNotificationEvent({
    userId: params.userId,
    eventType: 'new',
    notification,
    notificationId: notification.id,
  });

  return notification;
}

export type NotificationsRouter = typeof notificationsRouter;
