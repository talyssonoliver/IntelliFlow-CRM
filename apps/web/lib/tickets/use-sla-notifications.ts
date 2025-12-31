/**
 * SLA Notifications Hook - IFC-093 Integration
 *
 * React hook to initialize and manage SLA notification system.
 * Call this hook in the app layout or dashboard to enable real-time SLA alerts.
 *
 * Usage:
 * ```tsx
 * // In layout.tsx or dashboard page
 * import { useSLANotifications } from '@/lib/tickets/use-sla-notifications';
 *
 * export default function DashboardLayout() {
 *   useSLANotifications(); // Initializes notification manager
 *   return <div>...</div>;
 * }
 * ```
 */

'use client';

import { useEffect, useRef } from 'react';
import { SLANotificationManager, NotificationConfig } from './sla-notifications';
import { slaTrackingService } from './sla-service';

const DEFAULT_NOTIFICATION_CONFIG: Partial<NotificationConfig> = {
  channels: ['browser', 'toast'],
  soundEnabled: true,
  groupSimilar: true,
  throttleMinutes: 5,
};

/**
 * Initialize SLA notification system
 * Automatically subscribes to SLA breach and warning alerts
 */
export function useSLANotifications(config: Partial<NotificationConfig> = {}) {
  const managerRef = useRef<SLANotificationManager | null>(null);

  useEffect(() => {
    // Initialize notification manager on mount
    const manager = new SLANotificationManager({
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...config,
    });

    manager.initialize(slaTrackingService);
    managerRef.current = manager;

    console.log('[SLA] Notification system initialized');

    // Cleanup on unmount
    return () => {
      manager.dispose();
      managerRef.current = null;
      console.log('[SLA] Notification system disposed');
    };
  }, []); // Empty deps - only initialize once

  return managerRef.current;
}

/**
 * Hook to listen for SLA notifications
 * Useful for displaying toasts or custom UI elements
 */
export function useSLANotificationListener(
  callback: (notification: any) => void
) {
  const manager = useSLANotifications();

  useEffect(() => {
    if (!manager) return;

    const unsubscribe = manager.onNotification(callback);
    return unsubscribe;
  }, [manager, callback]);
}
