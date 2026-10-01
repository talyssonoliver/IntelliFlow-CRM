/**
 * @vitest-environment happy-dom
 *
 * PinnedTenantBanner (ADR-071): shown only for a pinned Portal-grant session, names the client
 * tenant, and "back to my CRM" ends the session.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ListTenantsOutput } from '@/lib/tenant/memberships';

const h = vi.hoisted(() => ({
  listTenants: { data: undefined as unknown, isLoading: false, isError: false },
  logout: vi.fn(),
  isLoggingOut: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: { user: { listTenants: { useQuery: () => h.listTenants } } },
}));
vi.mock('@/hooks/useLogout', () => ({
  useLogout: () => ({ logout: h.logout, isLoggingOut: h.isLoggingOut, error: null }),
}));

import { PinnedTenantBanner } from '../pinned-tenant-banner';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';

const PINNED: ListTenantsOutput = {
  activeTenantId: 'tenant_client',
  homeTenantId: 'tenant_home',
  pinned: true,
  tenants: [
    {
      tenantId: 'tenant_client',
      name: 'Acme Plumbing',
      slug: 'acme',
      role: 'ADMIN',
      source: 'PORTAL_STAFF',
      pinned: true,
      isHome: false,
      isActive: true,
    },
  ],
};

describe('PinnedTenantBanner', () => {
  beforeEach(() => {
    vi.stubEnv(FLAG, '1');
    h.listTenants = { data: PINNED, isLoading: false, isError: false };
    h.logout.mockResolvedValue(undefined);
    h.isLoggingOut = false;
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('names the client tenant and offers the way back', () => {
    render(<PinnedTenantBanner />);

    const banner = screen.getByTestId('pinned-tenant-banner');
    expect(banner.tagName).toBe('OUTPUT');
    expect(screen.getByRole('status')).toBe(banner);
    expect(banner).toHaveTextContent("You are in Acme Plumbing's CRM");
    expect(screen.getByRole('button', { name: 'back to my CRM' })).toBeEnabled();
  });

  it('uses the Portuguese copy when the document language is pt', () => {
    document.documentElement.lang = 'pt-BR';
    render(<PinnedTenantBanner />);

    expect(screen.getByTestId('pinned-tenant-banner')).toHaveTextContent(
      'Você está no CRM de Acme Plumbing'
    );
    expect(screen.getByRole('button', { name: 'voltar ao meu CRM' })).toBeInTheDocument();
  });

  it('ends the pinned session when "back to my CRM" is clicked', async () => {
    render(<PinnedTenantBanner />);

    await userEvent.click(screen.getByRole('button', { name: 'back to my CRM' }));
    expect(h.logout).toHaveBeenCalledTimes(1);
  });

  it('disables the action while the logout is running', () => {
    h.isLoggingOut = true;
    render(<PinnedTenantBanner />);

    expect(screen.getByRole('button', { name: 'back to my CRM' })).toBeDisabled();
  });

  it('renders the tenant name as text, never as markup', () => {
    h.listTenants = {
      data: {
        ...PINNED,
        tenants: [{ ...PINNED.tenants[0], name: '<img src=x onerror=alert(1)>' }],
      },
      isLoading: false,
      isError: false,
    };
    render(<PinnedTenantBanner />);

    expect(screen.getByTestId('pinned-tenant-banner').querySelector('img')).toBeNull();
    expect(screen.getByTestId('pinned-tenant-banner')).toHaveTextContent('<img src=x');
  });

  it('is absent for a normal (non-pinned) session', () => {
    h.listTenants = { data: { ...PINNED, pinned: false }, isLoading: false, isError: false };
    render(<PinnedTenantBanner />);

    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
  });

  it('is absent while loading, on error, and with the web flag off', () => {
    h.listTenants = { data: undefined, isLoading: true, isError: false };
    const first = render(<PinnedTenantBanner />);
    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
    first.unmount();

    h.listTenants = { data: undefined, isLoading: false, isError: true };
    const second = render(<PinnedTenantBanner />);
    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
    second.unmount();

    h.listTenants = { data: PINNED, isLoading: false, isError: false };
    vi.stubEnv(FLAG, '0');
    render(<PinnedTenantBanner />);
    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
  });
});
