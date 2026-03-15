'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const EMAIL_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'email-settings',
    label: 'Email Settings',
    description: 'Defaults, sync & display',
    icon: 'tune',
    href: '/email/email-settings',
  },
  {
    id: 'signatures',
    label: 'Signatures',
    description: 'Email signature management',
    icon: 'draw',
    href: '/email/signatures',
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Reusable email templates',
    icon: 'draft',
    href: '/email/templates',
  },
];

interface EmailSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmailSettingsPanel({ isOpen, onClose }: Readonly<EmailSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Email Settings"
      items={EMAIL_SETTINGS_ITEMS}
    />
  );
}
