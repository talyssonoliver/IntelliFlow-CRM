import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, FEATURE_ICONS } from '../icon-reference';

/** Settings items shown when on a notification settings page */
export const NOTIFICATION_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'notification-settings', label: 'Notification Settings', icon: 'tune', href: '/notifications/settings' },
  { id: 'channels', label: 'Channels', icon: 'devices', href: '/notifications/channels' },
  { id: 'quiet-hours', label: 'Quiet Hours', icon: 'do_not_disturb_on', href: '/notifications/quiet-hours' },
];

const SETTINGS_PATHS = NOTIFICATION_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a notification settings page */
export function isNotificationSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

const CENTER_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'center',
    title: 'Notification Center',
    items: [
      {
        id: 'all',
        label: 'All Notifications',
        icon: VIEW_ICONS.all,
        href: '/notifications',
      },
      {
        id: 'unread',
        label: 'Unread',
        icon: 'mark_email_unread',
        href: '/notifications?filter=unread',
      },
    ],
  },
  {
    id: 'priority',
    title: 'Priority Filtering',
    items: [
      {
        id: 'high',
        label: 'High Priority',
        icon: 'priority_high',
        color: 'text-destructive',
        href: '/notifications?priority=high',
      },
      {
        id: 'normal',
        label: 'Normal',
        icon: 'remove',
        href: '/notifications?priority=normal',
      },
      {
        id: 'low',
        label: 'Low Priority',
        icon: 'arrow_downward',
        color: 'text-muted-foreground',
        href: '/notifications?priority=low',
      },
    ],
  },
  {
    id: 'types',
    title: 'By Type',
    items: [
      {
        id: 'mentions',
        label: 'Mentions',
        icon: 'alternate_email',
        href: '/notifications?filter=mentions',
      },
      {
        id: 'sla-alerts',
        label: 'SLA Alerts',
        icon: 'timer',
        color: 'text-destructive',
        href: '/notifications?filter=sla-alerts',
      },
      {
        id: 'ai-insights',
        label: 'AI Insights',
        icon: FEATURE_ICONS.agent,
        href: '/notifications?filter=ai-insights',
      },
      {
        id: 'system',
        label: 'System Alerts',
        icon: 'info',
        href: '/notifications?filter=system',
      },
    ],
  },
];

/**
 * List mode — notification center views, Module Settings button.
 */
export function createNotificationsSidebarConfig(
  onSettingsClick?: () => void,
): SidebarConfig {
  return {
    moduleId: 'notifications',
    moduleTitle: 'Notifications',
    moduleIcon: MODULE_ICONS.notifications,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    sections: CENTER_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, notification center views below.
 */
export function createNotificationsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'notifications',
    moduleTitle: 'Notifications',
    moduleIcon: MODULE_ICONS.notifications,
    showSettings: false,
    beforeContent,
    sections: CENTER_SECTIONS,
  };
}

/** Static config for backward compatibility */
export const notificationsSidebarConfig = createNotificationsSidebarConfig();
