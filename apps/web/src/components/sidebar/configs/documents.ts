import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

export const documentsSidebarConfig: SidebarConfig = {
  moduleId: 'documents',
  moduleTitle: 'Documents',
  moduleIcon: MODULE_ICONS.documents,
  settingsHref: '/settings/documents',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Document Views',
      items: [
        { id: 'all', label: 'All Documents', icon: VIEW_ICONS.all, href: '/documents' },
        { id: 'my', label: 'My Documents', icon: VIEW_ICONS.my, href: '/documents?view=my' },
        { id: 'recent', label: 'Recently Added', icon: VIEW_ICONS.recent, href: '/documents?view=recent' },
        { id: 'starred', label: 'Starred', icon: VIEW_ICONS.starred, href: '/documents?view=starred' },
      ],
    },
    {
      id: 'segments',
      title: 'Segments',
      items: [
        {
          id: 'pending-signature',
          label: 'Pending Signature',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-warning',
          href: '/documents?segment=pending-signature',
        },
        {
          id: 'legal-hold',
          label: 'Legal Hold',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-destructive',
          href: '/documents?segment=legal-hold',
        },
        {
          id: 'contracts',
          label: 'Contracts',
          icon: SEGMENT_ICONS.statusDot,
          color: 'text-primary',
          href: '/documents?segment=contracts',
        },
      ],
    },
  ],
};
