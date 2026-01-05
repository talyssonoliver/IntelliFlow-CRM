import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

export const leadsSidebarConfig: SidebarConfig = {
  moduleId: 'leads',
  moduleTitle: 'Leads',
  moduleIcon: MODULE_ICONS.leads,
  settingsHref: '/settings/leads',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Lead Views',
      items: [
        { id: 'all', label: 'All Leads', icon: VIEW_ICONS.all, href: '/leads' },
        { id: 'my', label: 'My Leads', icon: VIEW_ICONS.my, href: '/leads?view=my' },
        { id: 'starred', label: 'Starred', icon: VIEW_ICONS.starred, href: '/leads?view=starred' },
        { id: 'recent', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/leads?view=recent' },
      ],
    },
    {
      id: 'segments',
      title: 'Segments',
      items: [
        {
          id: 'new-week',
          label: 'New This Week',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-success',
          href: '/leads?segment=new-week',
        },
        {
          id: 'hot',
          label: 'Hot Leads (>80)',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/leads?segment=hot',
        },
        {
          id: 'followup',
          label: 'Needs Follow-up',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-destructive',
          href: '/leads?segment=followup',
        },
      ],
    },
  ],
};
