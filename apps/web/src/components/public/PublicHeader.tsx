'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, cn } from '@intelliflow/ui';

interface PublicRoute {
  label: string;
  href: string;
}

const publicRoutes: PublicRoute[] = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mr-8">
            <div className="w-8 h-8 rounded bg-[#137fec] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-white text-xl">grid_view</span>
            </div>
            <span className="text-lg font-bold text-foreground hidden sm:inline">
              IntelliFlow CRM
            </span>
          </Link>

          {/* Desktop Navigation - visible on md and up */}
          <nav className="hidden md:flex items-center gap-1">
            {publicRoutes.map((route) => {
              const isActive = pathname === route.href;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-[#137fec]/10 text-[#137fec] dark:text-[#137fec]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-foreground hover:bg-accent'
                  )}
                >
                  {route.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer - pushes buttons to the right */}
          <div className="flex-1" />

          {/* CTA Buttons - visible on md and up, hide based on current page */}
          <div className="hidden md:flex items-center gap-3">
            {pathname !== '/login' && (
              <Button variant="ghost" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
            )}
            {pathname !== '/signup' && (
              <Button asChild className="bg-[#137fec] hover:bg-[#0e6ac7]">
                <Link href="/signup">Start Free Trial</Link>
              </Button>
            )}
          </div>

          {/* Mobile Menu Button - visible on small screens only */}
          <button
            className="md:hidden ml-4 p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className="material-symbols-outlined text-xl">
              {mobileOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation - outside header to avoid stacking context issues */}
      {mobileOpen && (
        <>
          {/* Backdrop blur overlay */}
          <div
            className="md:hidden fixed inset-0 top-16 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Menu panel */}
          <div className="md:hidden fixed top-16 left-0 right-0 z-50 border-t border-border bg-card shadow-lg">
            <nav className="px-4 py-4 flex flex-col gap-2">
              {publicRoutes.map((route) => {
                const isActive = pathname === route.href;
                return (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                      isActive
                        ? 'bg-[#137fec]/10 text-[#137fec]'
                        : 'text-slate-600 dark:text-slate-400 hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {route.label}
                  </Link>
                );
              })}
              {/* Hide buttons based on current page */}
              {pathname !== '/login' && pathname !== '/signup' && (
                <div className="pt-4 border-t border-border mt-2 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/login">Sign In</Link>
                  </Button>
                  <Button
                    asChild
                    className="w-full bg-[#137fec] hover:bg-[#0e6ac7]"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/signup">Start Free Trial</Link>
                  </Button>
                </div>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
