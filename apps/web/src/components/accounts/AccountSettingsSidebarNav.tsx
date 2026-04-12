'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { ACCOUNT_SETTINGS_ITEMS } from '@/components/sidebar/configs/accounts';

interface AccountSettingsSidebarNavProps {
  isExpanded: boolean;
}

/**
 * Renders the settings items inline in the sidebar when on an account settings page.
 * Account Views & Tiers sections are rendered natively by the sidebar via `sections`.
 */
export function AccountSettingsSidebarNav({
  isExpanded: sidebarExpanded,
}: Readonly<AccountSettingsSidebarNavProps>) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      {/* ── Settings section — expanded ── */}
      <div>
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full',
            'bg-primary/10 font-medium text-foreground',
            !sidebarExpanded && 'justify-center'
          )}
        >
          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-emerald-50 dark:bg-emerald-950">
            <span
              className="material-symbols-outlined text-lg text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            >
              settings
            </span>
          </div>
          {sidebarExpanded && <span className="font-medium truncate">Account Settings</span>}
        </div>

        {sidebarExpanded ? (
          <div className="ml-3 mt-1 mb-1 flex flex-col gap-0.5">
            {ACCOUNT_SETTINGS_ITEMS.map((item) => {
              const itemPath = new URL(item.href, 'http://localhost').pathname;
              const active = pathname === itemPath;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <span
                    className={cn(
                      'material-symbols-outlined text-lg',
                      active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                    )}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-1 mb-1 flex flex-col gap-0.5">
            {ACCOUNT_SETTINGS_ITEMS.map((item) => {
              const itemPath = new URL(item.href, 'http://localhost').pathname;
              const active = pathname === itemPath;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    'flex items-center justify-center px-3 py-1.5 rounded-lg transition-colors',
                    active
                      ? 'bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <span
                    className={cn(
                      'material-symbols-outlined text-lg',
                      active ? 'text-emerald-600 dark:text-emerald-400' : ''
                    )}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Divider between settings and Account Views ── */}
      <div className={cn('mt-1 border-t border-border', sidebarExpanded ? 'mx-3' : 'mx-2')} />
    </div>
  );
}
