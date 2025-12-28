/**
 * SLA Notification System - IFC-093
 *
 * Provides real-time notifications for SLA warnings and breaches.
 * Supports browser notifications, toast messages, and webhook integrations.
 *
 * @implements FLOW-011 (Ticket creation flow)
 * @implements FLOW-013 (SLA management flow)
 */

import {
  SLABreachAlert,
  slaTrackingService,
  SLATrackingService,
  Ticket,
} from './sla-service';

export type NotificationChannel = 'browser' | 'toast' | 'webhook' | 'email';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationConfig {
  channels: NotificationChannel[];
  webhookUrl?: string;
  emailRecipients?: string[];
  soundEnabled?: boolean;
  groupSimilar?: boolean;
  throttleMinutes?: number;
}

export interface SLANotification {
  id: string;
  alert: SLABreachAlert;
  channels: NotificationChannel[];
  sentAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  priority: NotificationPriority;
}

const DEFAULT_CONFIG: NotificationConfig = {
  channels: ['browser', 'toast'],
  soundEnabled: true,
  groupSimilar: true,
  throttleMinutes: 5,
};

/**
 * SLA Notification Manager
 * Handles delivery of SLA alerts across multiple channels
 */
export class SLANotificationManager {
  private config: NotificationConfig;
  private sentNotifications: Map<string, SLANotification> = new Map();
  private notificationQueue: SLANotification[] = [];
  private listeners: Set<(notification: SLANotification) => void> = new Set();
  private unsubscribeFns: (() => void)[] = [];

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the notification system and start listening for SLA alerts
   */
  initialize(slaService: SLATrackingService = slaTrackingService): void {
    // Subscribe to breach alerts
    const unsubBreach = slaService.onBreach((alert) => {
      this.handleAlert(alert, 'urgent');
    });
    this.unsubscribeFns.push(unsubBreach);

    // Subscribe to warning alerts
    const unsubWarning = slaService.onWarning((alert) => {
      this.handleAlert(alert, 'high');
    });
    this.unsubscribeFns.push(unsubWarning);

    // Request browser notification permission if needed
    if (this.config.channels.includes('browser')) {
      this.requestNotificationPermission();
    }
  }

  /**
   * Clean up subscriptions
   */
  dispose(): void {
    this.unsubscribeFns.forEach((fn) => fn());
    this.unsubscribeFns = [];
    this.listeners.clear();
  }

  /**
   * Request browser notification permission
   */
  private async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Handle incoming SLA alert
   */
  private handleAlert(alert: SLABreachAlert, priority: NotificationPriority): void {
    // Check throttling
    if (this.shouldThrottle(alert)) {
      return;
    }

    const notification: SLANotification = {
      id: `sla-${alert.ticketId}-${Date.now()}`,
      alert,
      channels: this.config.channels,
      sentAt: new Date(),
      priority,
    };

    // Store notification
    this.sentNotifications.set(notification.id, notification);
    this.notificationQueue.push(notification);

    // Dispatch to all configured channels
    this.dispatchNotification(notification);

    // Notify listeners
    this.listeners.forEach((listener) => listener(notification));
  }

