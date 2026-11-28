import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { CalendarTogglesSection } from '../CalendarTogglesSection';
import type { TenantBusinessType } from '@intelliflow/domain';

/** Settings items shown when on a calendar settings page */
export const CALENDAR_SETTINGS_ITEMS: SidebarItem[] = [
  {
    id: 'calendar-settings',
    label: 'Calendar Settings',
    icon: 'tune',
    href: '/calendar/calendar-settings',
  },
  { id: 'event-types', label: 'Event Types', icon: 'category', href: '/calendar/event-types' },
  {
    id: 'availability',
    label: 'Availability',
    icon: 'event_available',
    href: '/calendar/availability',
  },
];

const SETTINGS_PATHS = CALENDAR_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a calendar settings page */
export function isCalendarSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Calendar Views',
    items: [
      { id: 'all', label: 'All Events', icon: 'calendar_month', href: '/calendar' },
      { id: 'upcoming', label: 'Upcoming', icon: 'schedule', href: '/calendar?view=upcoming' },
      { id: 'today', label: 'Today', icon: 'today', href: '/calendar?view=today' },
      {
        id: 'conflicts',
        label: 'Conflicts',
        icon: 'warning',
        color: 'text-destructive',
        href: '/calendar?view=conflicts',
      },
    ],
  },
];

/**
 * The appointment types the calendar's "By Type" section offers, for the tenant's business type.
 * Owner 26/11: "These types must come from the user/company vertical types, like for Leangency it
 * make no sense at all!" - hearings and depositions are for law firms only.
 */
export function calendarTypeItems(businessType: TenantBusinessType | null): SidebarItem[] {
  const general: SidebarItem[] = [
    { id: 'meetings', label: 'Meetings', icon: 'groups', href: '/calendar?type=MEETING' },
    { id: 'calls', label: 'Calls', icon: 'call', href: '/calendar?type=CALL' },
    {
      id: 'consultations',
      label: 'Consultations',
      icon: 'forum',
      href: '/calendar?type=CONSULTATION',
    },
  ];
  if (businessType !== 'LAW_FIRM') return general;
  return [
    { id: 'hearings', label: 'Hearings', icon: 'gavel', href: '/calendar?type=HEARING' },
    {
      id: 'depositions',
      label: 'Depositions',
      icon: 'description',
      href: '/calendar?type=DEPOSITION',
    },
    ...general,
  ];
}

/** Calendar grid mode — filters inline + Module Settings button + calendar toggles */
export function createCalendarSidebarConfig(
  onSettingsClick: () => void,
  businessType: TenantBusinessType | null = null
): SidebarConfig {
  return {
    moduleId: 'calendar',
    moduleTitle: 'Calendar',
    moduleIcon: 'calendar_month',
    onSettingsClick,
    showSettings: true,
    afterContent: CalendarTogglesSection,
    sections: [
      ...VIEW_SECTIONS,
      { id: 'type', title: 'By Type', items: calendarTypeItems(businessType) },
    ],
  };
}

/** Settings mode — settings items inline at top, views & types below, calendar toggles at bottom */
export function createCalendarSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'calendar',
    moduleTitle: 'Calendar',
    moduleIcon: 'calendar_month',
    showSettings: false,
    beforeContent,
    afterContent: CalendarTogglesSection,
    sections: VIEW_SECTIONS,
  };
}
