import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, STATUS_ICONS, FEATURE_ICONS } from '../icon-reference';

/** Settings items shown when on a ticket settings page */
export const TICKET_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'sla-policies', label: 'SLA Policies', icon: 'timer', href: '/tickets/sla-policies' },
  { id: 'ticket-types', label: 'Ticket Types', icon: 'category', href: '/tickets/types' },
  { id: 'automations', label: 'Automations', icon: 'smart_toy', href: '/tickets/automations' },
];

const SETTINGS_PATHS = TICKET_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a ticket settings page */
export function isTicketSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

const MANAGEMENT_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'management',
    title: 'Ticket Management',
    items: [
      { id: 'all', label: 'All Tickets', icon: VIEW_ICONS.all, href: '/tickets' },
      {
        id: 'my',
        label: 'My Assigned',
        icon: FEATURE_ICONS.assigned,
        href: '/tickets?view=my',
      },
      {
        id: 'breached',
        label: 'SLA Breaches',
        icon: STATUS_ICONS.breached,
        color: 'text-destructive',
        href: '/tickets?view=breached',
      },
      {
        id: 'unresolved',
        label: 'Unresolved',
        icon: VIEW_ICONS.pending,
        href: '/tickets?view=unresolved',
      },
      {
        id: 'unassigned',
        label: 'Unassigned',
        icon: FEATURE_ICONS.unassigned,
        href: '/tickets?view=unassigned',
      },
    ],
  },
];

/**
 * List mode — ticket management views, Module Settings button.
 */
export function createTicketsSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'tickets',
    moduleTitle: 'Tickets',
    moduleIcon: MODULE_ICONS.tickets,
    onSettingsClick,
    showSettings: true,
    sections: MANAGEMENT_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, ticket management below.
 */
export function createTicketsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'tickets',
    moduleTitle: 'Tickets',
    moduleIcon: MODULE_ICONS.tickets,
    showSettings: false,
    beforeContent,
    sections: MANAGEMENT_SECTIONS,
  };
}

/** @deprecated Use createTicketsSidebarConfig(onSettingsClick) instead */
export const ticketsSidebarConfig: SidebarConfig = {
  moduleId: 'tickets',
  moduleTitle: 'Tickets',
  moduleIcon: MODULE_ICONS.tickets,
  settingsHref: '/settings/tickets',
  showSettings: true,
  sections: MANAGEMENT_SECTIONS,
};
