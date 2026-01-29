import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS, FEATURE_ICONS } from '../icon-reference';

export const dealsSidebarConfig: SidebarConfig = {
  moduleId: 'deals',
  moduleTitle: 'Deals',
  moduleIcon: MODULE_ICONS.deals,
  settingsHref: '/settings/deals',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Deal Views',
      items: [
        { id: 'all', label: 'All Deals', icon: VIEW_ICONS.all, href: '/deals' },
        { id: 'my', label: 'My Deals', icon: VIEW_ICONS.my, href: '/deals?view=my' },
        {
          id: 'closing',
          label: 'Closing This Month',
          icon: FEATURE_ICONS.closeDate,
          href: '/deals?view=closing',
        },
        {
          id: 'high-value',
          label: 'High Value (>$50K)',
          icon: FEATURE_ICONS.highValue,
          href: '/deals?view=high-value',
        },
        {
          id: 'forecast',
          label: 'Forecast',
          icon: FEATURE_ICONS.forecast,
          href: '/deals/all/forecast',
        },
      ],
    },
    {
      id: 'segments',
      title: 'Segments',
      items: [
        {
          id: 'hot',
          label: 'Hot Deals (>70%)',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-success',
          href: '/deals?segment=hot',
        },
        {
          id: 'at-risk',
          label: 'At Risk',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-destructive',
          href: '/deals?segment=at-risk',
        },
        {
          id: 'stalled',
          label: 'Stalled (>30 days)',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/deals?segment=stalled',
        },
      ],
    },
  ],
};
