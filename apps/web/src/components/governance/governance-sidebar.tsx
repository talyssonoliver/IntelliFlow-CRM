'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';

interface GovernanceNavItem {
  label: string;
  href: string;
  icon: string;
  description?: string;
}

const governanceNavItems: GovernanceNavItem[] = [
  {
    label: 'Overview',
    href: '/governance',
    icon: 'dashboard',
    description: 'Governance summary',
  },
  {
    label: 'Compliance',
    href: '/governance/compliance',
    icon: 'verified_user',
    description: 'Standards monitoring',
  },
  {
    label: 'ADR Registry',
    href: '/governance/adr',
    icon: 'architecture',
    description: 'Architecture decisions',
  },
  {
    label: 'Policies',
    href: '/governance/policies',
    icon: 'description',
    description: 'Security & data policies',
  },
];

export function GovernanceSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/governance') {
      return pathname === href;
    }
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">
              policy
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Governance</h2>
            <p className="text-xs text-muted-foreground">Compliance & Policies</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {governanceNavItems.map((item) => (
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
                <div className="flex-1">
                  <span className="text-sm font-medium block">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-2">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
        >
          <span className="material-symbols-outlined text-lg">settings</span>
          Settings
        </Link>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
