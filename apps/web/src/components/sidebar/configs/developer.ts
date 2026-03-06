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
          id: 'architecture',
          label: 'Architecture',
          icon: 'architecture',
          href: '/docs/architecture',
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: 'integration_instructions',
          href: '/docs/integrations',
        },
        {
          id: 'webhooks',
          label: 'Webhooks',
          icon: 'webhook',
          href: '/docs/webhooks',
        },
        {
          id: 'sdk',
          label: 'SDK Guides',
          icon: 'terminal',
          href: '/docs/sdk',
        },
        {
          id: 'guides',
          label: 'Developer Guides',
          icon: 'menu_book',
          href: '/docs/guides',
        },
        {
          id: 'cli',
          label: 'CLI Reference',
          icon: 'code_blocks',
          href: '/docs/cli',
        },
        {
          id: 'auth',
          label: 'Authentication',
          icon: 'lock',
          href: '/docs/auth',
        },
        {
          id: 'changelog',
          label: 'Changelog',
          icon: 'history',
          href: '/docs/changelog',
        },
      ],
    },
    {
      id: 'developer-tools',
      title: 'Developer Tools',
      items: [
        {
          id: 'apps',
          label: 'My Apps',
          icon: 'apps',
          href: '/developers/apps',
        },
        // PG-033 (playground) will add items here
      ],
    },
  ],
};
