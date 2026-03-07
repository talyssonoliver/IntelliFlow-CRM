import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS } from '../icon-reference';

export const helpCenterSidebarConfig: SidebarConfig = {
  moduleId: 'helpCenter',
  moduleTitle: 'Help Center',
  moduleIcon: MODULE_ICONS.helpCenter,
  showSettings: false,
  sections: [
    {
      id: 'browse',
      title: 'Browse',
      items: [
        { id: 'all', label: 'All Topics', icon: VIEW_ICONS.all, href: '/help-center' },
        { id: 'search', label: 'Search', icon: 'search', href: '/help-center/search' },
        {
          id: 'popular',
          label: 'Popular',
          icon: VIEW_ICONS.starred,
          href: '/help-center?view=popular',
        },
      ],
    },
    {
      id: 'support',
      title: 'Get Help',
      items: [
        { id: 'contact', label: 'Contact Support', icon: 'chat', href: '/support/tickets/new' },
      ],
    },
  ],
};
