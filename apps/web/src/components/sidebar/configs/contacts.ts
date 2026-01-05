import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

export const contactsSidebarConfig: SidebarConfig = {
  moduleId: 'contacts',
  moduleTitle: 'Contacts',
  moduleIcon: MODULE_ICONS.contacts,
  settingsHref: '/settings/contacts',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Contact Views',
      items: [
        { id: 'all', label: 'All Contacts', icon: VIEW_ICONS.all, href: '/contacts' },
        { id: 'my', label: 'My Contacts', icon: VIEW_ICONS.my, href: '/contacts?view=my' },
        { id: 'recent-added', label: 'Recently Added', icon: VIEW_ICONS.recent, href: '/contacts?view=recent-added' },
        { id: 'recent-viewed', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/contacts?view=recent-viewed' },
      ],
    },
    {
      id: 'segments',
      title: 'Segments',
      items: [
        {
          id: 'vip',
          label: 'VIP Clients',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-chart-2',
          href: '/contacts?segment=vip',
        },
        {
          id: 'partners',
          label: 'Partners',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-info',
          href: '/contacts?segment=partners',
        },
        {
          id: 'vendors',
          label: 'Vendors',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/contacts?segment=vendors',
        },
      ],
    },
  ],
};
