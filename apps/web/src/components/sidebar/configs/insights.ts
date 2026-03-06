import type { SidebarConfig } from '../sidebar-types';
import { FEATURE_ICONS, STATUS_ICONS } from '../icon-reference';

export const insightsSidebarConfig: SidebarConfig = {
  moduleId: 'insights',
  moduleTitle: 'AI Insights',
  moduleIcon: FEATURE_ICONS.insight,
  showSettings: false,
  sections: [
    {
      id: 'views',
      title: 'Views',
      items: [
        { id: 'all', label: 'All Insights', icon: FEATURE_ICONS.insight, href: '/insights' },
        {
          id: 'warnings',
          label: 'Warnings',
          icon: STATUS_ICONS.warning,
          href: '/insights?type=warning',
        },
        {
          id: 'opportunities',
          label: 'Opportunities',
          icon: FEATURE_ICONS.trend,
          href: '/insights?type=opportunity',
        },
        {
          id: 'reminders',
          label: 'Reminders',
          icon: 'schedule',
          href: '/insights?type=reminder',
        },
        {
          id: 'achievements',
          label: 'Achievements',
          icon: 'emoji_events',
          href: '/insights?type=achievement',
        },
      ],
    },
  ],
};
