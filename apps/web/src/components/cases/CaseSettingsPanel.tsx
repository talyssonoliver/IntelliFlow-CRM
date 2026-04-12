'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const CASE_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'case-settings',
    label: 'Case Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/cases/case-settings',
  },
  {
    id: 'case-types',
    label: 'Case Types',
    description: 'Categories & SLA assignments',
    icon: 'category',
    href: '/cases/case-types',
  },
  {
    id: 'case-workflows',
    label: 'Case Workflows',
    description: 'Escalation & resolution flows',
    icon: 'account_tree',
    href: '/cases/case-workflows',
  },
];

interface CaseSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CaseSettingsPanel({ isOpen, onClose }: Readonly<CaseSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Case Settings"
      items={CASE_SETTINGS_ITEMS}
    />
  );
}
