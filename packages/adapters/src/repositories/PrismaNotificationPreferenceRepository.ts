/**
 * PrismaNotificationPreferenceRepository
 * Prisma implementation of NotificationPreferenceRepository port
 * @see IFC-157: Notification service MVP
 */
import { PrismaClient } from '@intelliflow/db';
import {
  NotificationPreference,
  NotificationPreferenceRepository,
  ChannelPreference,
  NotificationCategory,
} from '@intelliflow/domain';

// Type for Prisma preference record
type PreferenceRecord = Awaited<ReturnType<PrismaClient['notificationPreference']['findFirst']>>;

// Default channel preferences
const DEFAULT_CHANNEL_PREFERENCES: Record<string, ChannelPreference> = {
  in_app: { enabled: true, frequency: 'realtime' },
  email: { enabled: true, frequency: 'realtime' },
  sms: { enabled: false, frequency: 'realtime' },
  push: { enabled: false, frequency: 'realtime' },
  webhook: { enabled: false, frequency: 'realtime' },
};

// Default category preferences
const DEFAULT_CATEGORY_PREFERENCES: Record<NotificationCategory, boolean> = {
  system: true,
  transactional: true,
  reminders: true,
  alerts: true,
  updates: true,
  marketing: false,
  social: true,
};

/**
 * Convert Prisma record to domain entity
 */
function toDomainEntity(record: NonNullable<PreferenceRecord>): NotificationPreference {
  // Parse JSON preferences or use defaults
  const channelPrefs = record.channelPreferences
    ? (record.channelPreferences as unknown as Record<string, ChannelPreference>)
    : DEFAULT_CHANNEL_PREFERENCES;

  const categoryPrefs = record.categoryPreferences
    ? (record.categoryPreferences as unknown as Record<NotificationCategory, boolean>)
    : DEFAULT_CATEGORY_PREFERENCES;

  return NotificationPreference.reconstitute(record.id, {
    tenantId: record.tenantId,
    userId: record.userId,
    channels: {
      in_app: channelPrefs.in_app ?? DEFAULT_CHANNEL_PREFERENCES.in_app,
      email: channelPrefs.email ?? DEFAULT_CHANNEL_PREFERENCES.email,
      sms: channelPrefs.sms ?? DEFAULT_CHANNEL_PREFERENCES.sms,
      push: channelPrefs.push ?? DEFAULT_CHANNEL_PREFERENCES.push,
      webhook: channelPrefs.webhook ?? DEFAULT_CHANNEL_PREFERENCES.webhook,
    },
    categories: {
      system: categoryPrefs.system ?? DEFAULT_CATEGORY_PREFERENCES.system,
      transactional: categoryPrefs.transactional ?? DEFAULT_CATEGORY_PREFERENCES.transactional,
      reminders: categoryPrefs.reminders ?? DEFAULT_CATEGORY_PREFERENCES.reminders,
      alerts: categoryPrefs.alerts ?? DEFAULT_CATEGORY_PREFERENCES.alerts,
      updates: categoryPrefs.updates ?? DEFAULT_CATEGORY_PREFERENCES.updates,
      marketing: categoryPrefs.marketing ?? DEFAULT_CATEGORY_PREFERENCES.marketing,
      social: categoryPrefs.social ?? DEFAULT_CATEGORY_PREFERENCES.social,
    },
    quietHoursStart: record.quietHoursStart,
    quietHoursEnd: record.quietHoursEnd,
    quietHoursEnabled: record.quietHoursEnabled,
    timezone: record.timezone,
    doNotDisturb: record.doNotDisturb,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaNotificationPreferenceRepository implements NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(preference: NotificationPreference): Promise<void> {
    const json = preference.toJSON();

    await this.prisma.notificationPreference.upsert({
      where: {
        tenantId_userId: {
          tenantId: preference.tenantId,
          userId: preference.userId,
        },
      },
      create: {
        id: preference.id,
        tenantId: preference.tenantId,
        userId: preference.userId,
        channelPreferences: json.channels as object,
        categoryPreferences: json.categories as object,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        quietHoursEnabled: preference.quietHoursEnabled,
        timezone: preference.timezone,
        doNotDisturb: preference.doNotDisturb,
      },
      update: {
        channelPreferences: json.channels as object,
        categoryPreferences: json.categories as object,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        quietHoursEnabled: preference.quietHoursEnabled,
        timezone: preference.timezone,
        doNotDisturb: preference.doNotDisturb,
      },
    });
  }

  async findByUserId(
    tenantId: string,
    userId: string
  ): Promise<NotificationPreference | null> {
    const record = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_userId: { tenantId, userId },
      },
    });

    return record ? toDomainEntity(record) : null;
  }

  async findOrCreateDefault(
    tenantId: string,
    userId: string
  ): Promise<NotificationPreference> {
    const existing = await this.findByUserId(tenantId, userId);
    if (existing) {
      return existing;
    }

    const defaultPref = NotificationPreference.createDefault(tenantId, userId);
    await this.save(defaultPref);
    return defaultPref;
  }

  async delete(tenantId: string, userId: string): Promise<void> {
    await this.prisma.notificationPreference.delete({
      where: {
        tenantId_userId: { tenantId, userId },
      },
    });
  }

  async exists(tenantId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.notificationPreference.count({
      where: { tenantId, userId },
    });
    return count > 0;
  }

  async findUsersWithChannelEnabled(
    tenantId: string,
    channel: string
  ): Promise<string[]> {
    // This requires querying JSON field
    const records = await this.prisma.notificationPreference.findMany({
      where: {
        tenantId,
        // Prisma doesn't have direct JSON field filtering in all cases
        // This is a simplification - in production use raw SQL or filter in memory
      },
      select: {
        userId: true,
        channelPreferences: true,
      },
    });

    return records
      .filter((r: { userId: string; channelPreferences: unknown }) => {
        const prefs = r.channelPreferences as Record<string, ChannelPreference> | null;
        if (!prefs) return channel === 'in_app' || channel === 'email'; // defaults
        const channelPref = prefs[channel];
        return channelPref?.enabled ?? false;
      })
      .map((r: { userId: string; channelPreferences: unknown }) => r.userId);
  }

  async bulkUpdate(
    tenantId: string,
    userIds: string[],
    updates: Partial<{
      doNotDisturb: boolean;
      quietHoursEnabled: boolean;
    }>
  ): Promise<number> {
    const result = await this.prisma.notificationPreference.updateMany({
      where: {
        tenantId,
        userId: { in: userIds },
      },
      data: updates,
    });

    return result.count;
  }
}