  /**
   * Check if notification should be throttled
   */
  private shouldThrottle(alert: SLABreachAlert): boolean {
    if (!this.config.throttleMinutes) {
      return false;
    }

    const throttleMs = this.config.throttleMinutes * 60 * 1000;
    const now = Date.now();

    // Check if we recently sent a notification for this ticket
    for (const notification of this.sentNotifications.values()) {
      if (
        notification.alert.ticketId === alert.ticketId &&
        notification.alert.type === alert.type &&
        now - notification.sentAt.getTime() < throttleMs
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Dispatch notification to all configured channels
   */
  private async dispatchNotification(notification: SLANotification): Promise<void> {
    const dispatchers: Promise<void>[] = [];

    for (const channel of notification.channels) {
      switch (channel) {
        case 'browser':
          dispatchers.push(this.sendBrowserNotification(notification));
          break;
        case 'toast':
          dispatchers.push(this.sendToastNotification(notification));
          break;
        case 'webhook':
          if (this.config.webhookUrl) {
            dispatchers.push(this.sendWebhookNotification(notification));
          }
          break;
        case 'email':
          if (this.config.emailRecipients?.length) {
            dispatchers.push(this.sendEmailNotification(notification));
          }
          break;
      }
    }

    await Promise.allSettled(dispatchers);
  }

  /**
   * Send browser notification
   */
  private async sendBrowserNotification(notification: SLANotification): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    const { alert } = notification;
    const title =
      alert.type === 'BREACH'
        ? `SLA Breach: ${alert.ticketNumber}`
        : `SLA Warning: ${alert.ticketNumber}`;

    const options: NotificationOptions = {
      body: alert.message,
      icon: '/icons/sla-alert.png',
      badge: '/icons/badge.png',
      tag: `sla-${alert.ticketId}`,
      requireInteraction: notification.priority === 'urgent',
      data: {
        ticketId: alert.ticketId,
        ticketNumber: alert.ticketNumber,
        url: `/tickets/${alert.ticketId}`,
      },
    };

    const browserNotification = new Notification(title, options);

    browserNotification.onclick = () => {
      window.focus();
      // Navigate to ticket - would integrate with router in real app
      window.location.href = `/tickets/${alert.ticketId}`;
    };

    // Play sound if enabled
    if (this.config.soundEnabled && notification.priority === 'urgent') {
      this.playAlertSound();
    }
  }

  /**
   * Send toast notification (for in-app display)
   */
  private async sendToastNotification(notification: SLANotification): Promise<void> {
    // Toast notifications are handled by the UI layer
    // This just emits the notification for the UI to pick up
    // In a real app, this would integrate with a toast library like react-hot-toast
    console.log('[SLA Toast]', notification.alert.message);
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(notification: SLANotification): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    try {
      const payload = {
        type: 'sla_notification',
        notification: {
          id: notification.id,
          ticketId: notification.alert.ticketId,
          ticketNumber: notification.alert.ticketNumber,
          alertType: notification.alert.type,
          severity: notification.alert.severity,
          message: notification.alert.message,
          priority: notification.alert.priority,
          timestamp: notification.sentAt.toISOString(),
        },
      };

      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: SLANotification): Promise<void> {
    // In a real app, this would call an email API
    // For now, just log it
    console.log('[SLA Email]', {
      to: this.config.emailRecipients,
      subject: `SLA ${notification.alert.type}: ${notification.alert.ticketNumber}`,
      body: notification.alert.message,
    });
  }

  /**
   * Play alert sound for urgent notifications
   */
  private playAlertSound(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const audio = new Audio('/sounds/sla-alert.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Audio play failed, likely due to autoplay policy
      });
    } catch {
      // Audio not supported
    }
  }

  /**
   * Subscribe to notification events
   */
  onNotification(callback: (notification: SLANotification) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get recent notifications
   */
  getRecentNotifications(limit: number = 10): SLANotification[] {
    return this.notificationQueue.slice(-limit).reverse();
  }

  /**
   * Acknowledge a notification
   */
  acknowledgeNotification(notificationId: string, userId: string): boolean {
    const notification = this.sentNotifications.get(notificationId);
    if (!notification) {
      return false;
    }

    notification.acknowledgedAt = new Date();
    notification.acknowledgedBy = userId;
    return true;
  }

  /**
   * Get unacknowledged notification count
   */
  getUnacknowledgedCount(): number {
    let count = 0;
    for (const notification of this.sentNotifications.values()) {
      if (!notification.acknowledgedAt) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clear old notifications
   */
  clearOldNotifications(olderThanMinutes: number = 60): void {
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    for (const [id, notification] of this.sentNotifications.entries()) {
      if (notification.sentAt.getTime() < cutoff) {
        this.sentNotifications.delete(id);
      }
    }
    this.notificationQueue = this.notificationQueue.filter(
      (n) => n.sentAt.getTime() >= cutoff
    );
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * React hook for SLA notifications
 */
export function useSLANotifications(
  config: Partial<NotificationConfig> = {}
): {
  notifications: SLANotification[];
  unacknowledgedCount: number;
  acknowledge: (id: string) => void;
} {
  // This is a placeholder - in a real app, this would use React state
  // and integrate with the notification manager
  return {
    notifications: [],
    unacknowledgedCount: 0,
    acknowledge: () => {},
  };
}

// Export singleton instance
export const slaNotificationManager = new SLANotificationManager();
