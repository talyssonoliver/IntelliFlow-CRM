import type { SidebarConfig } from '../sidebar-types';

export const appointmentsSidebarConfig: SidebarConfig = {
  moduleId: 'calendar',
  moduleTitle: 'Calendar',
  moduleIcon: 'calendar_month',
  settingsHref: '/settings/appointments',
  showSettings: false,
  sections: [
    {
      id: 'views',
      title: 'Appointment Views',
      items: [
        { id: 'all', label: 'All Appointments', icon: 'calendar_month', href: '/calendar' },
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
    {
      id: 'type',
      title: 'By Type',
      items: [
        { id: 'hearings', label: 'Hearings', icon: 'gavel', href: '/calendar?type=HEARING' },
        {
          id: 'consultations',
          label: 'Consultations',
          icon: 'forum',
          href: '/calendar?type=CONSULTATION',
        },
        {
          id: 'depositions',
          label: 'Depositions',
          icon: 'description',
          href: '/calendar?type=DEPOSITION',
        },
      ],
    },
  ],
};
