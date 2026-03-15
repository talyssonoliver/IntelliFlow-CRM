'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const NOTIFICATION_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'notification-settings',
    label: 'Notification Settings',
    description: 'Preferences & per-type channel matrix',
    icon: 'tune',
    href: '/notifications/settings',
  },
  {
    id: 'channels',
    label: 'Channels',
    description: 'Email, push, SMS & webhook toggles',
    icon: 'devices',
    href: '/notifications/channels',
  },
  {
    id: 'quiet-hours',
    label: 'Quiet Hours',
    description: 'Schedule & day-of-week rules',
    icon: 'do_not_disturb_on',
    href: '/notifications/quiet-hours',
  },
];

interface NotificationSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationSettingsPanel({ isOpen, onClose }: Readonly<NotificationSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Notification Settings"
      items={NOTIFICATION_SETTINGS_ITEMS}
    />
  );
}
