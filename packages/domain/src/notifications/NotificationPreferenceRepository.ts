/**
 * NotificationPreferenceRepository Interface
 * Port for notification preference persistence
 * @see IFC-157: Notification service MVP
 */
import { NotificationPreference } from './NotificationPreference';

/**
 * NotificationPreferenceRepository Interface
 * Defines the contract for preference persistence
 */
export interface NotificationPreferenceRepository {
  /**
   * Save preferences (create or update)
   */
  save(preference: NotificationPreference): Promise<void>;

  /**
   * Find preferences by user ID
   */
  findByUserId(tenantId: string, userId: string): Promise<NotificationPreference | null>;

  /**
   * Find or create default preferences
   */
  findOrCreateDefault(tenantId: string, userId: string): Promise<NotificationPreference>;

  /**
   * Delete preferences
   */
  delete(tenantId: string, userId: string): Promise<void>;

  /**
   * Check if preferences exist
   */
  exists(tenantId: string, userId: string): Promise<boolean>;

  /**
   * Find users with specific channel enabled
   */
  findUsersWithChannelEnabled(
    tenantId: string,
    channel: string
  ): Promise<string[]>;

  /**
   * Bulk update preferences for multiple users
   */
  bulkUpdate(
    tenantId: string,
    userIds: string[],
    updates: Partial<{
      doNotDisturb: boolean;
      quietHoursEnabled: boolean;
    }>
  ): Promise<number>;
}
