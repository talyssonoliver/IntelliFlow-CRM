import type { SidebarConfig, SidebarItem } from '../sidebar-types';

/** Settings items shown when on a task settings page */
export const TASK_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'task-settings', label: 'Task Settings', icon: 'tune', href: '/tasks/task-settings' },
  { id: 'task-types', label: 'Task Types', icon: 'category', href: '/tasks/task-types' },
  { id: 'automation', label: 'Task Automation', icon: 'auto_awesome', href: '/tasks/automation' },
];

const SETTINGS_PATHS = TASK_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a task settings page */
export function isTaskSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Task Views',
    items: [
      { id: 'all', label: 'All Tasks', icon: 'checklist', href: '/tasks' },
      { id: 'my', label: 'My Tasks', icon: 'person', href: '/tasks?view=my' },
      { id: 'overdue', label: 'Overdue', icon: 'warning', color: 'text-destructive', href: '/tasks?view=overdue' },
      { id: 'today', label: 'Due Today', icon: 'today', href: '/tasks?view=today' },
      { id: 'upcoming', label: 'Upcoming', icon: 'event_upcoming', href: '/tasks?view=upcoming' },
      { id: 'task-calendar', label: 'Task Calendar', icon: 'calendar_month', href: '/calendar?show=tasks' },
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
];

/** List mode — filters inline + Module Settings button */
export function createTasksSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'tasks',
    moduleTitle: 'Tasks',
    moduleIcon: 'task_alt',
    onSettingsClick,
    showSettings: true,
    sections: VIEW_SECTIONS,
  };
}

/** Settings mode — settings items inline at top, Task Views & Priority sections below */
export function createTasksSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'tasks',
    moduleTitle: 'Tasks',
    moduleIcon: 'task_alt',
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}

/** @deprecated Use createTasksSidebarConfig(onSettingsClick) instead */
export const tasksSidebarConfig: SidebarConfig = {
  ...createTasksSidebarConfig(() => {}),
  settingsHref: '/settings/tasks',
};
