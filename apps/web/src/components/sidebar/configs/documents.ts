import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

/** Settings items shown when on a document settings page */
export const DOCUMENT_SETTINGS_ITEMS: SidebarItem[] = [
  {
    id: 'document-settings',
    label: 'Document Settings',
    icon: 'tune',
    href: '/documents/document-settings',
  },
  {
    id: 'document-types',
    label: 'Document Types',
    icon: 'category',
    href: '/documents/document-types',
  },
  {
    id: 'storage-policies',
    label: 'Storage Policies',
    icon: 'cloud_sync',
    href: '/documents/storage-policies',
  },
];

const SETTINGS_PATHS = DOCUMENT_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a document settings page */
export function isDocumentSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Document Views',
    items: [
      { id: 'all', label: 'All Documents', icon: VIEW_ICONS.all, href: '/documents' },
      { id: 'my', label: 'My Documents', icon: VIEW_ICONS.my, href: '/documents?view=my' },
      {
        id: 'recent',
        label: 'Recently Added',
        icon: VIEW_ICONS.recent,
        href: '/documents?view=recent',
      },
      {
        id: 'starred',
        label: 'Starred',
        icon: VIEW_ICONS.starred,
        href: '/documents?view=starred',
      },
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
];

/**
 * List mode — views, segments, Module Settings button.
 */
export function createDocumentsSidebarConfig(onSettingsClick?: () => void): SidebarConfig {
  return {
    moduleId: 'documents',
    moduleTitle: 'Documents',
    moduleIcon: MODULE_ICONS.documents,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    sections: VIEW_SECTIONS,
  };
}

/**
 * Settings mode — settings items inline at top, views/segments below.
 */
export function createDocumentsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'documents',
    moduleTitle: 'Documents',
    moduleIcon: MODULE_ICONS.documents,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
