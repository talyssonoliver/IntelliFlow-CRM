/**
 * @vitest-environment happy-dom
 *
 * Navigation wiring (ADR-071): the real header mounts the tenant switcher and the pinned-session
 * banner. Everything else in the header is stubbed; the two components under test are real.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  listTenants: { data: undefined as unknown, isLoading: false, isError: false },
  pathname: '/dashboard',
}));

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/hooks/useEnabledModules', () => ({
  useEnabledModules: () => ({ enabledRoutes: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useLogout', () => ({
  useLogout: () => ({ logout: vi.fn(), isLoggingOut: false, error: null }),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: { user: { listTenants: { useQuery: () => h.listTenants } } },
}));
vi.mock('@/components/onboarding/TrialBadge', () => ({ TrialBadge: () => null }));
vi.mock('../header/logo', () => ({ Logo: () => null }));
vi.mock('../header/main-nav', () => ({ MainNav: () => null }));
vi.mock('../header/mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('../header/search-bar', () => ({ SearchBar: () => null }));
vi.mock('../header/notifications', () => ({ Notifications: () => null }));
vi.mock('../header/user-menu', () => ({ UserMenu: () => null }));

import { Navigation, APP_HEADER_HEIGHT_VAR } from '../navigation';

const home = {
  tenantId: 'tenant_home',
  name: 'Leangency',
  slug: 'leangency',
  role: 'ADMIN',
  source: 'HOME',
  pinned: false,
  isHome: true,
  isActive: true,
};
const client = {
  tenantId: 'tenant_client',
  name: 'Acme Plumbing',
  slug: 'acme',
  role: 'MEMBER',
  source: 'PORTAL_MEMBER',
  pinned: false,
  isHome: false,
  isActive: false,
};

function renderNav() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Navigation />
    </QueryClientProvider>
  );
}

describe('Navigation tenant wiring', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED', '1');
    h.pathname = '/dashboard';
  });

  // The header (and so the banner) is mounted by the ROOT layout for every route; the settings and
  // billing layouts only add a sidebar. A pinned staff member must see whose CRM they are in on
  // those routes too, not only on the dashboard.
  it.each(['/settings', '/settings/account', '/billing/settings'])(
    'mounts the pinned banner on %s',
    (pathname) => {
      h.pathname = pathname;
      h.listTenants = {
        data: {
          activeTenantId: 'tenant_client',
          homeTenantId: 'tenant_home',
          pinned: true,
          tenants: [{ ...client, isActive: true, pinned: true, source: 'PORTAL_STAFF' }],
        },
        isLoading: false,
        isError: false,
      };
      renderNav();

      expect(screen.getByTestId('pinned-tenant-banner')).toHaveTextContent('Acme Plumbing');
    }
  );

  it('mounts the switcher for a user with several tenants, and no banner', () => {
    h.listTenants = {
      data: {
        activeTenantId: 'tenant_home',
        homeTenantId: 'tenant_home',
        pinned: false,
        tenants: [home, client],
      },
      isLoading: false,
      isError: false,
    };
    renderNav();

    expect(screen.getByRole('button', { name: /switch workspace: leangency/i })).toBeEnabled();
    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
  });

  it('mounts the banner and a disabled switcher for a pinned session', () => {
    h.listTenants = {
      data: {
        activeTenantId: 'tenant_client',
        homeTenantId: 'tenant_home',
        pinned: true,
        tenants: [{ ...client, isActive: true, pinned: true, source: 'PORTAL_STAFF' }],
      },
      isLoading: false,
      isError: false,
    };
    renderNav();

    expect(screen.getByTestId('pinned-tenant-banner')).toHaveTextContent('Acme Plumbing');
    expect(screen.getByRole('button', { name: /switch workspace: acme plumbing/i })).toBeDisabled();
  });

  it('renders neither for a single-tenant user', () => {
    h.listTenants = {
      data: {
        activeTenantId: 'tenant_home',
        homeTenantId: 'tenant_home',
        pinned: false,
        tenants: [home],
      },
      isLoading: false,
      isError: false,
    };
    renderNav();

    expect(screen.queryByTestId('pinned-tenant-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch workspace/i })).not.toBeInTheDocument();
  });
});

describe('Navigation publishes its rendered height for the fixed sidebars', () => {
  // The settings/billing sidebars are `position: fixed` below the header. With the pinned
  // banner the header is taller than the 4rem they used to assume, and their top sat under it
  // (seen in production on 02/10 as "no banner on settings"). The header now publishes its real
  // height as a CSS variable the sidebars read, so the banner is never covered.
  let offsetHeight: PropertyDescriptor | undefined;
  beforeEach(() => {
    offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return (this as HTMLElement).tagName === 'HEADER' ? 104 : 0;
      },
    });
  });
  afterEach(() => {
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
    document.documentElement.style.removeProperty(APP_HEADER_HEIGHT_VAR);
  });

  it('without ResizeObserver, a banner mounting later still republishes the height', async () => {
    const RO = globalThis.ResizeObserver;
    // Simulate a browser without ResizeObserver.
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
    try {
      h.listTenants = { data: undefined, isLoading: false, isError: false };
      const { rerender } = renderNav();
      expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VAR)).toBe('104px');
      let height = 104;
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
          return (this as HTMLElement).tagName === 'HEADER' ? height : 0;
        },
      });
      height = 142;
      h.listTenants = {
        data: {
          activeTenantId: 'tenant_client',
          homeTenantId: 'tenant_home',
          pinned: true,
          tenants: [{ ...client, isActive: true, pinned: true, source: 'PORTAL_STAFF' }],
        },
        isLoading: false,
        isError: false,
      };
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <Navigation />
        </QueryClientProvider>
      );
      expect(screen.getByTestId('pinned-tenant-banner')).toBeInTheDocument();
      // MutationObserver callbacks are delivered as microtasks.
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VAR)).toBe('142px');
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });

  it('sets --app-header-h on <html> from the header, and clears it on unmount', () => {
    h.listTenants = {
      data: {
        activeTenantId: 'tenant_client',
        homeTenantId: 'tenant_home',
        pinned: true,
        tenants: [{ ...client, isActive: true, pinned: true, source: 'PORTAL_STAFF' }],
      },
      isLoading: false,
      isError: false,
    };
    const { unmount, rerender } = renderNav();
    expect(screen.getByTestId('pinned-tenant-banner')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VAR)).toBe('104px');
    // A re-render must leave the variable in place: the first version cleared
    // and re-set it on every render, which kept the fixed sidebars animating.
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');
    const removeProperty = vi.spyOn(document.documentElement.style, 'removeProperty');
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Navigation />
      </QueryClientProvider>
    );
    expect(removeProperty).not.toHaveBeenCalledWith(APP_HEADER_HEIGHT_VAR);
    expect(setProperty).not.toHaveBeenCalledWith(APP_HEADER_HEIGHT_VAR, expect.anything());
    setProperty.mockRestore();
    removeProperty.mockRestore();
    unmount();
    expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VAR)).toBe('');
  });
});
