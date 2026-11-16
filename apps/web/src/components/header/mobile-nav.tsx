'use client';

import { Fragment, Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { SearchBar } from './search-bar';
import { ModuleNavGroup } from './ModuleNavGroup';
import type { NavRoute } from './main-nav';

interface MobileNavProps {
  routes: NavRoute[];
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Closes the menu after any navigation, path or query, including one started by a module's
 * custom content (portalled in), whose links do not know about this menu.
 */
function CloseOnNavigate({ onClose }: Readonly<{ onClose: () => void }>) {
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? '';
  const location = `${pathname}?${query}`;
  // Compared with the location the menu opened on, so an effect re-run (React Strict Mode runs
  // effects twice in development) does not close it; onClose is kept in a ref for the same reason.
  const openedAt = useRef(location);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (location === openedAt.current) return;
    openedAt.current = location;
    close.current();
  }, [location]);
  return null;
}

export function MobileNav({ routes, isOpen, onClose }: Readonly<MobileNavProps>) {
  const pathname = usePathname();

  if (!isOpen) return null;

  const isRouteActive = (route: NavRoute) =>
    pathname === route.href || !!pathname?.startsWith(route.href + '/');
  // A module whose path sits under no top-level route still gets its sections, at the top.
  const noRouteActive = !routes.some(isRouteActive);

  return (
    <div className="xl:hidden max-h-[calc(100svh-7rem)] overflow-y-auto border-t border-border">
      <Suspense fallback={null}>
        <CloseOnNavigate onClose={onClose} />
      </Suspense>
      <nav className="p-4 space-y-1">
        {noRouteActive && (
          <Suspense fallback={null}>
            <ModuleNavGroup onNavigate={onClose} />
          </Suspense>
        )}
        {routes.map((route) => {
          const isActive = isRouteActive(route);
          return (
            <Fragment key={route.href}>
              <Link
                href={route.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {route.icon && (
                  <span className="material-symbols-outlined text-xl">{route.icon}</span>
                )}
                {route.label}
              </Link>
              {/* The open module's own sections, so a phone has one menu (MVP-006). */}
              {isActive && (
                <Suspense fallback={null}>
                  <ModuleNavGroup onNavigate={onClose} />
                </Suspense>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="p-4 pt-0">
        <SearchBar className="w-full" />
      </div>
    </div>
  );
}
