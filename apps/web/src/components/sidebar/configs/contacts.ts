import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

/** Settings items shown when on a contact settings page */
export const CONTACT_SETTINGS_ITEMS: SidebarItem[] = [
  {
    id: 'contact-settings',
    label: 'Contact Settings',
    icon: 'tune',
    href: '/contacts/contact-settings',
  },
  {
    id: 'contact-types',
    label: 'Contact Types',
    icon: 'category',
    href: '/contacts/contact-types',
  },
  {
    id: 'import-export',
    label: 'Import / Export',
    icon: 'swap_horiz',
    href: '/contacts/import-export',
  },
];

const SETTINGS_PATHS = CONTACT_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a contact settings page */
export function isContactSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Contact Views',
    items: [
      { id: 'all', label: 'All Contacts', icon: VIEW_ICONS.all, href: '/contacts' },
      { id: 'my', label: 'My Contacts', icon: VIEW_ICONS.my, href: '/contacts?view=my' },
      {
        id: 'recent-added',
        label: 'Recently Added',
        icon: VIEW_ICONS.recent,
        href: '/contacts?view=recent-added',
      },
      {
        id: 'recent-viewed',
        label: 'Recently Viewed',
        icon: VIEW_ICONS.recentViewed,
        href: '/contacts?view=recent-viewed',
      },
    ],
  },
  {
    id: 'segments',
    title: 'Segments',
    items: [
      {
        id: 'vip',
        label: 'VIP Clients',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-chart-2',
        href: '/contacts?segment=vip',
      },
      {
        id: 'partners',
        label: 'Partners',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-info',
        href: '/contacts?segment=partners',
      },
      {
        id: 'vendors',
        label: 'Vendors',
        icon: SEGMENT_ICONS.statusDot,
        color: 'text-warning',
        href: '/contacts?segment=vendors',
      },
    ],
  },
];

/** List mode — filters inline + Module Settings button */
export function createContactsSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'contacts',
    moduleTitle: 'Contacts',
    moduleIcon: MODULE_ICONS.contacts,
    onSettingsClick,
    showSettings: true,
    sections: VIEW_SECTIONS,
  };
}

/** Settings mode — settings items inline at top, Contact Views & Segments sections below */
export function createContactsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'contacts',
    moduleTitle: 'Contacts',
    moduleIcon: MODULE_ICONS.contacts,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
