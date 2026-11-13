/**
 * @vitest-environment jsdom
 *
 * AppFooter — #1224 UI-007: legal links on every signed-in screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let pathname = '/dashboard';
let auth = { isAuthenticated: true, isLoading: false };

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ ...auth, user: null }),
}));
vi.mock('@/hooks/useEnabledModules', () => ({
  useEnabledModules: () => ({ enabledRoutes: [], isLoading: false, isError: false }),
}));

import { AppFooter, APP_FOOTER_LINKS } from '../AppFooter';

describe('AppFooter', () => {
  beforeEach(() => {
    pathname = '/dashboard';
    auth = { isAuthenticated: true, isLoading: false };
  });

  it('links every legal page plus Status and Contact for a signed-in user', () => {
    render(<AppFooter />);
    const nav = screen.getByRole('navigation', { name: 'Legal and support' });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/privacy',
      '/terms',
      '/cookies',
      '/dpa',
      '/aup',
      '/status',
      '/contact',
    ]);
    expect(APP_FOOTER_LINKS).toHaveLength(7);
    expect(screen.getByRole('contentinfo')).toHaveClass('app-footer');
  });

  it('shows on a public page a signed-in user visits (the site footer is off there)', () => {
    pathname = '/privacy';
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it.each(['/login', '/logout', '/mfa/verify', '/book/abc', '/dsar/request'])(
    'renders nothing on %s, like the signed-in header',
    (route) => {
      pathname = route;
      const { container } = render(<AppFooter />);
      expect(container.querySelector('footer')).toBeNull();
    }
  );

  it('renders nothing for a visitor or while auth is loading', () => {
    auth = { isAuthenticated: false, isLoading: false };
    const visitor = render(<AppFooter />);
    expect(visitor.container.querySelector('footer')).toBeNull();
    visitor.unmount();

    auth = { isAuthenticated: false, isLoading: true };
    const loading = render(<AppFooter />);
    expect(loading.container.querySelector('footer')).toBeNull();
  });
});
