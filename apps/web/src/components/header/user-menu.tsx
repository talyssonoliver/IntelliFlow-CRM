'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';

interface UserMenuProps {
  user?: {
    name: string;
    email?: string;
    avatar?: string;
    role?: string;
  };
  className?: string;
}

export function UserMenu({
  user = { name: 'Alex', email: 'alex@intelliflow.ai', role: 'Admin' },
  className
}: UserMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on Escape key
  React.useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-accent transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">{initials}</span>
          )}
        </div>
        <span className="hidden sm:inline text-sm font-medium text-foreground">
          {user.name}
        </span>
        <span className="material-symbols-outlined text-lg text-muted-foreground">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                {user.email && (
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                )}
                {user.role && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
                    {user.role}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-muted-foreground">person</span>
              Profile
            </Link>

            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-muted-foreground">settings</span>
              Settings
            </Link>

            <Link
              href="/governance"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-muted-foreground">policy</span>
              Governance
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-1" />

          {/* Sign Out */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                // TODO: Implement sign out
                console.log('Sign out clicked');
              }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
