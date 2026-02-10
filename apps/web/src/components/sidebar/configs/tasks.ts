import type { SidebarConfig } from '../sidebar-types';

export const tasksSidebarConfig: SidebarConfig = {
  moduleId: 'tasks',
  moduleTitle: 'Tasks',
  moduleIcon: 'task_alt',
  settingsHref: '/settings/tasks',
  showSettings: false,
  sections: [
    {
      id: 'views',
      title: 'Task Views',
      items: [
        { id: 'all', label: 'All Tasks', icon: 'checklist', href: '/tasks' },
        { id: 'my', label: 'My Tasks', icon: 'person', href: '/tasks?view=my' },
        { id: 'overdue', label: 'Overdue', icon: 'warning', color: 'text-destructive', href: '/tasks?view=overdue' },
        { id: 'today', label: 'Due Today', icon: 'today', href: '/tasks?view=today' },
        { id: 'upcoming', label: 'Upcoming', icon: 'event_upcoming', href: '/tasks?view=upcoming' },
      ],
    },
    {
      id: 'priority',
      title: 'By Priority',
      items: [
        { id: 'urgent', label: 'Urgent', icon: 'priority_high', color: 'text-destructive', href: '/tasks?priority=URGENT' },
        { id: 'high', label: 'High Priority', icon: 'flag', color: 'text-warning', href: '/tasks?priority=HIGH' },
      ],
    },
  ],
};
