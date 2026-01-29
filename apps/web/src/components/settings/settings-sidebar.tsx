'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';

interface SettingsNavItem {
  label: string;
  href: string;
  icon: string;
  description?: string;
  external?: boolean;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    label: 'Account',
    href: '/settings/account',
    icon: 'person',
    description: 'Manage your account settings',
  },
  {
    label: 'Team',
    href: '/settings/team',
    icon: 'group',
    description: 'Manage team members and roles',
  },
  {
    label: 'Integrations',
    href: '/settings/integrations',
    icon: 'extension',
    description: 'Connected apps and services',
  },
  {
    label: 'Notifications',
    href: '/settings/notifications',
    icon: 'notifications',
    description: 'Email and push notification preferences',
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {settingsNavItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'material-symbols-outlined text-xl',
                    isActive(item.href) ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Governance Link (External Section) */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            More
          </p>
          <Link
            href="/governance"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="material-symbols-outlined text-xl text-muted-foreground">policy</span>
            <div className="flex-1">
              <span className="text-sm font-medium block">Governance</span>
              <span className="text-xs text-muted-foreground">Compliance & Policies</span>
            </div>
            <span className="material-symbols-outlined text-lg text-muted-foreground">
              open_in_new
            </span>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
