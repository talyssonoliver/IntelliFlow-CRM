'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const REPORT_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'report-settings',
    label: 'Report Settings',
    description: 'Defaults, filters & permissions',
    icon: 'tune',
    href: '/analytics/report-settings',
  },
  {
    id: 'report-templates',
    label: 'Report Templates',
    description: 'Custom layout & formatting',
    icon: 'dashboard_customize',
    href: '/analytics/report-templates',
  },
  {
    id: 'scheduled-reports',
    label: 'Scheduled Reports',
    description: 'Automated delivery & cadence',
    icon: 'schedule_send',
    href: '/analytics/scheduled-reports',
  },
];

interface AnalyticsSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AnalyticsSettingsPanel({ isOpen, onClose }: Readonly<AnalyticsSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Report Settings"
      items={REPORT_SETTINGS_ITEMS}
    />
  );
}
