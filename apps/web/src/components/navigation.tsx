'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Logo, MainNav, MobileNav, SearchBar, UserMenu, Notifications, type NavRoute } from './header';
import { useAuth } from '@/lib/auth/AuthContext';

const routes: NavRoute[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Leads', href: '/leads', icon: 'group' },
  { label: 'Contacts', href: '/contacts', icon: 'person' },
  { label: 'Deals', href: '/deals', icon: 'handshake' },
  { label: 'Tickets', href: '/tickets', icon: 'confirmation_number' },
  { label: 'Documents', href: '/documents', icon: 'description' },
  { label: 'Agent Actions', href: '/agent-approvals', icon: 'smart_toy' }, // IFC-149: AI Agent approvals
  { label: 'Reports', href: '/analytics', icon: 'bar_chart' },
];

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
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // IFC-007: Don't show authenticated navigation on public routes or when not authenticated
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route));

  // Debug: Log navigation render decision
  console.log('[Navigation]', {
    pathname,
    isAuthenticated,
    isLoading,
    isPublicRoute,
    willRender: !isPublicRoute && isAuthenticated && !isLoading,
  });

  // Don't render if on public route or not authenticated
  // Also don't render while loading to prevent flash
  if (isPublicRoute || (!isAuthenticated && !isLoading)) {
    return null;
  }

  // Don't render while checking auth status (prevents header flash)
  if (isLoading) {
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
        <MainNav routes={routes} />

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
          <span className="material-symbols-outlined text-xl">
            {mobileOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        routes={routes}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
    </header>
  );
}
