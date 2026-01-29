'use client';

import * as React from 'react';
import { Logo } from './logo';
import { MainNav, type NavRoute } from './main-nav';
import { MobileNav } from './mobile-nav';
import { SearchBar } from './search-bar';
import { UserMenu } from './user-menu';
import { Notifications } from './notifications';

const routes: NavRoute[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Leads', href: '/leads', icon: 'group' },
  { label: 'Contacts', href: '/contacts', icon: 'person' },
  { label: 'Deals', href: '/deals', icon: 'handshake' },
  { label: 'Tickets', href: '/tickets', icon: 'confirmation_number' },
  { label: 'Documents', href: '/documents', icon: 'description' },
  { label: 'Agent Actions', href: '/agent-approvals/preview', icon: 'smart_toy' }, // IFC-149: AI Agent approvals
  { label: 'Reports', href: '/analytics', icon: 'bar_chart' },
];

export function AppHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

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
