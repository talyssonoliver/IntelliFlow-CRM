import type { SidebarConfig, SidebarItem } from '../sidebar-types';

/**
 * Settings items shown when on a case-settings-only page.
 *
 * Note: `case-workflows` deliberately lives in `VIEW_SECTIONS` (under
 * Automation), not here. Workflows are a first-class sub-section of Cases,
 * not a settings concern — the module sidebar is what users expect on that
 * page, and `isCaseSettingsPage()` returning false for it is the contract.
 */
export const CASE_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'case-settings', label: 'Case Settings', icon: 'tune', href: '/cases/case-settings' },
  { id: 'case-types', label: 'Case Types', icon: 'category', href: '/cases/case-types' },
];

const SETTINGS_PATHS = CASE_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a case settings page */
export function isCaseSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Case Views',
    items: [
      { id: 'all', label: 'All Cases', icon: 'gavel', href: '/cases' },
      { id: 'my', label: 'My Cases', icon: 'person', href: '/cases?view=my' },
      {
        id: 'overdue',
        label: 'Overdue',
        icon: 'warning',
        color: 'text-destructive',
        href: '/cases?view=overdue',
      },
      { id: 'open', label: 'Open Cases', icon: 'folder_open', href: '/cases?status=OPEN' },
      { id: 'timeline', label: 'Timeline', icon: 'timeline', href: '/cases/timeline' },
    ],
  },
  {
    id: 'automation',
    title: 'Automation',
    items: [
      {
        id: 'workflows',
        label: 'Workflows',
        icon: 'account_tree',
        href: '/cases/case-workflows',
      },
    ],
  },
  {
    id: 'priority',
    title: 'By Priority',
    items: [
      {
        id: 'urgent',
        label: 'Urgent',
        icon: 'priority_high',
        color: 'text-destructive',
        href: '/cases?priority=URGENT',
      },
      {
        id: 'high',
        label: 'High Priority',
        icon: 'flag',
        color: 'text-warning',
        href: '/cases?priority=HIGH',
      },
    ],
  },
];

/**
 * List mode — views, priority segments, Module Settings button.
 */
export function createCasesSidebarConfig(onSettingsClick?: () => void): SidebarConfig {
  return {
    moduleId: 'cases',
    moduleTitle: 'Cases',
    moduleIcon: 'gavel',
    showSettings: !!onSettingsClick,
    onSettingsClick,
    sections: VIEW_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, views/priority below.
 */
export function createCasesSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'cases',
    moduleTitle: 'Cases',
    moduleIcon: 'gavel',
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
