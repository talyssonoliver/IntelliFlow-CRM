/**
 * @vitest-environment happy-dom
 *
 * Help Center lives in the account menu, not on the desktop bar. The phone menu keeps it, and
 * the link still follows the plan: no Support module, no link anywhere.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { NavRoute } from '../header/main-nav';

const h = vi.hoisted(() => ({
  enabledRoutes: [] as { label: string; href: string; icon?: string }[],
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/hooks/useEnabledModules', () => ({
  useEnabledModules: () => ({ enabledRoutes: h.enabledRoutes, isLoading: false, isError: false }),
}));
vi.mock('@/components/onboarding/TrialBadge', () => ({ TrialBadge: () => null }));
vi.mock('../header', () => {
  const labels = (routes: NavRoute[]) => routes.map((route) => route.label).join(',');
  return {
    Logo: () => null,
    SearchBar: () => null,
    Notifications: () => null,
    TenantSwitcher: () => null,
    PinnedTenantBanner: () => null,
    MainNav: ({ routes }: { routes: NavRoute[] }) => <p data-testid="bar">{labels(routes)}</p>,
    MobileNav: ({ routes }: { routes: NavRoute[] }) => <p data-testid="phone">{labels(routes)}</p>,
    UserMenu: ({ showHelpCenter }: { showHelpCenter?: boolean }) => (
      <p data-testid="menu">{String(showHelpCenter)}</p>
    ),
  };
});

import { Navigation } from '../navigation';

const tickets = { label: 'Tickets', href: '/tickets' };
const helpCenter = { label: 'Help Center', href: '/help-center' };

describe('Navigation: Help Center placement', () => {
  it('moves it from the desktop bar to the account menu and keeps it on the phone menu', () => {
    h.enabledRoutes = [tickets, helpCenter];
    render(<Navigation />);
    expect(screen.getByTestId('bar').textContent).toBe('Tickets');
    expect(screen.getByTestId('phone').textContent).toBe('Tickets,Help Center');
    expect(screen.getByTestId('menu').textContent).toBe('true');
  });

  it('offers it nowhere when the plan does not include it', () => {
    h.enabledRoutes = [{ label: 'Dashboard', href: '/dashboard' }];
    render(<Navigation />);
    expect(screen.getByTestId('bar').textContent).toBe('Dashboard');
    expect(screen.getByTestId('phone').textContent).toBe('Dashboard');
    expect(screen.getByTestId('menu').textContent).toBe('false');
  });
});
