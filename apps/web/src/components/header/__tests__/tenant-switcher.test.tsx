/**
 * @vitest-environment happy-dom
 *
 * TenantSwitcher (ADR-071 phase 2): lists user.listTenants, switches by changing the persisted
 * selection, drops cached queries and reloads; hidden with one tenant; disabled while pinned.
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListTenantsOutput, TenantListEntry } from '@/lib/tenant/memberships';
import {
  ACTIVE_TENANT_STORAGE_KEY,
  getActiveTenantId,
  setActiveTenantId,
} from '@/lib/tenant/active-tenant';

const h = vi.hoisted(() => ({
  listTenants: { data: undefined as unknown, isLoading: false, isError: false },
  useQuery: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: {
      listTenants: {
        useQuery: (input: unknown, options: unknown) => h.useQuery(input, options),
      },
    },
  },
}));

import { TenantSwitcher } from '../tenant-switcher';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';

function entry(overrides: Partial<TenantListEntry> & { tenantId: string }): TenantListEntry {
  return {
    name: overrides.tenantId,
    slug: overrides.tenantId,
    role: 'ADMIN',
    source: 'HOME',
    pinned: false,
    isHome: false,
    isActive: false,
    ...overrides,
  };
}

const HOME = entry({ tenantId: 'tenant_home', name: 'Leangency', isHome: true, isActive: true });
const CLIENT = entry({
  tenantId: 'tenant_client',
  name: 'Acme Plumbing',
  role: 'MEMBER',
  source: 'PORTAL_MEMBER',
});

function listing(tenants: TenantListEntry[], pinned = false): ListTenantsOutput {
  const active = tenants.find((t) => t.isActive) ?? tenants[0];
  return {
    activeTenantId: active.tenantId,
    homeTenantId: 'tenant_home',
    pinned,
    tenants,
  };
}

function renderSwitcher() {
  const queryClient = new QueryClient();
  const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue(undefined);
  const clear = vi.spyOn(queryClient, 'clear');
  render(
    <QueryClientProvider client={queryClient}>
      <TenantSwitcher />
    </QueryClientProvider>
  );
  return { cancelQueries, clear };
}

describe('TenantSwitcher', () => {
  const assign = vi.fn();
  const reload = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'intelliflow_active_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    vi.stubEnv(FLAG, '1');
    h.listTenants = { data: listing([HOME, CLIENT]), isLoading: false, isError: false };
    h.useQuery.mockImplementation(() => h.listTenants);
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '', pathname: '/deals', protocol: 'http:', assign, reload },
    });
  });

  describe('visibility', () => {
    it('lists the memberships and marks the active one', async () => {
      renderSwitcher();

      const trigger = screen.getByRole('button', { name: /switch workspace: leangency/i });
      expect(trigger).toBeEnabled();
      await userEvent.click(trigger);

      const items = screen.getAllByRole('menuitemradio');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveAttribute('aria-checked', 'true');
      expect(items[0]).toHaveTextContent('Leangency');
      expect(items[1]).toHaveAttribute('aria-checked', 'false');
      expect(items[1]).toHaveTextContent('Acme Plumbing');
      expect(items[1]).toHaveTextContent('MEMBER');
    });

    it('is hidden when the user has a single tenant', () => {
      h.listTenants = { data: listing([HOME]), isLoading: false, isError: false };
      renderSwitcher();

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('is hidden while loading, on error, and while the web flag is off', () => {
      h.listTenants = { data: undefined, isLoading: true, isError: false };
      const { unmount } = render(
        <QueryClientProvider client={new QueryClient()}>
          <TenantSwitcher />
        </QueryClientProvider>
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      unmount();

      h.listTenants = { data: undefined, isLoading: false, isError: true };
      const second = render(
        <QueryClientProvider client={new QueryClient()}>
          <TenantSwitcher />
        </QueryClientProvider>
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      second.unmount();

      h.listTenants = { data: listing([HOME, CLIENT]), isLoading: false, isError: false };
      vi.stubEnv(FLAG, '0');
      renderSwitcher();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not request the list while the web flag is off', () => {
      vi.stubEnv(FLAG, '0');
      renderSwitcher();

      expect(h.useQuery).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ enabled: false })
      );
    });

    it('closes on Escape', async () => {
      renderSwitcher();
      await userEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('switching', () => {
    it('stores the chosen tenant, drops cached queries and reloads into the dashboard', async () => {
      const { cancelQueries, clear } = renderSwitcher();

      await userEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: /acme plumbing/i }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
      expect(getActiveTenantId()).toBe('tenant_client');
      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client');
      expect(cancelQueries).toHaveBeenCalled();
      expect(clear).toHaveBeenCalled();
    });

    it('switching back to the home tenant stores nothing (home is the default)', async () => {
      setActiveTenantId('tenant_client');
      h.listTenants = {
        data: listing([
          { ...HOME, isActive: false },
          { ...CLIENT, isActive: true },
        ]),
        isLoading: false,
        isError: false,
      };
      renderSwitcher();

      await userEvent.click(screen.getByRole('button', { name: /switch workspace: acme/i }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: /leangency/i }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
      expect(getActiveTenantId()).toBeNull();
      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
    });

    it('choosing the tenant already active changes nothing and does not reload', async () => {
      const { clear } = renderSwitcher();

      await userEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: /leangency/i }));

      expect(assign).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(getActiveTenantId()).toBeNull();
    });

    it('reloads when another tab changes the selection, and ignores unrelated keys', async () => {
      renderSwitcher();

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'something_else' }));
      });
      expect(reload).not.toHaveBeenCalled();

      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: ACTIVE_TENANT_STORAGE_KEY, newValue: 'tenant_client' })
        );
      });
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('pinned session', () => {
    beforeEach(() => {
      h.listTenants = {
        data: listing(
          [
            entry({
              tenantId: 'tenant_client',
              name: 'Acme Plumbing',
              source: 'PORTAL_STAFF',
              pinned: true,
              isActive: true,
            }),
          ],
          true
        ),
        isLoading: false,
        isError: false,
      };
    });

    it('shows the tenant but the switcher is disabled and opens nothing', () => {
      renderSwitcher();

      const trigger = screen.getByRole('button', { name: /switch workspace: acme plumbing/i });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('title', expect.stringMatching(/disabled in this session/i));

      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(assign).not.toHaveBeenCalled();
    });

    it('never rewrites the selection', () => {
      setActiveTenantId('tenant_client');
      renderSwitcher();

      fireEvent.click(screen.getByRole('button'));
      expect(getActiveTenantId()).toBe('tenant_client');
    });
  });
});
