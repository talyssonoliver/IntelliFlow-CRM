'use client';

/**
 * AppFooter — the slim footer of the signed-in shell (#1224, UI-007).
 *
 * `(public)/layout.tsx` leaves the Aurora site footer out for signed-in users
 * on purpose (it is decided on the server, so the header never flashes), which
 * left no signed-in screen linking to the legal pages. This footer closes that
 * gap: it is rendered by the root layout and shows exactly when the signed-in
 * header (`Navigation`) shows.
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

export function AppFooter() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // Same rule as Navigation: no signed-in chrome on auth-flow pages, while auth
  // is loading (prevents a flash) or for a visitor.
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));
  if (isPublicRoute || isLoading || !isAuthenticated) return null;

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
