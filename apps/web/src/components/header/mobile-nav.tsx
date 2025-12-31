'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { SearchBar } from './search-bar';
import type { NavRoute } from './main-nav';

interface MobileNavProps {
  routes: NavRoute[];
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ routes, isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <div className="lg:hidden border-t border-border">
      <nav className="p-4 space-y-1">
        {routes.map((route) => {
          const isActive = pathname === route.href || pathname?.startsWith(route.href + '/');
          return (
            <Link
              key={route.href}
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
          );
        })}
      </nav>

      <div className="p-4 pt-0">
        <SearchBar className="w-full" />
      </div>
    </div>
  );
}
