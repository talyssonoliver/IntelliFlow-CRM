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
        // Removed non-existent pages to prevent 404 errors:
        // - /docs/guides (will be added in future task)
        // - /docs/api (will be added in future task)
        // - /docs/architecture (will be added in future task)
      ],
    },
    // Developer Tools section — items will be added by PG-033 (playground) and PG-035 (changelog)
  ],
};
