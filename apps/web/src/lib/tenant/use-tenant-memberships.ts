'use client';

/**
 * Membership state for the tenant switcher and the pinned-session banner.
 *
 * Wraps `user.listTenants` (session auth, ADR-071 section c).
 *
 * The query runs whatever the web rollout flag says: a pinned (agency staff) session is decided by
 * the API from data, so the banner must not depend on a second env var. The flag only decides
 * whether the user may SWITCH (`canSwitch`), not whether they are told they are pinned.
 */

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { isInheritedMembershipEnabled } from './active-tenant';
import { findActiveTenant, type TenantListEntry } from './memberships';

export interface TenantMemberships {
  /** The switcher is offered (web flag). A pinned session is reported either way. */
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Every tenant the session may switch between (a pinned session has exactly one). */
  tenants: TenantListEntry[];
  active: TenantListEntry | null;
  homeTenantId: string | null;
  /** True for a Portal grant session: bound to one tenant, cannot switch. */
  pinned: boolean;
  /** More than one tenant to choose from, and the session is allowed to choose. */
  canSwitch: boolean;
}

const LIST_TENANTS_STALE_MS = 60_000;

export function useTenantMemberships(): TenantMemberships {
  const enabled = isInheritedMembershipEnabled();
  const query = trpc.user.listTenants.useQuery(undefined, {
    staleTime: LIST_TENANTS_STALE_MS,
    retry: false,
  });

  return useMemo(() => {
    const data = query.data;
    const tenants = data?.tenants ?? [];
    const pinned = data?.pinned === true;
    return {
      enabled,
      isLoading: query.isLoading,
      isError: query.isError,
      tenants,
      active: findActiveTenant(data),
      homeTenantId: data?.homeTenantId ?? null,
      pinned,
      canSwitch: enabled && !pinned && tenants.length > 1,
    };
  }, [enabled, query.data, query.isLoading, query.isError]);
}
