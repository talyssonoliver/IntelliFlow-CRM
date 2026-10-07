import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, SEGMENT_ICONS } from '../icon-reference';
import type { TierView } from '@/hooks/useAccountTiers';

/** Settings items shown when on an account settings page */
export const ACCOUNT_SETTINGS_ITEMS: SidebarItem[] = [
  {
    id: 'account-settings',
    label: 'Account Settings',
    icon: 'tune',
    href: '/accounts/account-settings',
  },
  {
    id: 'account-tiers',
    label: 'Account Tiers',
    icon: 'category',
    href: '/accounts/account-tiers',
  },
  {
    id: 'territory-mapping',
    label: 'Territory Mapping',
    icon: 'map',
    href: '/accounts/territory-mapping',
  },
];

const SETTINGS_PATHS = ACCOUNT_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is an account settings page */
export function isAccountSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const ACCOUNT_VIEWS_SECTION: SidebarConfig['sections'][number] = {
  id: 'views',
  title: 'Account Views',
  items: [
    { id: 'all', label: 'All Accounts', icon: VIEW_ICONS.all, href: '/accounts' },
    { id: 'my', label: 'My Accounts', icon: VIEW_ICONS.my, href: '/accounts?view=my' },
    {
      id: 'recent',
      label: 'Recently Viewed',
      icon: VIEW_ICONS.recentViewed,
      href: '/accounts?view=recent',
    },
  ],
};

/** The part of a tier the sidebar needs (see `useAccountTiers`). */
export type SidebarTier = Pick<TierView, 'slug' | 'label'> & {
  colors: Pick<TierView['colors'], 'sidebarText'>;
};

/**
 * Account Views plus the tenant's tiers (PG-196). Tier links filter the list
 * through `/accounts?tier=<slug>`. `tiers` is null while the tenant's tiers
 * load — the section is left out rather than showing default names.
 */
export function buildViewSections(tiers: readonly SidebarTier[] | null): SidebarConfig['sections'] {
  if (!tiers || tiers.length === 0) return [ACCOUNT_VIEWS_SECTION];
  return [
    ACCOUNT_VIEWS_SECTION,
    {
      id: 'tiers',
      title: 'Account Tiers',
      items: tiers.map((tier) => ({
        id: tier.slug,
        label: tier.label,
        icon: SEGMENT_ICONS.statusDot,
        color: tier.colors.sidebarText,
        href: `/accounts?tier=${tier.slug}`,
      })),
    },
  ];
}

/** List mode — filters inline + Module Settings button */
export function createAccountsSidebarConfig(
  onSettingsClick: () => void,
  tiers: readonly SidebarTier[] | null = null
): SidebarConfig {
  return {
    moduleId: 'accounts',
    moduleTitle: 'Accounts',
    moduleIcon: MODULE_ICONS.accounts,
    onSettingsClick,
    showSettings: true,
    sections: buildViewSections(tiers),
  };
}

/** Settings mode — settings items inline at top, Account Views & Tiers sections below */
export function createAccountsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
  tiers: readonly SidebarTier[] | null = null
): SidebarConfig {
  return {
    moduleId: 'accounts',
    moduleTitle: 'Accounts',
    moduleIcon: MODULE_ICONS.accounts,
    showSettings: false,
    beforeContent,
    sections: buildViewSections(tiers),
  };
}
