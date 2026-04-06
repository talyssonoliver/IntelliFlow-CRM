import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS, FEATURE_ICONS } from '../icon-reference';

/** Settings items shown when on a settings page */
export const LEAD_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'lead-settings', label: 'Lead Settings', icon: 'tune', href: '/leads/lead-settings' },
  { id: 'pipeline', label: 'Pipeline Stages', icon: FEATURE_ICONS.pipeline, href: '/leads/pipeline' },
  { id: 'routing', label: 'Lead Routing', icon: 'route', href: '/leads/routing' },
];

const SETTINGS_PATHS = LEAD_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a lead settings page */
export function isLeadSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

/** List mode — filters inline + Module Settings button */
export function createLeadsSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'leads',
    moduleTitle: 'Leads',
    moduleIcon: MODULE_ICONS.leads,
    onSettingsClick,
    showSettings: true,
    sections: [
      {
        id: 'views',
        title: 'Lead Views',
        items: [
          { id: 'all', label: 'All Leads', icon: VIEW_ICONS.all, href: '/leads' },
          { id: 'my', label: 'My Leads', icon: VIEW_ICONS.my, href: '/leads?view=my' },
          { id: 'starred', label: 'Starred', icon: VIEW_ICONS.starred, href: '/leads?view=starred' },
          { id: 'recent', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/leads?view=recent' },
        ],
      },
      {
        id: 'segments',
        title: 'Segments',
        items: [
          { id: 'new-week', label: 'New This Week', icon: SEGMENT_ICONS.statusDot, color: 'text-success', href: '/leads?segment=new-week' },
          { id: 'hot', label: 'Hot Leads (>80)', icon: SEGMENT_ICONS.statusDot, color: 'text-warning', href: '/leads?segment=hot' },
          { id: 'followup', label: 'Needs Follow-up', icon: SEGMENT_ICONS.statusDot, color: 'text-destructive', href: '/leads?segment=followup' },
        ],
      },
    ],
  };
}

/** Settings mode — settings items inline at top, Lead Views & Segments sections below */
export function createLeadsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'leads',
    moduleTitle: 'Leads',
    moduleIcon: MODULE_ICONS.leads,
    showSettings: false,
    beforeContent,
    sections: [
      {
        id: 'views',
        title: 'Lead Views',
        items: [
          { id: 'all', label: 'All Leads', icon: VIEW_ICONS.all, href: '/leads' },
          { id: 'my', label: 'My Leads', icon: VIEW_ICONS.my, href: '/leads?view=my' },
          { id: 'starred', label: 'Starred', icon: VIEW_ICONS.starred, href: '/leads?view=starred' },
          { id: 'recent', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/leads?view=recent' },
        ],
      },
      {
        id: 'segments',
        title: 'Segments',
        items: [
          { id: 'new-week', label: 'New This Week', icon: SEGMENT_ICONS.statusDot, color: 'text-success', href: '/leads?segment=new-week' },
          { id: 'hot', label: 'Hot Leads (>80)', icon: SEGMENT_ICONS.statusDot, color: 'text-warning', href: '/leads?segment=hot' },
          { id: 'followup', label: 'Needs Follow-up', icon: SEGMENT_ICONS.statusDot, color: 'text-destructive', href: '/leads?segment=followup' },
        ],
      },
    ],
  };
}
