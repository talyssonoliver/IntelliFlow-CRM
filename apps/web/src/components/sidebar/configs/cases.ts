import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS } from '../icon-reference';

/**
 * Cases module sidebar — mirrors the contacts/leads canonical pattern.
 *
 * Two view sections (Case Views, By Priority); Workflows is exposed via
 * Case Settings (consistent with how tickets handles its automations).
 */

/** Settings items shown when on a case-settings page. */
export const CASE_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'case-settings', label: 'Case Settings', icon: 'tune', href: '/cases/case-settings' },
  { id: 'case-types', label: 'Case Types', icon: 'category', href: '/cases/case-types' },
  {
    id: 'case-workflows',
    label: 'Case Workflows',
    icon: MODULE_ICONS.workflows,
    href: '/cases/case-workflows',
  },
];

const SETTINGS_PATHS = CASE_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname,
);

/** True when the pathname is a case-settings sub-page. */
export function isCaseSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Case Views',
    items: [
      { id: 'all', label: 'All Cases', icon: VIEW_ICONS.all, href: '/cases' },
      { id: 'my', label: 'My Cases', icon: VIEW_ICONS.my, href: '/cases?view=my' },
      {
        id: 'overdue',
        label: 'Overdue',
        icon: 'warning',
        color: 'text-destructive',
        href: '/cases?view=overdue',
      },
      {
        id: 'open',
        label: 'Open Cases',
        icon: 'folder_open',
        href: '/cases?status=OPEN',
      },
      { id: 'timeline', label: 'Timeline', icon: 'timeline', href: '/cases/timeline' },
    ],
  },
  {
    id: 'priority',
    title: 'By Priority',
    items: [
      {
        id: 'urgent',
        label: 'Urgent',
        icon: VIEW_ICONS.urgent,
        color: 'text-destructive',
        href: '/cases?priority=URGENT',
      },
      {
        id: 'high',
        label: 'High Priority',
        icon: VIEW_ICONS.highPriority,
        color: 'text-warning',
        href: '/cases?priority=HIGH',
      },
    ],
  },
];

/**
 * Cases sidebar — list mode. Mirrors the contacts/leads pattern exactly:
 * required `onSettingsClick`, `showSettings: true` always, two view sections.
 */
export function createCasesSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'cases',
    moduleTitle: 'Cases',
    moduleIcon: MODULE_ICONS.cases,
    showSettings: true,
    onSettingsClick,
    sections: VIEW_SECTIONS,
  };
}

/**
 * Cases sidebar — settings mode. Renders settings nav at the top via
 * `beforeContent`, with the same view sections still available below.
 */
export function createCasesSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'cases',
    moduleTitle: 'Cases',
    moduleIcon: MODULE_ICONS.cases,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
