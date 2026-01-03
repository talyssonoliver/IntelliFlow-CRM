import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS } from '../icon-reference';

export const governanceSidebarConfig: SidebarConfig = {
  moduleId: 'governance',
  moduleTitle: 'Governance',
  moduleIcon: MODULE_ICONS.governance,
  settingsHref: '/settings',
  showSettings: true,
  sections: [
    {
      id: 'overview',
      title: 'Governance',
      items: [
        {
          id: 'dashboard',
          label: 'Overview',
          icon: 'dashboard',
          href: '/governance',
        },
        {
          id: 'compliance',
          label: 'Compliance',
          icon: 'verified_user',
          href: '/governance/compliance',
        },
        {
          id: 'adr',
          label: 'ADR Registry',
          icon: 'architecture',
          href: '/governance/adr',
        },
        {
          id: 'policies',
          label: 'Policies',
          icon: 'description',
          href: '/governance/policies',
        },
      ],
    },
    {
      id: 'quality',
      title: 'Quality',
      items: [
        {
          id: 'quality-reports',
          label: 'Quality Reports',
          icon: 'monitoring',
          href: '/governance/quality-reports',
        },
        {
          id: 'lighthouse',
          label: 'Lighthouse',
          icon: 'speed',
          href: '/governance/quality-reports/lighthouse',
        },
        {
          id: 'coverage',
          label: 'Test Coverage',
          icon: 'bug_report',
          href: '/governance/quality-reports/coverage',
        },
        {
          id: 'performance',
          label: 'Performance',
          icon: 'timeline',
          href: '/governance/quality-reports/performance',
        },
      ],
    },
  ],
};
