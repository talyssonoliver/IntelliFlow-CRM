import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS } from '../icon-reference';

export const settingsSidebarConfig: SidebarConfig = {
  moduleId: 'settings',
  moduleTitle: 'Settings',
  moduleIcon: MODULE_ICONS.settings,
  showSettings: false, // We're already in settings
  sections: [
    {
      id: 'settings',
      title: 'Settings',
      items: [
        {
          id: 'account',
          label: 'Account',
          icon: 'person',
          href: '/settings/account',
        },
        {
          id: 'team',
          label: 'Team',
          icon: 'group',
          href: '/settings/team',
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: 'extension',
          href: '/settings/integrations',
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: 'notifications',
          href: '/settings/notifications',
        },
      ],
    },
    {
      id: 'more',
      title: 'More',
      items: [
        {
          id: 'governance',
          label: 'Governance',
          icon: MODULE_ICONS.governance,
          href: '/governance',
        },
      ],
    },
  ],
};
