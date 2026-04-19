/**
 * Notifications Validators Tests
 *
 * Tests the Zod validation schemas for notifications API endpoints.
 * Source: packages/validators/src/notifications.ts
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  notificationTypeSchema,
  notificationPrioritySchema,
  notificationChannelSchema,
  notificationStatusSchema,
  notificationSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  markAsReadInputSchema,
  deleteNotificationsInputSchema,
  notificationPreferenceItemSchema,
  notificationPreferencesSchema,
  updatePreferencesInputSchema,
  notificationSubscriptionInputSchema,
  notificationEventSchema,
  batchNotificationActionSchema,
} from '../notifications';

// ============================================================================
// Test Data Factories
// ============================================================================

const now = new Date();

const validNotification = {
  id: 'notif-001',
  type: 'lead_assigned' as const,
  title: 'New Lead Assigned',
  body: 'A new lead has been assigned to you.',
  priority: 'normal' as const,
  status: 'pending' as const,
  isRead: false,
  createdAt: now,
};

const fullNotification = {
  ...validNotification,
  readAt: null,
  expiresAt: null,
  entityType: 'lead',
  entityId: 'lead-001',
  entityName: 'Acme Corp Lead',
  actionUrl: '/leads/lead-001',
  actionLabel: 'View Lead',
  actor: {
    id: 'user-001',
    name: 'John Doe',
    avatarUrl: 'https://example.com/avatar.png',
    type: 'user' as const,
  },
  groupId: 'group-001',
  groupCount: 5,
  metadata: { source: 'automation', urgencyReason: 'high-value' },
};

describe('Notifications Validators', () => {
  // =========================================================================
  // Enum Arrays
  // =========================================================================
  describe('Enum arrays', () => {
    it('should have 51 notification types', () => {
      expect(NOTIFICATION_TYPES).toHaveLength(51);
    });

    it('should include PG-184 deal automation notification types', () => {
      expect(NOTIFICATION_TYPES).toContain('deal_reassigned');
      expect(NOTIFICATION_TYPES).toContain('deal_high_value_moved');
      expect(NOTIFICATION_TYPES).toContain('deal_duplicate_suspected');
    });

    it('should include PG-185 ticket automation notification types', () => {
      expect(NOTIFICATION_TYPES).toContain('ticket_reassigned');
      expect(NOTIFICATION_TYPES).toContain('ticket_resolved');
      expect(NOTIFICATION_TYPES).toContain('ticket_duplicate_suspected');
      expect(NOTIFICATION_TYPES).toContain('ticket_auto_closed');
    });

    it('should have 3 notification priorities', () => {
      expect(NOTIFICATION_PRIORITIES).toHaveLength(3);
      expect([...NOTIFICATION_PRIORITIES]).toEqual(['high', 'normal', 'low']);
    });

    it('should have 5 notification channels', () => {
      expect(NOTIFICATION_CHANNELS).toHaveLength(5);
      expect([...NOTIFICATION_CHANNELS]).toEqual(['in_app', 'email', 'sms', 'push', 'webhook']);
    });

    it('should have 6 notification statuses', () => {
      expect(NOTIFICATION_STATUSES).toHaveLength(6);
      expect([...NOTIFICATION_STATUSES]).toEqual([
        'pending',
        'sent',
        'delivered',
        'failed',
        'read',
        'bounced',
      ]);
    });
  });

  // =========================================================================
  // Enum Schemas
  // =========================================================================
  describe('notificationTypeSchema', () => {
    it('should accept all valid notification types', () => {
      NOTIFICATION_TYPES.forEach((type) => {
        const result = notificationTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid notification type', () => {
      const result = notificationTypeSchema.safeParse('invalid_type');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = notificationTypeSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('notificationPrioritySchema', () => {
    it('should accept all valid priorities', () => {
      NOTIFICATION_PRIORITIES.forEach((priority) => {
        const result = notificationPrioritySchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority', () => {
      const result = notificationPrioritySchema.safeParse('critical');
      expect(result.success).toBe(false);
    });
  });

  describe('notificationChannelSchema', () => {
    it('should accept all valid channels', () => {
      NOTIFICATION_CHANNELS.forEach((channel) => {
        const result = notificationChannelSchema.safeParse(channel);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid channel', () => {
      const result = notificationChannelSchema.safeParse('discord');
      expect(result.success).toBe(false);
    });
  });

  describe('notificationStatusSchema', () => {
    it('should accept all valid statuses', () => {
      NOTIFICATION_STATUSES.forEach((status) => {
        const result = notificationStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = notificationStatusSchema.safeParse('archived');
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // notificationSchema
  // =========================================================================
  describe('notificationSchema', () => {
    it('should accept valid notification with required fields only', () => {
      const result = notificationSchema.safeParse(validNotification);
      expect(result.success).toBe(true);
    });

    it('should accept full notification with all fields', () => {
      const result = notificationSchema.safeParse(fullNotification);
      expect(result.success).toBe(true);
    });

    it('should accept actor with type "system"', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        actor: { id: 'system', type: 'system' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept actor with type "ai"', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        actor: { id: 'ai-agent-1', type: 'ai' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject actor with invalid type', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        actor: { id: 'bot-1', type: 'bot' },
      });
      expect(result.success).toBe(false);
    });

    it('should accept null for nullable optional fields', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        readAt: null,
        expiresAt: null,
        entityType: null,
        entityId: null,
        entityName: null,
        actionUrl: null,
        actionLabel: null,
        actor: null,
        groupId: null,
        metadata: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = notificationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid type in notification', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        type: 'nonexistent_type',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority in notification', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        priority: 'extreme',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status in notification', () => {
      const result = notificationSchema.safeParse({
        ...validNotification,
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // notificationListQuerySchema
  // =========================================================================
  describe('notificationListQuerySchema', () => {
    it('should accept empty query with defaults', () => {
      const result = notificationListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it('should accept full query with all filters', () => {
      const result = notificationListQuerySchema.safeParse({
        limit: 50,
        cursor: 'cursor-abc',
        types: ['lead_assigned', 'deal_won'],
        priorities: ['high', 'normal'],
        status: 'pending',
        isRead: false,
        fromDate: '2025-01-01T00:00:00.000Z',
        toDate: '2025-12-31T23:59:59.999Z',
        search: 'important',
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit below 1', () => {
      const result = notificationListQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = notificationListQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should accept limit at boundary 1', () => {
      const result = notificationListQuerySchema.safeParse({ limit: 1 });
      expect(result.success).toBe(true);
    });

    it('should accept limit at boundary 100', () => {
      const result = notificationListQuerySchema.safeParse({ limit: 100 });
      expect(result.success).toBe(true);
    });

    it('should reject invalid type in types array', () => {
      const result = notificationListQuerySchema.safeParse({
        types: ['invalid_type'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority in priorities array', () => {
      const result = notificationListQuerySchema.safeParse({
        priorities: ['extreme'],
      });
      expect(result.success).toBe(false);
    });

    it('should coerce fromDate string to Date', () => {
      const result = notificationListQuerySchema.safeParse({
        fromDate: '2025-06-15T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fromDate).toBeInstanceOf(Date);
      }
    });
  });

  // =========================================================================
  // notificationListResponseSchema
  // =========================================================================
  describe('notificationListResponseSchema', () => {
    it('should accept valid response with empty notifications', () => {
      const result = notificationListResponseSchema.safeParse({
        notifications: [],
        hasMore: false,
        total: 0,
        unreadCount: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid response with notifications', () => {
      const result = notificationListResponseSchema.safeParse({
        notifications: [validNotification],
        nextCursor: 'cursor-next',
        hasMore: true,
        total: 50,
        unreadCount: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept null nextCursor', () => {
      const result = notificationListResponseSchema.safeParse({
        notifications: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
        unreadCount: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = notificationListResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // markAsReadInputSchema
  // =========================================================================
  describe('markAsReadInputSchema', () => {
    it('should accept valid input with one id', () => {
      const result = markAsReadInputSchema.safeParse({
        notificationIds: ['notif-001'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept input with 100 ids (max boundary)', () => {
      const ids = Array.from({ length: 100 }, (_, i) => `notif-${i}`);
      const result = markAsReadInputSchema.safeParse({ notificationIds: ids });
      expect(result.success).toBe(true);
    });

    it('should reject empty notificationIds array', () => {
      const result = markAsReadInputSchema.safeParse({ notificationIds: [] });
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 notificationIds', () => {
      const ids = Array.from({ length: 101 }, (_, i) => `notif-${i}`);
      const result = markAsReadInputSchema.safeParse({ notificationIds: ids });
      expect(result.success).toBe(false);
    });

    it('should reject missing notificationIds', () => {
      const result = markAsReadInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // deleteNotificationsInputSchema
  // =========================================================================
  describe('deleteNotificationsInputSchema', () => {
    it('should accept valid input with permanent false by default', () => {
      const result = deleteNotificationsInputSchema.safeParse({
        notificationIds: ['notif-001'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permanent).toBe(false);
      }
    });

    it('should accept permanent true', () => {
      const result = deleteNotificationsInputSchema.safeParse({
        notificationIds: ['notif-001'],
        permanent: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permanent).toBe(true);
      }
    });

    it('should reject empty notificationIds array', () => {
      const result = deleteNotificationsInputSchema.safeParse({
        notificationIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 notificationIds', () => {
      const ids = Array.from({ length: 101 }, (_, i) => `notif-${i}`);
      const result = deleteNotificationsInputSchema.safeParse({
        notificationIds: ids,
      });
      expect(result.success).toBe(false);
    });

    it('should accept 100 ids (max boundary)', () => {
      const ids = Array.from({ length: 100 }, (_, i) => `notif-${i}`);
      const result = deleteNotificationsInputSchema.safeParse({
        notificationIds: ids,
      });
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // notificationPreferenceItemSchema
  // =========================================================================
  describe('notificationPreferenceItemSchema', () => {
    it('should accept valid preference item', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'lead_assigned',
        enabled: true,
        channels: ['in_app', 'email'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept with optional quietHours', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'deal_won',
        enabled: true,
        channels: ['in_app'],
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'Europe/London',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept with optional frequency', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'task_due_soon',
        enabled: true,
        channels: ['email'],
        frequency: 'daily',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid frequency values', () => {
      const frequencies = ['instant', 'hourly', 'daily', 'weekly'];
      frequencies.forEach((freq) => {
        const result = notificationPreferenceItemSchema.safeParse({
          type: 'lead_scored',
          enabled: true,
          channels: ['in_app'],
          frequency: freq,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid frequency', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'lead_scored',
        enabled: true,
        channels: ['in_app'],
        frequency: 'monthly',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid channel in channels array', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'lead_scored',
        enabled: true,
        channels: ['discord'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid notification type', () => {
      const result = notificationPreferenceItemSchema.safeParse({
        type: 'invalid_type',
        enabled: true,
        channels: ['in_app'],
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // notificationPreferencesSchema
  // =========================================================================
  describe('notificationPreferencesSchema', () => {
    const validPreferences = {
      userId: 'user-001',
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'] as const,
      preferences: [
        {
          type: 'lead_assigned' as const,
          enabled: true,
          channels: ['in_app'] as const,
        },
      ],
      updatedAt: now,
    };

    it('should accept valid preferences', () => {
      const result = notificationPreferencesSchema.safeParse(validPreferences);
      expect(result.success).toBe(true);
    });

    it('should accept with optional quietHours and emailDigest', () => {
      const result = notificationPreferencesSchema.safeParse({
        ...validPreferences,
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'UTC',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
        emailDigest: {
          enabled: true,
          frequency: 'daily',
          time: '09:00',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid daysOfWeek (above 6)', () => {
      const result = notificationPreferencesSchema.safeParse({
        ...validPreferences,
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'UTC',
          daysOfWeek: [7],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid daysOfWeek (below 0)', () => {
      const result = notificationPreferencesSchema.safeParse({
        ...validPreferences,
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          timezone: 'UTC',
          daysOfWeek: [-1],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid emailDigest frequency', () => {
      const result = notificationPreferencesSchema.safeParse({
        ...validPreferences,
        emailDigest: {
          enabled: true,
          frequency: 'monthly',
          time: '09:00',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = notificationPreferencesSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // updatePreferencesInputSchema
  // =========================================================================
  describe('updatePreferencesInputSchema', () => {
    it('should accept empty object (all fields optional)', () => {
      const result = updatePreferencesInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept globalEnabled only', () => {
      const result = updatePreferencesInputSchema.safeParse({
        globalEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept defaultChannels only', () => {
      const result = updatePreferencesInputSchema.safeParse({
        defaultChannels: ['push', 'sms'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept full update with all fields', () => {
      const result = updatePreferencesInputSchema.safeParse({
        globalEnabled: true,
        defaultChannels: ['in_app', 'email'],
        quietHours: {
          enabled: true,
          start: '23:00',
          end: '06:00',
          timezone: 'America/New_York',
          daysOfWeek: [1, 2, 3, 4, 5],
        },
        emailDigest: {
          enabled: true,
          frequency: 'weekly',
          time: '08:00',
        },
        preferences: [
          {
            type: 'lead_assigned',
            enabled: false,
            channels: ['email'],
            frequency: 'hourly',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid channel in defaultChannels', () => {
      const result = updatePreferencesInputSchema.safeParse({
        defaultChannels: ['discord'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid type in preferences array', () => {
      const result = updatePreferencesInputSchema.safeParse({
        preferences: [{ type: 'nonexistent_type', enabled: true }],
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // notificationSubscriptionInputSchema
  // =========================================================================
  describe('notificationSubscriptionInputSchema', () => {
    it('should accept empty object', () => {
      const result = notificationSubscriptionInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept with types filter', () => {
      const result = notificationSubscriptionInputSchema.safeParse({
        types: ['lead_assigned', 'deal_won'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept with priorities filter', () => {
      const result = notificationSubscriptionInputSchema.safeParse({
        priorities: ['high', 'normal'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid type in types', () => {
      const result = notificationSubscriptionInputSchema.safeParse({
        types: ['invalid'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority in priorities', () => {
      const result = notificationSubscriptionInputSchema.safeParse({
        priorities: ['extreme'],
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // notificationEventSchema
  // =========================================================================
  describe('notificationEventSchema', () => {
    it('should accept valid notification event', () => {
      const result = notificationEventSchema.safeParse({
        eventType: 'new',
        notificationId: 'notif-001',
        timestamp: now,
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid event types', () => {
      const eventTypes = ['new', 'read', 'deleted', 'updated'];
      eventTypes.forEach((eventType) => {
        const result = notificationEventSchema.safeParse({
          eventType,
          notificationId: 'notif-001',
          timestamp: now,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept with optional notification object', () => {
      const result = notificationEventSchema.safeParse({
        eventType: 'new',
        notification: validNotification,
        notificationId: 'notif-001',
        timestamp: now,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid eventType', () => {
      const result = notificationEventSchema.safeParse({
        eventType: 'created',
        notificationId: 'notif-001',
        timestamp: now,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing notificationId', () => {
      const result = notificationEventSchema.safeParse({
        eventType: 'new',
        timestamp: now,
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // batchNotificationActionSchema
  // =========================================================================
  describe('batchNotificationActionSchema', () => {
    it('should accept valid batch action with notificationIds', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'mark_read',
        notificationIds: ['notif-001', 'notif-002'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid action values', () => {
      const actions = ['mark_read', 'mark_unread', 'archive', 'delete'];
      actions.forEach((action) => {
        const result = batchNotificationActionSchema.safeParse({ action });
        expect(result.success).toBe(true);
      });
    });

    it('should accept action with filter object', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'archive',
        filter: {
          types: ['lead_assigned'],
          olderThan: '2025-06-01T00:00:00.000Z',
          isRead: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'purge',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing action', () => {
      const result = batchNotificationActionSchema.safeParse({
        notificationIds: ['notif-001'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept action with empty filter', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'delete',
        filter: {},
      });
      expect(result.success).toBe(true);
    });

    it('should coerce olderThan in filter from string to Date', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'archive',
        filter: {
          olderThan: '2025-01-01T00:00:00.000Z',
        },
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.filter?.olderThan) {
        expect(result.data.filter.olderThan).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid type in filter.types', () => {
      const result = batchNotificationActionSchema.safeParse({
        action: 'mark_read',
        filter: {
          types: ['nonexistent_type'],
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
