import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, STATUS_ICONS, FEATURE_ICONS } from '../icon-reference';

export const ticketsSidebarConfig: SidebarConfig = {
  moduleId: 'tickets',
  moduleTitle: 'Tickets',
  moduleIcon: MODULE_ICONS.tickets,
  settingsHref: '/settings/tickets',
  showSettings: true,
  sections: [
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
    {
      id: 'configuration',
      title: 'Configuration',
      items: [
        {
          id: 'sla-policies',
          label: 'SLA Policies',
          icon: FEATURE_ICONS.slaPolicy,
          href: '/tickets/sla-policies',
        },
        {
          id: 'types',
          label: 'Ticket Types',
          icon: FEATURE_ICONS.ticketType,
          href: '/tickets/types',
        },
        {
          id: 'automations',
          label: 'Automations',
          icon: FEATURE_ICONS.automation,
          href: '/tickets/automations',
        },
      ],
    },
  ],
};
