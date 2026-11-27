/**
 * Per-type notification preference check at delivery time (MVP-005).
 *
 * The settings page reads each type's on/off from NotificationPreference.categoryPreferences,
 * with NOTIFICATION_TYPES_OFF_BY_DEFAULT (AI lead-score notices) off until the user turns them
 * on. createNotification checks the same rule before either delivery path, so what the settings
 * show is what the user gets.
 */
import { isNotificationTypeEnabled, type Notification } from '@intelliflow/validators';
import type { CreateNotificationParams } from './notifications.router';

/** The Notification createNotification returns, for a stored, filtered or orchestrated send. */
export function buildNotification(
  params: CreateNotificationParams,
  at: { id: string; status: Notification['status']; createdAt: Date; metadata?: unknown }
): Notification {
  return {
    id: at.id,
    type: params.type,
    title: params.title,
    body: params.body,
    priority: params.priority || 'normal',
    status: at.status,
    isRead: false,
    readAt: null,
    createdAt: at.createdAt,
    expiresAt: params.expiresAt || null,
    entityType: params.entityType || null,
    entityId: params.entityId || null,
    entityName: params.entityName || null,
    actionUrl: params.actionUrl || null,
    actionLabel: params.actionLabel || null,
    actor: null,
    groupId: null,
    metadata: (at.metadata ?? params.metadata ?? null) as Notification['metadata'],
  };
}

interface PreferenceReader {
  notificationPreference?: {
    findUnique(args: {
      where: { tenantId_userId: { tenantId: string; userId: string } };
      select: { categoryPreferences: true };
    }): Promise<{ categoryPreferences: unknown } | null>;
  };
}

/** Whether the recipient receives this notification type (stored choice, else the default). */
export async function recipientWantsType(
  prisma: unknown,
  params: { tenantId: string; userId: string; type: string }
): Promise<boolean> {
  let stored: unknown;
  try {
    const record = await (prisma as PreferenceReader).notificationPreference?.findUnique({
      where: { tenantId_userId: { tenantId: params.tenantId, userId: params.userId } },
      select: { categoryPreferences: true },
    });
    stored = record?.categoryPreferences;
  } catch {
    // An unreadable preference row falls back to the type's default rather than failing delivery.
  }
  return isNotificationTypeEnabled(stored, params.type);
}
