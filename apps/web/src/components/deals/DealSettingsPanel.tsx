'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const DEAL_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'deal-settings',
    label: 'Deal Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/deals/deal-settings',
  },
  {
    id: 'deal-stages',
    label: 'Deal Stages',
    description: 'Pipeline stage customization',
    icon: 'view_kanban',
    href: '/deals/deal-stages',
  },
  {
    id: 'deal-automation',
    label: 'Deal Automation',
    description: 'Progression & notification rules',
    icon: 'smart_toy',
    href: '/deals/deal-automation',
  },
];

interface DealSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DealSettingsPanel({ isOpen, onClose }: Readonly<DealSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Deal Settings"
      items={DEAL_SETTINGS_ITEMS}
    />
  );
}
