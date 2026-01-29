import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, FEATURE_ICONS } from '../icon-reference';

export const notificationsSidebarConfig: SidebarConfig = {
  moduleId: 'notifications',
  moduleTitle: 'Notifications',
  moduleIcon: MODULE_ICONS.notifications,
  settingsHref: '/notifications/settings',
  showSettings: true,
  sections: [
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
    {
      id: 'configuration',
      title: 'Configuration',
      items: [
        {
          id: 'channels',
          label: 'Channels',
          icon: 'devices',
          href: '/notifications/channels',
        },
        {
          id: 'quiet-hours',
          label: 'Quiet Hours',
          icon: 'do_not_disturb_on',
          href: '/notifications/quiet-hours',
        },
      ],
    },
  ],
};
