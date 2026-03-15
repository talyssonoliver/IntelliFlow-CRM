'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const CALENDAR_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'calendar-settings',
    label: 'Calendar Settings',
    description: 'Defaults, time zones & display',
    icon: 'tune',
    href: '/calendar/calendar-settings',
  },
  {
    id: 'event-types',
    label: 'Event Types',
    description: 'Categories & color coding',
    icon: 'category',
    href: '/calendar/event-types',
  },
  {
    id: 'availability',
    label: 'Availability',
    description: 'Working hours & booking rules',
    icon: 'event_available',
    href: '/calendar/availability',
  },
];

interface CalendarSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarSettingsPanel({ isOpen, onClose }: Readonly<CalendarSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Calendar Settings"
      items={CALENDAR_SETTINGS_ITEMS}
    />
  );
}
