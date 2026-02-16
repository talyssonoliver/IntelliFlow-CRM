import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, SEGMENT_ICONS, FEATURE_ICONS, ACTION_ICONS } from '../icon-reference';

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
        { id: 'list', label: 'List View', icon: ACTION_ICONS.list, href: '/deals' },
        {
          id: 'pipeline',
          label: 'Pipeline Board',
          icon: ACTION_ICONS.kanban,
          href: '/deals?view=pipeline',
        },
        {
          id: 'forecast',
          label: 'Forecast',
          icon: FEATURE_ICONS.forecast,
          href: '/deals/forecast',
        },
        {
          id: 'territory',
          label: 'Territory Map',
          icon: 'map',
          href: '/deals?view=territory',
        },
      ],
    },
    {
      id: 'folders',
      title: 'My Folders',
      items: [
        {
          id: 'enterprise-q1',
          label: 'Enterprise Q1',
          icon: SEGMENT_ICONS.folder,
          href: '/deals?folder=enterprise-q1',
        },
        {
          id: 'smb-renewals',
          label: 'SMB Renewals',
          icon: SEGMENT_ICONS.folder,
          href: '/deals?folder=smb-renewals',
        },
        {
          id: 'at-risk',
          label: 'At Risk',
          icon: SEGMENT_ICONS.folder,
          href: '/deals?folder=at-risk',
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
          id: 'stalled',
          label: 'Stalled (>30 days)',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/deals?segment=stalled',
        },
      ],
    },
    {
      id: 'trash-section',
      title: '',
      items: [
        {
          id: 'trash',
          label: 'Trash',
          icon: ACTION_ICONS.delete,
          href: '/deals/trash',
        },
      ],
    },
  ],
};
