'use client';

import { FEATURE_ICONS } from '@/components/sidebar';
import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const LEAD_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'lead-settings',
    label: 'Lead Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/leads/lead-settings',
  },
  {
    id: 'pipeline',
    label: 'Pipeline Stages',
    description: 'Stage customization & flow',
    icon: FEATURE_ICONS.pipeline,
    href: '/leads/pipeline',
  },
  {
    id: 'routing',
    label: 'Lead Routing',
    description: 'Assignment & distribution rules',
    icon: 'route',
    href: '/leads/routing',
  },
];

interface LeadSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LeadSettingsPanel({ isOpen, onClose }: Readonly<LeadSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Lead Settings"
      items={LEAD_SETTINGS_ITEMS}
    />
  );
}
