/**
 * NotificationPreference Entity
 * User preferences for notification delivery
 * @see IFC-157: Notification service MVP
 */
import { Entity } from '../shared/Entity';
import { NotificationChannel } from './Notification';

/**
 * Delivery frequency options
 */
export type DeliveryFrequency = 'realtime' | 'hourly' | 'daily_digest' | 'weekly_digest';

/**
 * Notification category types
 */
export type NotificationCategory =
  | 'system'
  | 'marketing'
  | 'transactional'
  | 'reminders'
  | 'updates'
  | 'alerts'
  | 'social';

/**
 * Channel-specific preferences
 */
export interface ChannelPreference {
  enabled: boolean;
  frequency: DeliveryFrequency;
  verifiedAt?: Date;
}

/**
 * Default channel preferences
 */
const DEFAULT_CHANNEL_PREFERENCES: Record<NotificationChannel, ChannelPreference> = {
  in_app: { enabled: true, frequency: 'realtime' },
  email: { enabled: true, frequency: 'realtime' },
  sms: { enabled: false, frequency: 'realtime' }, // Requires opt-in
  push: { enabled: false, frequency: 'realtime' }, // Requires opt-in
  webhook: { enabled: false, frequency: 'realtime' },
};

/**
 * Default category preferences
 */
const DEFAULT_CATEGORY_PREFERENCES: Record<NotificationCategory, boolean> = {
  system: true, // Always enabled
  transactional: true, // Always enabled
  reminders: true,
  alerts: true,
  updates: true,
  marketing: false, // Requires opt-in
  social: true,
};

interface NotificationPreferenceProps {
  tenantId: string;
  userId: string;
  channels: Record<NotificationChannel, ChannelPreference>;
  categories: Record<NotificationCategory, boolean>;
  quietHoursStart: string; // HH:MM format
  quietHoursEnd: string; // HH:MM format
  quietHoursEnabled: boolean;
  timezone: string;
  doNotDisturb: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationPreference extends Entity<string> {
  private props: NotificationPreferenceProps;

  private constructor(id: string, props: NotificationPreferenceProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get tenantId(): string {
    return this.props.tenantId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get quietHoursStart(): string {
    return this.props.quietHoursStart;
  }

  get quietHoursEnd(): string {
    return this.props.quietHoursEnd;
  }

  get quietHoursEnabled(): boolean {
    return this.props.quietHoursEnabled;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get doNotDisturb(): boolean {
    return this.props.doNotDisturb;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Create default preferences for a new user
   */
  static createDefault(tenantId: string, userId: string): NotificationPreference {
    const now = new Date();
    const id = `pref-${userId}`;

    return new NotificationPreference(id, {
      tenantId,
      userId,
      channels: { ...DEFAULT_CHANNEL_PREFERENCES },
      categories: { ...DEFAULT_CATEGORY_PREFERENCES },
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      quietHoursEnabled: true,
      timezone: 'UTC',
      doNotDisturb: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Reconstruct from persistence
   */
  static reconstitute(
    id: string,
    props: NotificationPreferenceProps
  ): NotificationPreference {
    return new NotificationPreference(id, props);
  }

  /**
   * Get preference for a specific channel
   */
  getChannelPreference(channel: NotificationChannel): ChannelPreference {
    return this.props.channels[channel] ?? DEFAULT_CHANNEL_PREFERENCES[channel];
  }

  /**
   * Check if a channel is enabled
   */
  isChannelEnabled(channel: NotificationChannel): boolean {
    return this.getChannelPreference(channel).enabled;
  }

  /**
   * Enable or disable a channel
   */
  setChannelEnabled(channel: NotificationChannel, enabled: boolean): void {
    this.props.channels[channel] = {
      ...this.getChannelPreference(channel),
      enabled,
    };
    this.props.updatedAt = new Date();
  }

  /**
   * Set delivery frequency for a channel
   */
  setChannelFrequency(channel: NotificationChannel, frequency: DeliveryFrequency): void {
    this.props.channels[channel] = {
      ...this.getChannelPreference(channel),
      frequency,
    };
    this.props.updatedAt = new Date();
  }

  /**
   * Mark a channel as verified
   */
  setChannelVerified(channel: NotificationChannel): void {
    this.props.channels[channel] = {
      ...this.getChannelPreference(channel),
      verifiedAt: new Date(),
    };
    this.props.updatedAt = new Date();
  }

  /**
   * Check if a category is enabled
   */
  isCategoryEnabled(category: NotificationCategory): boolean {
    return this.props.categories[category] ?? DEFAULT_CATEGORY_PREFERENCES[category];
  }

  /**
   * Enable or disable a category
   */
  setCategoryEnabled(category: NotificationCategory, enabled: boolean): void {
    // System and transactional cannot be disabled
    if ((category === 'system' || category === 'transactional') && !enabled) {
      throw new Error(`Cannot disable ${category} notifications`);
    }

    this.props.categories[category] = enabled;
    this.props.updatedAt = new Date();
  }

  /**
   * Set quiet hours
   */
  setQuietHours(start: string, end: string): void {
    if (!this.isValidTimeFormat(start) || !this.isValidTimeFormat(end)) {
      throw new Error('Invalid time format. Use HH:MM');
    }

    this.props.quietHoursStart = start;
    this.props.quietHoursEnd = end;
    this.props.updatedAt = new Date();
  }

  /**
   * Enable or disable quiet hours
   */
  setQuietHoursEnabled(enabled: boolean): void {
    this.props.quietHoursEnabled = enabled;
    this.props.updatedAt = new Date();
  }

  /**
   * Set timezone
   */
  setTimezone(timezone: string): void {
    if (!timezone || timezone.trim().length === 0) {
      throw new Error('Timezone cannot be empty');
    }
    this.props.timezone = timezone.trim();
    this.props.updatedAt = new Date();
  }

  /**
   * Set do not disturb mode
   */
  setDoNotDisturb(enabled: boolean): void {
    this.props.doNotDisturb = enabled;
    this.props.updatedAt = new Date();
  }

  /**
   * Check if current time is within quiet hours
   */
  isInQuietHours(currentTime: Date = new Date()): boolean {
    if (!this.props.quietHoursEnabled) {
      return false;
    }

    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const [startHour, startMin] = this.props.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = this.props.quietHoursEnd.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Same day quiet hours
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Check if notifications should be delivered now
   */
  shouldDeliverNow(channel: NotificationChannel, category: NotificationCategory): boolean {
    // Check do not disturb
    if (this.props.doNotDisturb) {
      return false;
    }

    // Check channel enabled
    if (!this.isChannelEnabled(channel)) {
      return false;
    }

    // Check category enabled
    if (!this.isCategoryEnabled(category)) {
      return false;
    }

    // Check quiet hours (unless high priority system/alert)
    if (category !== 'system' && category !== 'alerts') {
      if (this.isInQuietHours()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(time: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return regex.test(time);
  }

  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      tenantId: this.props.tenantId,
      userId: this.props.userId,
      channels: this.props.channels,
      categories: this.props.categories,
      quietHoursStart: this.props.quietHoursStart,
      quietHoursEnd: this.props.quietHoursEnd,
      quietHoursEnabled: this.props.quietHoursEnabled,
      timezone: this.props.timezone,
      doNotDisturb: this.props.doNotDisturb,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
