import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';

/** Settings items shown when on an account settings page */
export const ACCOUNT_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'account-settings', label: 'Account Settings', icon: 'tune', href: '/accounts/account-settings' },
  { id: 'account-tiers', label: 'Account Tiers', icon: 'category', href: '/accounts/account-tiers' },
  { id: 'territory-mapping', label: 'Territory Mapping', icon: 'map', href: '/accounts/territory-mapping' },
];

const SETTINGS_PATHS = ACCOUNT_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is an account settings page */
export function isAccountSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Account Views',
    items: [
      { id: 'all', label: 'All Accounts', icon: VIEW_ICONS.all, href: '/accounts' },
      { id: 'my', label: 'My Accounts', icon: VIEW_ICONS.my, href: '/accounts?view=my' },
      { id: 'recent', label: 'Recently Viewed', icon: VIEW_ICONS.recentViewed, href: '/accounts?view=recent' },
    ],
  },
  {
    id: 'tiers',
    title: 'Account Tiers',
    items: [
      { id: 'enterprise', label: 'Enterprise', icon: SEGMENT_ICONS.statusDot, color: 'text-purple-500', href: '/accounts?tier=enterprise' },
      { id: 'mid-market', label: 'Mid-Market', icon: SEGMENT_ICONS.statusDot, color: 'text-blue-500', href: '/accounts?tier=mid-market' },
      { id: 'smb', label: 'SMB', icon: SEGMENT_ICONS.statusDot, color: 'text-green-500', href: '/accounts?tier=smb' },
      { id: 'startup', label: 'Startup', icon: SEGMENT_ICONS.statusDot, color: 'text-yellow-500', href: '/accounts?tier=startup' },
    ],
  },
];

/** List mode — filters inline + Module Settings button */
export function createAccountsSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'accounts',
    moduleTitle: 'Accounts',
    moduleIcon: MODULE_ICONS.accounts,
    onSettingsClick,
    showSettings: true,
    sections: VIEW_SECTIONS,
  };
}

/** Settings mode — settings items inline at top, Account Views & Tiers sections below */
export function createAccountsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  return {
    moduleId: 'accounts',
    moduleTitle: 'Accounts',
    moduleIcon: MODULE_ICONS.accounts,
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}
