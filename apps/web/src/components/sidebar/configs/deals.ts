import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, SEGMENT_ICONS, FEATURE_ICONS, ACTION_ICONS } from '../icon-reference';

/** Settings items shown when on a deal settings page */
export const DEAL_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'deal-settings', label: 'Deal Settings', icon: 'tune', href: '/deals/deal-settings' },
  { id: 'deal-stages', label: 'Deal Stages', icon: 'view_kanban', href: '/deals/deal-stages' },
  {
    id: 'deal-automation',
    label: 'Deal Automation',
    icon: 'smart_toy',
    href: '/deals/deal-automation',
  },
];

const SETTINGS_PATHS = DEAL_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a deal settings page */
export function isDealSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Deal Views',
    items: [
      { id: 'list', label: 'List View', icon: ACTION_ICONS.list, href: '/deals' },
      {
        id: 'pipeline',
        label: 'Pipeline Board',
        icon: ACTION_ICONS.kanban,
        href: '/deals?view=pipeline',
      },
      {
        id: 'forecast',
        label: 'Forecast',
        icon: FEATURE_ICONS.forecast,
        href: '/deals/forecast',
      },
      {
        id: 'territory',
        label: 'Territory Map',
        icon: 'map',
        href: '/deals?view=territory',
      },
    ],
  },
  {
    id: 'folders',
    title: 'My Folders',
    items: [
      {
        id: 'enterprise-q1',
        label: 'Enterprise Q1',
        icon: SEGMENT_ICONS.folder,
        href: '/deals?folder=enterprise-q1',
      },
      {
        id: 'smb-renewals',
        label: 'SMB Renewals',
        icon: SEGMENT_ICONS.folder,
        href: '/deals?folder=smb-renewals',
      },
      {
        id: 'at-risk',
        label: 'At Risk',
        icon: SEGMENT_ICONS.folder,
        href: '/deals?folder=at-risk',
      },
    ],
  },
  {
    id: 'segments',
    title: 'Segments',
    items: [
      {
        id: 'hot',
        label: 'Hot Deals (>70%)',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-success',
        href: '/deals?segment=hot',
      },
      {
        id: 'stalled',
        label: 'Stalled (>30 days)',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-warning',
        href: '/deals?segment=stalled',
      },
    ],
  },
  {
    id: 'trash-section',
    title: '',
    items: [
      {
        id: 'trash',
        label: 'Trash',
        icon: ACTION_ICONS.delete,
        href: '/deals/trash',
      },
    ],
  },
];

/**
 * List mode — views, folders, segments, trash, Module Settings button.
 */
export function createDealsSidebarConfig(onSettingsClick?: () => void): SidebarConfig {
  return {
    moduleId: 'deals',
    moduleTitle: 'Deals',
    moduleIcon: MODULE_ICONS.deals,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    sections: VIEW_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, views/folders/segments below.
 */
export function createDealsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'deals',
    moduleTitle: 'Deals',
    moduleIcon: MODULE_ICONS.deals,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}

/** Static config for backward compatibility */
export const dealsSidebarConfig = createDealsSidebarConfig();
