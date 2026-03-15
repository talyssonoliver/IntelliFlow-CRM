'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const CONTACT_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'contact-settings',
    label: 'Contact Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/contacts/contact-settings',
  },
  {
    id: 'contact-types',
    label: 'Contact Types',
    description: 'Categories & classifications',
    icon: 'category',
    href: '/contacts/contact-types',
  },
  {
    id: 'import-export',
    label: 'Import / Export',
    description: 'Bulk data import & export',
    icon: 'swap_horiz',
    href: '/contacts/import-export',
  },
];

interface ContactSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactSettingsPanel({ isOpen, onClose }: Readonly<ContactSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Settings"
      items={CONTACT_SETTINGS_ITEMS}
    />
  );
}
