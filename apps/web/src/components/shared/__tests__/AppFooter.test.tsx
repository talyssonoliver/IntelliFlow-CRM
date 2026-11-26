/**
 * @vitest-environment jsdom
 *
 * AppFooter — #1224 UI-007: legal links on every signed-in screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let pathname = '/';
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

import { AppFooter, APP_FOOTER_LINKS, showsAppFooter } from '../AppFooter';

describe('AppFooter', () => {
  beforeEach(() => {
    pathname = '/';
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
      '/data-and-ai',
      '/aup',
      '/status',
      '/contact',
    ]);
    expect(APP_FOOTER_LINKS).toHaveLength(8);
    expect(screen.getByRole('contentinfo')).toHaveClass('app-footer');
  });

  it('shows on a public page a signed-in user visits (the site footer is off there)', () => {
    pathname = '/privacy';
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it.each([
    '/dashboard',
    '/leads',
    '/leads/abc',
    '/deals',
    '/tasks',
    '/email',
    '/settings/profile',
  ])('renders nothing on the working page %s (owner 21/11: only the home shows it)', (route) => {
    pathname = route;
    const { container } = render(<AppFooter />);
    expect(container.querySelector('footer')).toBeNull();
  });

  it('decides by the path: the signed-in home and the site pages, nothing else', () => {
    expect(showsAppFooter('/')).toBe(true);
    expect(showsAppFooter('/dashboard')).toBe(false);
    expect(showsAppFooter('/terms')).toBe(true);
    expect(showsAppFooter('/blog/some-post')).toBe(true);
    expect(showsAppFooter('/dashboard/customize')).toBe(false);
    expect(showsAppFooter('/termsx')).toBe(false);
    expect(showsAppFooter(null)).toBe(false);
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
