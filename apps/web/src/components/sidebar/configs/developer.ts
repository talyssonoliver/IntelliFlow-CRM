import type { SidebarConfig } from '../sidebar-types';

export const developerSidebarConfig: SidebarConfig = {
  moduleId: 'developer',
  moduleTitle: 'Developer',
  moduleIcon: 'integration_instructions',
  settingsHref: '/settings',
  showSettings: true,
  sections: [
    {
      id: 'documentation',
      title: 'Documentation',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: 'dashboard',
          href: '/docs',
        },
        {
          id: 'api-reference',
          label: 'API Reference',
          icon: 'api',
          href: '/docs/api',
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: 'integration_instructions',
          href: '/docs/integrations',
        },
      ],
    },
    // Developer Tools section — items will be added by PG-033 (playground) and PG-035 (changelog)
  ],
};
