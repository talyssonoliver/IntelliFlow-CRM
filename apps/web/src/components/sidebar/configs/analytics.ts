import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, SEGMENT_ICONS, FEATURE_ICONS } from '../icon-reference';

export const analyticsSidebarConfig: SidebarConfig = {
  moduleId: 'analytics',
  moduleTitle: 'Analytics',
  moduleIcon: MODULE_ICONS.analytics,
  settingsHref: '/settings/reports',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Report Views',
      items: [
        { id: 'overview', label: 'Overview', icon: MODULE_ICONS.dashboard, href: '/analytics' },
        {
          id: 'sales',
          label: 'Sales Reports',
          icon: FEATURE_ICONS.chart,
          href: '/analytics?view=sales',
        },
        {
          id: 'pipeline',
          label: 'Pipeline Analysis',
          icon: FEATURE_ICONS.pipeline,
          href: '/analytics?view=pipeline',
        },
        {
          id: 'forecasts',
          label: 'Forecasts',
          icon: FEATURE_ICONS.forecast,
          href: '/analytics?view=forecasts',
        },
      ],
    },
    {
      id: 'saved',
      title: 'Saved Reports',
      items: [
        {
          id: 'weekly',
          label: 'Weekly Summary',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-primary',
          href: '/analytics/saved/weekly',
        },
        {
          id: 'monthly',
          label: 'Monthly Revenue',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-success',
          href: '/analytics/saved/monthly',
        },
        {
          id: 'quarterly',
          label: 'Q4 Performance',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/analytics/saved/quarterly',
        },
      ],
    },
  ],
};
