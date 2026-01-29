/**
 * InMemoryNotificationPreferenceRepository
 * In-memory implementation for testing
 * @see IFC-157: Notification service MVP
 */
import {
  NotificationPreference,
  NotificationPreferenceRepository,
} from '@intelliflow/domain';

export class InMemoryNotificationPreferenceRepository implements NotificationPreferenceRepository {
  private preferences: Map<string, NotificationPreference> = new Map();

  private makeKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  async save(preference: NotificationPreference): Promise<void> {
    const key = this.makeKey(preference.tenantId, preference.userId);
    this.preferences.set(key, preference);
  }

  async findByUserId(
    tenantId: string,
    userId: string
  ): Promise<NotificationPreference | null> {
    const key = this.makeKey(tenantId, userId);
    return this.preferences.get(key) ?? null;
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
    const key = this.makeKey(tenantId, userId);
    this.preferences.delete(key);
  }

  async exists(tenantId: string, userId: string): Promise<boolean> {
    const key = this.makeKey(tenantId, userId);
    return this.preferences.has(key);
  }

  async findUsersWithChannelEnabled(
    tenantId: string,
    channel: string
  ): Promise<string[]> {
    const result: string[] = [];
    for (const pref of this.preferences.values()) {
      if (pref.tenantId !== tenantId) continue;
      if (pref.isChannelEnabled(channel as any)) {
        result.push(pref.userId);
      }
    }
    return result;
  }

  async bulkUpdate(
    tenantId: string,
    userIds: string[],
    updates: Partial<{
      doNotDisturb: boolean;
      quietHoursEnabled: boolean;
    }>
  ): Promise<number> {
    let count = 0;
    for (const userId of userIds) {
      const pref = await this.findByUserId(tenantId, userId);
      if (pref) {
        if (updates.doNotDisturb !== undefined) {
          pref.setDoNotDisturb(updates.doNotDisturb);
        }
        if (updates.quietHoursEnabled !== undefined) {
          pref.setQuietHoursEnabled(updates.quietHoursEnabled);
        }
        await this.save(pref);
        count++;
      }
    }
    return count;
  }

  // Test helpers
  clear(): void {
    this.preferences.clear();
  }

  getAll(): NotificationPreference[] {
    return Array.from(this.preferences.values());
  }

  count(): number {
    return this.preferences.size;
  }
}
