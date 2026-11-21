'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';
import { buildNavLayout, isRouteActive } from './nav-groups';

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

const LINK =
  'inline-flex items-center gap-2 min-h-11 px-3 text-sm font-medium whitespace-nowrap rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ACTIVE = 'bg-primary/10 text-primary';
const IDLE = 'text-muted-foreground hover:text-foreground hover:bg-accent';

/**
 * The top bar (owner 21/11 reference): the main destinations with their icons, and every other
 * enabled page in a grouped "More" menu (see nav-groups.ts). Shown from lg; below that the menu
 * button opens MobileNav with the full list. Icons show from xl, where the bar has room for them.
 */
export function MainNav({ routes, className }: Readonly<MainNavProps>) {
  const pathname = usePathname();
  const { primary, groups } = React.useMemo(() => buildNavLayout(routes), [routes]);
  const moreActive = groups.some((g) => g.routes.some((r) => isRouteActive(pathname, r.href)));
  const [open, setOpen] = React.useState(false);

  // Close the menu when the page changes (a link in it was followed).
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn('hidden lg:flex items-center gap-1', className)}
    >
      {primary.map((route) => {
        const active = isRouteActive(pathname, route.href);
        return (
          <Link
            prefetch={false}
            key={route.href}
            href={route.href}
            aria-current={active ? 'page' : undefined}
            className={cn(LINK, active ? ACTIVE : IDLE)}
          >
            {route.icon && (
              <span
                className="material-symbols-outlined text-[20px] hidden xl:inline"
                aria-hidden="true"
              >
                {route.icon}
              </span>
            )}
            {route.label}
          </Link>
        );
      })}

      {groups.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(LINK, moreActive || open ? ACTIVE : IDLE)}
              data-testid="nav-more"
            >
              <span
                className="material-symbols-outlined text-[20px] hidden xl:inline"
                aria-hidden="true"
              >
                apps
              </span>
              <span>More</span>
              <span
                className={cn(
                  'material-symbols-outlined text-[18px] motion-safe:transition-transform',
                  open && 'rotate-180'
                )}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={10}
            className="w-auto max-w-[min(56rem,calc(100vw-2rem))] rounded-2xl p-6"
          >
            <div className="flex divide-x divide-border" data-testid="nav-more-panel">
              {groups.map((group) => (
                <section
                  key={group.title}
                  aria-label={group.title}
                  className="min-w-40 px-6 first:pl-0 last:pr-0"
                >
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    {group.title}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.routes.map((route) => {
                      const active = isRouteActive(pathname, route.href);
                      return (
                        <li key={route.href}>
                          <Link
                            prefetch={false}
                            href={route.href}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setOpen(false)}
                            className={cn(
                              LINK,
                              'w-full gap-3 -mx-3',
                              active ? ACTIVE : 'text-foreground hover:bg-accent'
                            )}
                          >
                            {route.icon && (
                              <span
                                className="material-symbols-outlined text-[20px] text-muted-foreground"
                                aria-hidden="true"
                              >
                                {route.icon}
                              </span>
                            )}
                            {route.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </nav>
  );
}
