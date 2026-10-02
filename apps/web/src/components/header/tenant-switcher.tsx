'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@intelliflow/ui';
import { useTenantMemberships } from '@/lib/tenant/use-tenant-memberships';
import { ACTIVE_TENANT_STORAGE_KEY, setActiveTenantId } from '@/lib/tenant/active-tenant';
import { getTenantMessages } from '@/lib/tenant/messages';
import type { TenantListEntry } from '@/lib/tenant/memberships';

/** Where the app lands after a switch: ids from the old tenant are meaningless in the new one. */
const AFTER_SWITCH_PATH = '/dashboard';

function menuIcon(entry: TenantListEntry): string {
  if (entry.isActive) return 'check';
  return entry.isHome ? 'home' : 'domain';
}

interface TenantSwitcherProps {
  className?: string;
}

/**
 * Another tab changed the selection: this tab's data belongs to the previous tenant (and its
 * requests already carry the new header), so reload rather than show mixed state.
 */
function useReloadOnSelectionChangedElsewhere(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || typeof globalThis.window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_TENANT_STORAGE_KEY) globalThis.location.reload();
    };
    globalThis.addEventListener('storage', onStorage);
    return () => globalThis.removeEventListener('storage', onStorage);
  }, [enabled]);
}

/**
 * Header tenant switcher (ADR-071 phase 2).
 *
 * - Lists the tenants returned by `user.listTenants` and switches by changing the persisted
 *   active-tenant selection (sent as `x-active-tenant` on every request), then dropping every
 *   cached query (their keys and results belong to the previous tenant) and reloading.
 * - Hidden when the user has a single tenant.
 * - Rendered disabled (never interactive) for a pinned Portal-grant session.
 */
export function TenantSwitcher({ className }: Readonly<TenantSwitcherProps>) {
  const { enabled, tenants, active, pinned, canSwitch } = useTenantMemberships();
  const queryClient = useQueryClient();
  const messages = getTenantMessages();
  const [isOpen, setIsOpen] = React.useState(false);
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  useReloadOnSelectionChangedElsewhere(enabled);

  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const switchTo = React.useCallback(
    async (entry: TenantListEntry) => {
      setIsOpen(false);
      if (!canSwitch || entry.isActive || switchingTo) return;

      setSwitchingTo(entry.tenantId);
      // The home tenant is the default: store nothing rather than its id.
      setActiveTenantId(entry.isHome ? null : entry.tenantId);
      await queryClient.cancelQueries();
      queryClient.clear();
      globalThis.location.assign(AFTER_SWITCH_PATH);
    },
    [canSwitch, queryClient, switchingTo]
  );

  // Nothing to choose from, and no pinned session to explain.
  if (!active || (!pinned && (!enabled || tenants.length < 2))) return null;

  if (pinned) {
    return (
      <div className={cn('relative', className)}>
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label={`${messages.switcherLabel}: ${active.name}`}
          title={messages.switcherDisabled}
          className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-70 cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            lock
          </span>
          <span className="truncate">{active.name}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={switchingTo !== null}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${messages.switcherLabel}: ${active.name}`}
        className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          domain
        </span>
        <span className="truncate">{switchingTo ? messages.switching : active.name}</span>
        <span
          className="material-symbols-outlined text-lg text-muted-foreground"
          aria-hidden="true"
        >
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={messages.switcherLabel}
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {tenants.map((entry) => (
            <button
              key={entry.tenantId}
              type="button"
              role="menuitemradio"
              aria-checked={entry.isActive}
              onClick={() => void switchTo(entry)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
                entry.isActive && 'bg-accent/50 font-semibold'
              )}
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                {menuIcon(entry)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">
                  {entry.isHome ? `${entry.name} · ${messages.switcherHome}` : entry.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{entry.role}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
