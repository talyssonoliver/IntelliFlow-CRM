import { describe, it, expect, vi } from 'vitest';
import {
  buildViewSections,
  createAccountsSettingsSidebarConfig,
  createAccountsSidebarConfig,
  isAccountSettingsPage,
  type SidebarTier,
} from '../configs/accounts';

const tiers: SidebarTier[] = [
  { slug: 'enterprise', label: 'Enterprise', colors: { sidebarText: 'text-purple-500' } },
  { slug: 'mid-market', label: 'Mid-Market', colors: { sidebarText: 'text-blue-500' } },
  { slug: 'key-accounts', label: 'Key Accounts', colors: { sidebarText: 'text-rose-500' } },
];

describe('accounts sidebar config (PG-196)', () => {
  it('builds the tier section from the tenant tiers in the given order', () => {
    const sections = buildViewSections(tiers);
    expect(sections.map((s) => s.id)).toEqual(['views', 'tiers']);
    expect(sections[1].items).toEqual([
      expect.objectContaining({
        id: 'enterprise',
        label: 'Enterprise',
        color: 'text-purple-500',
        href: '/accounts?tier=enterprise',
      }),
      expect.objectContaining({ id: 'mid-market', href: '/accounts?tier=mid-market' }),
      expect.objectContaining({
        id: 'key-accounts',
        label: 'Key Accounts',
        color: 'text-rose-500',
      }),
    ]);
  });

  it('keeps the legacy default slugs for the built-in tiers', () => {
    const hrefs = buildViewSections(tiers)[1].items.map((i) => i.href);
    expect(hrefs).toContain('/accounts?tier=enterprise');
    expect(hrefs).toContain('/accounts?tier=mid-market');
  });

  it('leaves the tier section out until the tiers have loaded', () => {
    expect(buildViewSections(null).map((s) => s.id)).toEqual(['views']);
    expect(buildViewSections([]).map((s) => s.id)).toEqual(['views']);
  });

  it('passes tiers through both sidebar modes', () => {
    const onSettings = vi.fn();
    const list = createAccountsSidebarConfig(onSettings, tiers);
    expect(list.sections.map((s) => s.id)).toEqual(['views', 'tiers']);
    expect(list.showSettings).toBe(true);

    const settings = createAccountsSettingsSidebarConfig(() => null, tiers);
    expect(settings.sections.map((s) => s.id)).toEqual(['views', 'tiers']);
    expect(settings.showSettings).toBe(false);

    expect(createAccountsSidebarConfig(onSettings).sections.map((s) => s.id)).toEqual(['views']);
  });

  it('still recognises the Account Tiers settings page', () => {
    expect(isAccountSettingsPage('/accounts/account-tiers')).toBe(true);
    expect(isAccountSettingsPage('/accounts')).toBe(false);
  });
});
