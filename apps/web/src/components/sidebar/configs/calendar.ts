import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { CalendarTogglesSection } from '../CalendarTogglesSection';

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

/** Minimal shape of a tenant event type needed to build the "By Type" list. */
export interface CalendarTypeSource {
  id: string;
  name: string;
  appointmentType: string;
}

function humanizeType(value: string): string {
  const lower = value.toLowerCase().replaceAll('_', ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * "By Type" items come from the tenant's own configured event types, never a fixed
 * vertical list. Event types that share an appointment type collapse into one entry
 * (the filter works on appointment type); a lone event type keeps its own name.
 */
export function buildCalendarTypeItems(eventTypes: readonly CalendarTypeSource[]): SidebarItem[] {
  const byType = new Map<string, CalendarTypeSource[]>();
  for (const et of eventTypes) {
    byType.set(et.appointmentType, [...(byType.get(et.appointmentType) ?? []), et]);
  }
  return [...byType.entries()].map(([type, group]) => ({
    id: `type-${type.toLowerCase()}`,
    label: group.length === 1 ? group[0].name : humanizeType(type),
    icon: 'category',
    href: `/calendar?type=${encodeURIComponent(type)}`,
  }));
}

function buildViewSections(typeItems: SidebarItem[]): SidebarConfig['sections'] {
  const views: SidebarConfig['sections'][number] = {
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
  };
  if (typeItems.length === 0) return [views];
  return [views, { id: 'type', title: 'By Type', items: typeItems }];
}

/** Calendar grid mode — filters inline + Module Settings button + calendar toggles */
export function createCalendarSidebarConfig(
  onSettingsClick: () => void,
  typeItems: SidebarItem[] = []
): SidebarConfig {
  return {
    moduleId: 'calendar',
    moduleTitle: 'Calendar',
    moduleIcon: 'calendar_month',
    onSettingsClick,
    showSettings: true,
    afterContent: CalendarTogglesSection,
    sections: buildViewSections(typeItems),
  };
}

/** Settings mode — settings items inline at top, views & types below, calendar toggles at bottom */
export function createCalendarSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
  typeItems: SidebarItem[] = []
): SidebarConfig {
  return {
    moduleId: 'calendar',
    moduleTitle: 'Calendar',
    moduleIcon: 'calendar_month',
    showSettings: false,
    beforeContent,
    afterContent: CalendarTogglesSection,
    sections: buildViewSections(typeItems),
  };
}
