'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';

export interface NavRoute {
  label: string;
  href: string;
  icon?: string;
  roles?: string[];
}

interface MainNavProps {
  routes: NavRoute[];
  className?: string;
}

export function MainNav({ routes, className }: Readonly<MainNavProps>) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        'hidden lg:flex items-center gap-1 xl:max-[1439px]:gap-0 min-[1440px]:max-[1535px]:gap-0.5',
        className
      )}
    >
      {routes.map((route) => {
        const isActive = pathname === route.href || pathname?.startsWith(route.href + '/');
        return (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              'px-3 xl:max-[1439px]:px-1.5 min-[1440px]:max-[1535px]:px-2 py-2 text-sm font-medium rounded-lg transition-colors',
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
  );
}
