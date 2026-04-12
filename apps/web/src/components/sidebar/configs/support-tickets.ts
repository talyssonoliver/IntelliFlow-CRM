import type { SidebarConfig } from '../sidebar-types';
import {
  MODULE_ICONS,
  VIEW_ICONS,
  STATUS_ICONS,
  FEATURE_ICONS,
  ACTION_ICONS,
} from '../icon-reference';

export const supportTicketsSidebarConfig: SidebarConfig = {
  moduleId: 'supportTickets',
  moduleTitle: 'Support Tickets',
  moduleIcon: MODULE_ICONS.tickets,
  showSettings: false,
  sections: [
    {
      id: 'management',
      title: 'Management',
      items: [
        { id: 'all', label: 'All Tickets', icon: VIEW_ICONS.all, href: '/support/tickets' },
        {
          id: 'my',
          label: 'My Queue',
          icon: FEATURE_ICONS.assigned,
          href: '/support/tickets?view=my',
        },
        {
          id: 'at-risk',
          label: 'SLA At Risk',
          icon: STATUS_ICONS.atRisk,
          href: '/support/tickets?view=at-risk',
        },
        {
          id: 'breached',
          label: 'SLA Breached',
          icon: STATUS_ICONS.breached,
          color: 'text-destructive',
          href: '/support/tickets?view=breached',
        },
        {
          id: 'unassigned',
          label: 'Unassigned',
          icon: FEATURE_ICONS.unassigned,
          href: '/support/tickets?view=unassigned',
        },
      ],
    },
    {
      id: 'quick-links',
      title: 'Quick Links',
      items: [
        {
          id: 'new-ticket',
          label: 'New Ticket',
          icon: ACTION_ICONS.add,
          href: '/support/tickets/new',
        },
        {
          id: 'help-center',
          label: 'Help Center',
          icon: MODULE_ICONS.helpCenter,
          href: '/help-center',
        },
      ],
    },
  ],
};
