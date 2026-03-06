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
  type NavRoute,
} from './header';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEnabledModules } from '@/hooks/useEnabledModules';

// Public routes that should not show the authenticated navigation
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth',
];

export function Navigation() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname();

  // IFC-210: Dynamic module-based navigation
  const { enabledRoutes, isLoading: modulesLoading } = useEnabledModules();

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
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="flex h-16 items-center px-4 lg:px-6">
        {/* Logo */}
        <div className="mr-8">
          <Logo />
        </div>

        {/* Desktop Navigation */}
        {modulesLoading ? (
          <nav className="hidden lg:flex items-center gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
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

        {/* Notifications - count is managed via RemindersContext */}
        <Notifications />

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
