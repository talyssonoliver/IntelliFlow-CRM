/**
 * PG-196 — the accounts layout feeds the tenant's tiers into the sidebar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

let pathname = '/accounts';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const sidebarConfigs: Array<{ sections: Array<{ id: string; items: Array<{ label: string }> }> }> =
  [];
vi.mock('@/components/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">menu</button>,
  SidebarWithSuspense: ({ config }: { config: (typeof sidebarConfigs)[number] }) => {
    sidebarConfigs.push(config);
    return null;
  },
}));
vi.mock('@/components/accounts/AccountSettingsPanel', () => ({ AccountSettingsPanel: () => null }));
vi.mock('@/components/accounts/AccountSettingsSidebarNav', () => ({
  AccountSettingsSidebarNav: () => null,
}));

let tiersLoaded = true;
vi.mock('@/hooks/useAccountTiers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAccountTiers')>();
  return {
    ...actual,
    useAccountTiers: () =>
      actual.buildAccountTiersResult(
        tiersLoaded
          ? {
              tiers: [
                { key: 'GOLD', label: 'Gold', minRevenue: 1000, colorToken: 'amber', benefits: [] },
                { key: 'BASE', label: 'Base', minRevenue: 0, colorToken: 'slate', benefits: [] },
              ],
              defaultTierKey: null,
              canManage: false,
            }
          : undefined,
        { isLoading: !tiersLoaded, isError: false }
      ),
  };
});

import AccountsListLayout from '../layout';

const lastTierLabels = () =>
  sidebarConfigs
    .at(-1)
    ?.sections.find((s) => s.id === 'tiers')
    ?.items.map((i) => i.label);

describe('AccountsListLayout sidebar tiers (PG-196)', () => {
  beforeEach(() => {
    sidebarConfigs.length = 0;
    tiersLoaded = true;
    pathname = '/accounts';
  });

  it('shows the tenant tiers in the list sidebar', () => {
    render(<AccountsListLayout>content</AccountsListLayout>);
    expect(lastTierLabels()).toEqual(['Gold', 'Base']);
  });

  it('shows the tenant tiers in the settings sidebar too', () => {
    pathname = '/accounts/account-tiers';
    render(<AccountsListLayout>content</AccountsListLayout>);
    expect(lastTierLabels()).toEqual(['Gold', 'Base']);
  });

  it('leaves the tier section out until the tiers load', () => {
    tiersLoaded = false;
    render(<AccountsListLayout>content</AccountsListLayout>);
    expect(lastTierLabels()).toBeUndefined();
  });
});
