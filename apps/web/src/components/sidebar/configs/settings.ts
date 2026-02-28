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
          id: 'ai',
          label: 'AI Chains',
          icon: 'auto_awesome',
          href: '/settings/ai',
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
        {
          id: 'pipeline',
          label: 'Pipeline',
          icon: 'linear_scale',
          href: '/settings/pipeline',
        },
        {
          id: 'routing',
          label: 'Lead Routing',
          icon: 'alt_route',
          href: '/settings/routing',
        },
        {
          id: 'security',
          label: 'Security',
          icon: 'security',
          href: '/settings/security/mfa',
        },
      ],
    },
    {
      id: 'more',
      title: 'More',
      items: [
        {
          id: 'billing',
          label: 'Billing',
          icon: 'credit_card',
          href: '/billing',
        },
        {
          id: 'governance',
          label: 'Governance',
          icon: MODULE_ICONS.governance,
          href: '/governance',
        },
        {
          id: 'developer-docs',
          label: 'Developer Docs',
          icon: 'code',
          href: '/docs',
          roles: ['SUPER_ADMIN'],
        },
        {
          id: 'developer-portal',
          label: 'Developer Portal',
          icon: 'integration_instructions',
          href: '/developers/apps',
        },
      ],
    },
  ],
};
