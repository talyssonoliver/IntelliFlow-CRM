import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, SEGMENT_ICONS, FEATURE_ICONS } from '../icon-reference';

/** Settings items shown when on a report settings page */
export const REPORT_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'report-settings', label: 'Report Settings', icon: 'tune', href: '/analytics/report-settings' },
  { id: 'report-templates', label: 'Report Templates', icon: 'dashboard_customize', href: '/analytics/report-templates' },
  { id: 'scheduled-reports', label: 'Scheduled Reports', icon: 'schedule_send', href: '/analytics/scheduled-reports' },
];

const SETTINGS_PATHS = REPORT_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a report settings page */
export function isReportSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Report Views',
    items: [
      { id: 'overview', label: 'Overview', icon: MODULE_ICONS.dashboard, href: '/analytics' },
      {
        id: 'sales',
        label: 'Sales Reports',
        icon: FEATURE_ICONS.chart,
        href: '/analytics?view=sales',
      },
      {
        id: 'pipeline',
        label: 'Pipeline Analysis',
        icon: FEATURE_ICONS.pipeline,
        href: '/analytics?view=pipeline',
      },
      {
        id: 'forecasts',
        label: 'Forecasts',
        icon: FEATURE_ICONS.forecast,
        href: '/analytics?view=forecasts',
      },
      {
        id: 'feedback',
        label: 'Feedback Analytics',
        icon: FEATURE_ICONS.chart,
        href: '/analytics/feedback',
      },
    ],
  },
  {
    id: 'saved',
    title: 'Saved Reports',
    items: [
      {
        id: 'weekly',
        label: 'Weekly Summary',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-primary',
        href: '/analytics/saved/weekly',
      },
      {
        id: 'monthly',
        label: 'Monthly Revenue',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-success',
        href: '/analytics/saved/monthly',
      },
      {
        id: 'quarterly',
        label: 'Q4 Performance',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-warning',
        href: '/analytics/saved/quarterly',
      },
    ],
  },
];

/**
 * List mode — views, saved reports, Module Settings button.
 */
export function createAnalyticsSidebarConfig(
  onSettingsClick?: () => void,
): SidebarConfig {
  return {
    moduleId: 'analytics',
    moduleTitle: 'Analytics',
    moduleIcon: MODULE_ICONS.analytics,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    sections: VIEW_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, views/saved below.
 */
export function createAnalyticsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'analytics',
    moduleTitle: 'Analytics',
    moduleIcon: MODULE_ICONS.analytics,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
