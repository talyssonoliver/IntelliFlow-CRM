/**
 * Notifications Validation Schemas
 *
 * Zod schemas for notifications-related API endpoints:
 * - Notification list and management
 * - Preferences configuration
 * - Real-time subscription
 *
 * Task: IFC-183 - Notifications tRPC Router
 *
 * Following DRY enum pattern - imports domain constants as single source of truth
 */

import { z } from 'zod';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_PRIORITIES,
} from '@intelliflow/domain';

// Re-export domain constants for consumers
export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_PRIORITIES,
} from '@intelliflow/domain';

// =============================================================================
// Notification Types
// =============================================================================

export const NOTIFICATION_TYPES = [
  // Lead notifications
  'lead_assigned',
  'lead_scored',
  'lead_converted',
  'lead_activity',
  // Deal notifications
  'deal_assigned',
  'deal_stage_changed',
  'deal_won',
  'deal_lost',
  'deal_at_risk',
  // Task notifications
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'task_completed',
  'task_comment',
  // Appointment notifications
  'appointment_scheduled',
  'appointment_reminder',
  'appointment_cancelled',
  'appointment_rescheduled',
  // AI notifications
  'ai_insight',
  'ai_action_pending',
  'ai_action_approved',
  'ai_action_rejected',
  'ai_recommendation',
  // Team notifications
  'team_mention',
  'team_message',
  'team_announcement',
  // System notifications
  'system_alert',
  'system_maintenance',
  'system_update',
  // Document notifications
  'document_shared',
  'document_comment',
  'document_approval_needed',
  // Ticket notifications
  'ticket_assigned',
  'ticket_created',
  'ticket_escalated',
  // Case notifications
  'case_assigned',
  'case_status_changed',
  'case_closed',
  // Contact notifications
  'contact_stale',
  // Email notifications
  'email_received',
  'email_opened',
  'email_replied',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

// =============================================================================
// Notification Priority (derived from domain)
// =============================================================================

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const notificationPrioritySchema = z.enum(NOTIFICATION_PRIORITIES);

// =============================================================================
// Notification Channel Types (derived from domain)
// =============================================================================

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

// =============================================================================
// Notification Status (derived from domain)
// =============================================================================

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);

// =============================================================================
// Notification Schemas
// =============================================================================

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  priority: notificationPrioritySchema,
  status: notificationStatusSchema,
  isRead: z.boolean(),
  readAt: z.date().optional().nullable(),
  createdAt: z.date(),
  expiresAt: z.date().optional().nullable(),
  // Entity references
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  entityName: z.string().optional().nullable(),
  // Action data
  actionUrl: z.string().optional().nullable(),
  actionLabel: z.string().optional().nullable(),
  // Actor (who triggered the notification)
  actor: z
    .object({
      id: z.string(),
      name: z.string().optional().nullable(),
      avatarUrl: z.string().optional().nullable(),
      type: z.enum(['user', 'system', 'ai']),
    })
    .optional()
    .nullable(),
  // Grouping
  groupId: z.string().optional().nullable(),
  groupCount: z.number().optional(),
  // Metadata
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

// =============================================================================
// List Query Schemas
// =============================================================================

export const notificationListQuerySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  types: z.array(notificationTypeSchema).optional(),
  priorities: z.array(notificationPrioritySchema).optional(),
  status: notificationStatusSchema.optional(),
  isRead: z.boolean().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.string().optional().nullable(),
  hasMore: z.boolean(),
  total: z.number(),
  unreadCount: z.number(),
});

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

// =============================================================================
// Unread Count Schemas
// =============================================================================

export const unreadCountResponseSchema = z.object({
  total: z.number(),
  byType: z.record(notificationTypeSchema, z.number()).optional(),
  byPriority: z
    .object({
      high: z.number(),
      normal: z.number(),
      low: z.number(),
    })
    .optional(),
});

export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

// =============================================================================
// Mark Read Schemas
// =============================================================================

