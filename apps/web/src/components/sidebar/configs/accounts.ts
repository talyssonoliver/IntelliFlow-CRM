import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

export const accountsSidebarConfig: SidebarConfig = {
  moduleId: 'accounts',
  moduleTitle: 'Accounts',
  moduleIcon: MODULE_ICONS.accounts,
  settingsHref: '/settings/accounts',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Account Views',
      items: [
        { id: 'all', label: 'All Accounts', icon: VIEW_ICONS.all, href: '/accounts' },
        { id: 'my', label: 'My Accounts', icon: VIEW_ICONS.my, href: '/accounts?view=my' },
        { id: 'recent', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/accounts?view=recent' },
      ],
    },
    {
      id: 'tiers',
      title: 'Account Tiers',
      items: [
        { id: 'enterprise', label: 'Enterprise', icon: SEGMENT_ICONS.statusDot, color: 'text-purple-500', href: '/accounts?tier=enterprise' },
        { id: 'mid-market', label: 'Mid-Market', icon: SEGMENT_ICONS.statusDot, color: 'text-blue-500', href: '/accounts?tier=mid-market' },
        { id: 'smb', label: 'SMB', icon: SEGMENT_ICONS.statusDot, color: 'text-green-500', href: '/accounts?tier=smb' },
        { id: 'startup', label: 'Startup', icon: SEGMENT_ICONS.statusDot, color: 'text-yellow-500', href: '/accounts?tier=startup' },
      ],
    },
  ],
};
