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
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth',
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

function usePublishHeaderHeight(el: HTMLElement | null) {
  // Keyed on the ELEMENT, not run on every render. The first version had no
  // dependency list, so every re-render of the header (a query settling, a
  // route change) ran the cleanup and then the effect again: the variable was
  // removed and re-set within one tick, the sidebars fell back to 4rem and
  // came back, and with `transition-all` on them their top never stopped
  // animating (measured at 65px against a 102px header in production on
  // 03/10). The ResizeObserver already covers every real height change.
  React.useEffect(() => {
    if (!el || typeof document === 'undefined') return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(APP_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    // Three sources, all kept on: ResizeObserver for every height change;
    // a MutationObserver on the header's subtree because the banner mounting
    // or unmounting is a DOM change, and ResizeObserver notifications are
    // delivered in the rendering steps, which a hidden tab skips (measured
    // on 03/10: the banner mounted in a background window and the variable
    // stayed at the pre-banner 65px until the tab was shown); and the window
    // resize and visibilitychange events for the rewrap and the return to
    // the foreground.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    const mutate = new MutationObserver(publish);
    resize?.observe(el);
    mutate.observe(el, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', publish);
    document.addEventListener('visibilitychange', publish);
    return () => {
      resize?.disconnect();
      mutate.disconnect();
      window.removeEventListener('resize', publish);
      document.removeEventListener('visibilitychange', publish);
      root.style.removeProperty(APP_HEADER_HEIGHT_VAR);
    };
  }, [el]);
}

export function Navigation() {
  // A callback ref into state, so the effect above re-runs exactly when the
  // <header> mounts or unmounts (it is not rendered while auth is loading).
  const [headerEl, setHeaderEl] = React.useState<HTMLElement | null>(null);
  usePublishHeaderHeight(headerEl);
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
    <header ref={setHeaderEl} className="sticky top-0 z-50 w-full border-b border-border bg-card">
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
