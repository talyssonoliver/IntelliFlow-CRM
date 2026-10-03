'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  Logo,
  MainNav,
  MobileNav,
  SearchBar,
  UserMenu,
  Notifications,
  TenantSwitcher,
  PinnedTenantBanner,
  type NavRoute,
} from './header';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { TrialBadge } from '@/components/onboarding/TrialBadge';

const NAV_SKELETON_KEYS = ['nav-0', 'nav-1', 'nav-2', 'nav-3', 'nav-4', 'nav-5'] as const;

// Public routes that should not show the authenticated navigation
// The sign-in screens: no app bar, matching the public layout's
// AUTH_PAGES_NO_CHROME, so AuthBackground can fill the whole screen.
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth',
  '/logout',
  '/mfa',
  '/sso',
];

/**
 * The header's rendered height, published as `--app-header-h` on <html>.
 *
 * The fixed sidebars (AppSidebar, module-settings-nav, complementary-sidebar) sit directly
 * below the header. They used to hard-code `top-16` (4rem), which was only ever true without
 * the ADR-071 pinned-tenant banner: with the banner the header is taller and the top of every
 * sidebar was hidden under it, which read as "the banner is missing on settings". The header
 * is the one element that knows its own height, so it publishes it and the sidebars read it,
 * with 4rem as the fallback for any route that renders no header.
 */
export const APP_HEADER_HEIGHT_VAR = '--app-header-h';

function usePublishHeaderHeight(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof document === 'undefined') return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(APP_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(APP_HEADER_HEIGHT_VAR);
    };
  });
}

export function Navigation() {
  const headerRef = React.useRef<HTMLElement | null>(null);
  usePublishHeaderHeight(headerRef);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname();

  // IFC-210: Dynamic module-based navigation
  // Fail closed: if modules query errors, enabledRoutes defaults to CORE_CRM only
  const { enabledRoutes, isLoading: modulesLoading, isError: modulesError } = useEnabledModules();

  // Map domain NavRouteConfig to header NavRoute (compatible shapes)
  const routes: NavRoute[] = React.useMemo(
    () =>
      enabledRoutes.map((r) => ({
        label: r.label,
        href: r.href,
        icon: r.icon,
      })),
    [enabledRoutes]
  );

  // IFC-007: Don't show authenticated navigation on public routes or when not authenticated
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));

  // Don't render if on public route or not authenticated
  if (isPublicRoute || (!isAuthenticated && !authLoading)) {
    return null;
  }

  // Don't render while checking auth status (prevents header flash)
  if (authLoading) {
    return null;
  }

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full border-b border-border bg-card">
      {/* ADR-071: shown only for a pinned Portal-grant session */}
      <PinnedTenantBanner />
      <div className="flex h-16 items-center px-4 lg:px-6">
        {/* Logo */}
        <div className="mr-8">
          <Logo />
        </div>

        {/* Desktop Navigation */}
        {modulesLoading && !modulesError ? (
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_SKELETON_KEYS.map((key) => (
              <div key={key} className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </nav>
        ) : (
          <MainNav routes={routes} />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="hidden md:flex items-center mr-4">
          <SearchBar className="w-64" />
        </div>

        {/* Trial indicator — only visible when on a trial plan */}
        <TrialBadge className="mr-2 hidden sm:inline-flex" />

        {/* Notifications - count is managed via RemindersContext */}
        <Notifications />

        {/* ADR-071: tenant switcher (hidden with a single tenant, disabled while pinned) */}
        <TenantSwitcher className="ml-2" />

        {/* User Menu */}
        <UserMenu className="ml-2" />

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden ml-4 p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
        </button>
      </div>

      {/* Mobile Navigation */}
      <MobileNav routes={routes} isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
