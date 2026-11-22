'use client';

/**
 * AppFooter — the slim footer of the signed-in shell (#1224, UI-007).
 *
 * `(public)/layout.tsx` leaves the Aurora site footer out for signed-in users
 * on purpose (it is decided on the server, so the header never flashes), which
 * left no signed-in screen linking to the legal pages. This footer closes that
 * gap: it is rendered by the root layout and shows on the signed-in home (`/`) and
 * the site pages, when the signed-in header (`Navigation`) shows.
 *
 * On desktop the module sidebar is fixed to the left edge, so the footer pads
 * itself by the sidebar's width (see `.app-footer` in globals.css).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { PUBLIC_ROUTES } from '@/components/navigation';

export const APP_FOOTER_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/dpa', label: 'DPA' },
  { href: '/aup', label: 'Acceptable use' },
  { href: '/status', label: 'Status' },
  { href: '/contact', label: 'Contact' },
];

/**
 * The signed-in home: `/` (served by `(public)/signed-in-home`, the browser keeps `/`). Owner
 * 21/11: the footer belongs there, not on the Dashboard.
 */
export const APP_HOME_PATH = '/';

/** Site pages under `(public)` that a signed-in user can open; the site footer is off there. */
export const SITE_PAGE_PREFIXES: readonly string[] = [
  '/about',
  '/aup',
  '/blog',
  '/careers',
  '/contact',
  '/cookies',
  '/dpa',
  '/features',
  '/partners',
  '/press',
  '/pricing',
  '/privacy',
  '/security',
  '/status',
  '/terms',
];

/** The signed-in home and the site pages show the footer; the app's working pages do not. */
export function showsAppFooter(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === APP_HOME_PATH) return true;
  return SITE_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppFooter() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // Same rule as Navigation: no signed-in chrome on auth-flow pages, while auth
  // is loading (prevents a flash) or for a visitor.
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));
  if (isPublicRoute || isLoading || !isAuthenticated) return null;
  // Owner 21/11: not under every working page (Leads, Deals, Tasks...), where it read as clutter.
  // It shows on the signed-in home (`/`) and on the site pages a signed-in user opens
  // (privacy, terms, status...), where the site footer is off and this one stands in for it.
  // The marketing landing page keeps its own site footer; this is not it.
  if (!showsAppFooter(pathname)) return null;

  return (
    <footer className="app-footer border-t border-border bg-card text-xs text-muted-foreground">
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <nav aria-label="Legal and support">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {APP_FOOTER_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="hover:text-foreground hover:underline focus-visible:text-foreground"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>© {new Date().getFullYear()} Aurora</p>
      </div>
    </footer>
  );
}
