import type { SidebarConfig } from '../sidebar-types';

export const casesSidebarConfig: SidebarConfig = {
  moduleId: 'cases',
  moduleTitle: 'Cases',
  moduleIcon: 'gavel',
  settingsHref: '/settings/cases',
  showSettings: false,
  sections: [
    {
      id: 'views',
      title: 'Case Views',
      items: [
        { id: 'all', label: 'All Cases', icon: 'gavel', href: '/cases' },
        { id: 'my', label: 'My Cases', icon: 'person', href: '/cases?view=my' },
        { id: 'overdue', label: 'Overdue', icon: 'warning', color: 'text-destructive', href: '/cases?view=overdue' },
        { id: 'open', label: 'Open Cases', icon: 'folder_open', href: '/cases?status=OPEN' },
      ],
    },
    {
      id: 'priority',
      title: 'By Priority',
      items: [
        { id: 'urgent', label: 'Urgent', icon: 'priority_high', color: 'text-destructive', href: '/cases?priority=URGENT' },
        { id: 'high', label: 'High Priority', icon: 'flag', color: 'text-warning', href: '/cases?priority=HIGH' },
      ],
    },
  ],
};
