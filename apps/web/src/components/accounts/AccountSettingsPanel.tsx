'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const ACCOUNT_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'account-settings',
    label: 'Account Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/accounts/account-settings',
  },
  {
    id: 'account-tiers',
    label: 'Account Tiers',
    description: 'Tier definitions & criteria',
    icon: 'category',
    href: '/accounts/account-tiers',
  },
  {
    id: 'territory-mapping',
    label: 'Territory Mapping',
    description: 'Geographic & team territories',
    icon: 'map',
    href: '/accounts/territory-mapping',
  },
];

interface AccountSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSettingsPanel({ isOpen, onClose }: Readonly<AccountSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Account Settings"
      items={ACCOUNT_SETTINGS_ITEMS}
    />
  );
}
