'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';

const routes = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Leads', href: '/leads', icon: 'group' },
  { label: 'Contacts', href: '/contacts', icon: 'person' },
  { label: 'Deals', href: '/deals', icon: 'handshake' },
  { label: 'Tickets', href: '/tickets', icon: 'confirmation_number' },
  { label: 'Reports', href: '/analytics', icon: 'bar_chart' },
];

export function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="flex h-16 items-center px-4 lg:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-foreground text-xl">grid_view</span>
          </div>
          <span className="text-lg font-bold text-foreground hidden sm:inline">
            IntelliFlow CRM
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {routes.map((route) => {
            const isActive = pathname === route.href || pathname?.startsWith(route.href + '/');
            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {route.label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="hidden md:flex items-center mr-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">search</span>
            <input
              type="search"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors mr-2">
          <span className="material-symbols-outlined text-xl">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
        </button>

        {/* User Menu */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            <span className="text-sm font-medium text-muted-foreground">A</span>
          </div>
          <span className="hidden sm:inline text-sm font-medium text-foreground">
            Alex
          </span>
          <button className="p-1 text-muted-foreground hover:text-foreground">
            <span className="material-symbols-outlined text-lg">expand_more</span>
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden ml-4 p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border">
          <nav className="p-4 space-y-1">
            {routes.map((route) => {
              const isActive = pathname === route.href || pathname?.startsWith(route.href + '/');
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <span className="material-symbols-outlined text-xl">{route.icon}</span>
                  {route.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Search */}
          <div className="p-4 pt-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">search</span>
              <input
                type="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
