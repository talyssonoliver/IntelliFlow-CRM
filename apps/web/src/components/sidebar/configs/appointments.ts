import type { SidebarConfig } from '../sidebar-types';

/** Sidebar configuration for `/appointments` — the appointments table page. */

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Appointment Views',
    items: [
      { id: 'all', label: 'All Appointments', icon: 'event', href: '/appointments' },
      {
        id: 'upcoming',
        label: 'Upcoming',
        icon: 'schedule',
        href: '/appointments?view=upcoming',
      },
      { id: 'today', label: 'Today', icon: 'today', href: '/appointments?view=today' },
      {
        id: 'conflicts',
        label: 'Conflicts',
        icon: 'warning',
        color: 'text-destructive',
        href: '/appointments?view=conflicts',
      },
      {
        id: 'appointment-calendar',
        label: 'Calendar View',
        icon: 'calendar_month',
        href: '/calendar',
      },
    ],
  },
  {
    id: 'type',
    title: 'By Type',
    items: [
      { id: 'meetings', label: 'Meetings', icon: 'videocam', href: '/appointments?type=MEETING' },
      { id: 'calls', label: 'Calls', icon: 'call', href: '/appointments?type=CALL' },
      {
        id: 'consultations',
        label: 'Consultations',
        icon: 'forum',
        href: '/appointments?type=CONSULTATION',
      },
      { id: 'hearings', label: 'Hearings', icon: 'gavel', href: '/appointments?type=HEARING' },
      {
        id: 'depositions',
        label: 'Depositions',
        icon: 'description',
        href: '/appointments?type=DEPOSITION',
      },
    ],
  },
];

/** Sidebar shown on `/appointments` (the table list page). */
export function createAppointmentsSidebarConfig(): SidebarConfig {
  return {
    moduleId: 'appointments',
    moduleTitle: 'Appointments',
    moduleIcon: 'event',
    showSettings: false,
    sections: VIEW_SECTIONS,
  };
}
