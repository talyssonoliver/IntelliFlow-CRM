'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLogout } from '@/hooks/useLogout';
import { AppAvatar } from '@/components/shared/app-avatar';

interface UserMenuProps {
  user?: {
    name: string;
    email?: string;
    avatar?: string;
    role?: string;
  };
  className?: string;
}

export function UserMenu({ user: propUser, className }: Readonly<UserMenuProps>) {
  // IFC-007: Connect to auth context for real user data
  const { user: authUser } = useAuth();
  const { logout, isLoggingOut } = useLogout();

  // Use auth context user if available, otherwise fall back to props
  const user = authUser
    ? {
        name: authUser.name || authUser.email.split('@')[0],
        email: authUser.email,
        role: authUser.role,
        avatar: authUser.avatar || undefined,
      }
    : propUser || { name: 'Guest', email: '', role: '' };
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: Readonly<MouseEvent>) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on Escape key
  React.useEffect(() => {
    function handleEscape(event: Readonly<KeyboardEvent>) {
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
        <AppAvatar
          name={user.name}
          src={user.avatar ?? null}
          fallbackText={initials}
          className="w-8 h-8"
          fallbackClassName="text-sm font-medium text-muted-foreground bg-muted"
        />
        <span className="hidden sm:inline text-sm font-medium text-foreground">{user.name}</span>
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
              <AppAvatar
                name={user.name}
                src={user.avatar ?? null}
                fallbackText={initials}
                className="w-10 h-10"
                fallbackClassName="text-sm font-medium text-muted-foreground bg-muted"
              />
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
              <span className="material-symbols-outlined text-lg text-muted-foreground">
                person
              </span>{' '}
              Profile
            </Link>

            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-muted-foreground">
                settings
              </span>{' '}
              Settings
            </Link>

            <Link
              href="/governance"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-muted-foreground">
                policy
              </span>{' '}
              Governance
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-1" />

          {/* Sign Out */}
          <div className="py-1">
            <button
              onClick={async () => {
                setIsOpen(false);
                // IFC-007: Implement actual logout
                await logout();
              }}
              disabled={isLoggingOut}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">logout</span>{' '}
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
