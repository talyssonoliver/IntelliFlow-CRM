'use client';

import Link from 'next/link';

interface LogoProps {
  collapsed?: boolean;
  href?: string;
}

export function Logo({ collapsed = false, href = '/dashboard' }: LogoProps) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <div className="w-8 h-8 rounded bg-primary flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-primary-foreground text-xl">
          grid_view
        </span>
      </div>
      {!collapsed && (
        <span className="text-lg font-bold text-foreground hidden sm:inline">
          IntelliFlow CRM
        </span>
      )}
    </Link>
  );
}
