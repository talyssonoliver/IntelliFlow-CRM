'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { developerNav } from '@/config/navigation';

export function DeveloperSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0">
      <nav className="sticky top-20 space-y-1">
        <div className="px-3 mb-4">
          <Link href="/developers/api-docs" className="flex items-center space-x-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary">
              <span className="text-[10px] font-bold text-primary-foreground">API</span>
            </div>
            <span className="text-lg font-semibold">Developer Hub</span>
          </Link>
        </div>
        {developerNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
