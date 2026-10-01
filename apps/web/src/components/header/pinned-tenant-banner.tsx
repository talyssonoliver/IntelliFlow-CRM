'use client';

import * as React from 'react';
import { cn } from '@intelliflow/ui';
import { useLogout } from '@/hooks/useLogout';
import { useTenantMemberships } from '@/lib/tenant/use-tenant-memberships';
import { getTenantMessages } from '@/lib/tenant/messages';

interface PinnedTenantBannerProps {
  className?: string;
}

/**
 * Banner for a pinned Portal-grant session (ADR-071): the agency staff member is signed in to a
 * client's CRM and cannot switch tenants, so the only way "back" is to end this session and sign
 * in to their own CRM. Shown only when `user.listTenants` reports `pinned`.
 */
export function PinnedTenantBanner({ className }: Readonly<PinnedTenantBannerProps>) {
  const { pinned, active } = useTenantMemberships();
  const { logout, isLoggingOut } = useLogout();
  const messages = getTenantMessages();

  if (!pinned || !active) return null;

  return (
    <output
      data-testid="pinned-tenant-banner"
      className={cn(
        'flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
        className
      )}
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        lock
      </span>
      <span>{messages.pinnedBanner(active.name)}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={isLoggingOut}
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60"
      >
        {messages.backToMyCrm}
      </button>
    </output>
  );
}