export const markAsReadInputSchema = z.object({
  notificationIds: z.array(z.string()).min(1).max(100),
});

export type MarkAsReadInput = z.infer<typeof markAsReadInputSchema>;

export const markAsReadResponseSchema = z.object({
  success: z.boolean(),
  updatedCount: z.number(),
  updatedIds: z.array(z.string()),
});

export type MarkAsReadResponse = z.infer<typeof markAsReadResponseSchema>;

// =============================================================================
// Delete Schemas
// =============================================================================

export const deleteNotificationsInputSchema = z.object({
  notificationIds: z.array(z.string()).min(1).max(100),
  permanent: z.boolean().optional().default(false),
});

export type DeleteNotificationsInput = z.infer<typeof deleteNotificationsInputSchema>;

export const deleteNotificationsResponseSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  deletedIds: z.array(z.string()),
});

export type DeleteNotificationsResponse = z.infer<typeof deleteNotificationsResponseSchema>;

// =============================================================================
// Preferences Schemas
// =============================================================================

export const notificationPreferenceItemSchema = z.object({
  type: notificationTypeSchema,
  enabled: z.boolean(),
  channels: z.array(notificationChannelSchema),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string(), // HH:mm format
      end: z.string(), // HH:mm format
      timezone: z.string(),
    })
    .optional(),
  frequency: z.enum(['instant', 'hourly', 'daily', 'weekly']).optional(),
});

export type NotificationPreferenceItem = z.infer<typeof notificationPreferenceItemSchema>;

export const notificationPreferencesSchema = z.object({
  userId: z.string(),
  globalEnabled: z.boolean(),
  defaultChannels: z.array(notificationChannelSchema),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
      daysOfWeek: z.array(z.number().min(0).max(6)),
    })
    .optional(),
  emailDigest: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(['daily', 'weekly']),
      time: z.string(), // HH:mm format
    })
    .optional(),
  preferences: z.array(notificationPreferenceItemSchema),
  priorityFilter: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  updatedAt: z.date(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updatePreferencesInputSchema = z.object({
  globalEnabled: z.boolean().optional(),
  defaultChannels: z.array(notificationChannelSchema).optional(),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
      daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    })
    .optional(),
  emailDigest: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(['daily', 'weekly']),
      time: z.string(),
    })
    .optional(),
  preferences: z
    .array(
      z.object({
        type: notificationTypeSchema,
        enabled: z.boolean().optional(),
        channels: z.array(notificationChannelSchema).optional(),
        frequency: z.enum(['instant', 'hourly', 'daily', 'weekly']).optional(),
      })
    )
    .optional(),
  priorityFilter: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;

// =============================================================================
// Real-time Subscription Schemas
// =============================================================================

export const notificationSubscriptionInputSchema = z.object({
  types: z.array(notificationTypeSchema).optional(),
  priorities: z.array(notificationPrioritySchema).optional(),
});

export type NotificationSubscriptionInput = z.infer<typeof notificationSubscriptionInputSchema>;

export const notificationEventSchema = z.object({
  eventType: z.enum(['new', 'read', 'deleted', 'updated']),
  notification: notificationSchema.optional(),
  notificationId: z.string(),
  timestamp: z.date(),
});

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

// =============================================================================
// Batch Operations Schemas
// =============================================================================

export const batchNotificationActionSchema = z.object({
  action: z.enum(['mark_read', 'mark_unread', 'archive', 'delete']),
  notificationIds: z.array(z.string()).optional(),
  filter: z
    .object({
      types: z.array(notificationTypeSchema).optional(),
      olderThan: z.coerce.date().optional(),
      isRead: z.boolean().optional(),
    })
    .optional(),
});

export type BatchNotificationAction = z.infer<typeof batchNotificationActionSchema>;

export const batchNotificationResponseSchema = z.object({
  success: z.boolean(),
  affectedCount: z.number(),
  errors: z.array(z.string()).optional(),
});

export type BatchNotificationResponse = z.infer<typeof batchNotificationResponseSchema>;
