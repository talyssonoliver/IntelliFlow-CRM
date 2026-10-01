'use client';

/**
 * Membership state for the tenant switcher and the pinned-session banner.
 *
 * Wraps `user.listTenants` (session auth, ADR-071 section c). The procedure is part of the
 * contract but is not in the generated AppRouter type until the API lane lands, so it is reached
 * through a narrow structural cast; the runtime tRPC proxy resolves it by path either way.
 *
 * Disabled (no request) when the web rollout flag is off, so the default path is unchanged.
 */

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { isInheritedMembershipEnabled } from './active-tenant';
import { findActiveTenant, type ListTenantsOutput, type TenantListEntry } from './memberships';

interface ListTenantsQueryResult {
  data: ListTenantsOutput | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface TenantProcedures {
  user: {
    listTenants: {
      useQuery: (
        input: undefined,
        options?: { enabled?: boolean; staleTime?: number; retry?: boolean | number }
      ) => ListTenantsQueryResult;
    };
  };
}

export interface TenantMemberships {
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
  const query = (trpc as unknown as TenantProcedures).user.listTenants.useQuery(undefined, {
    enabled,
    staleTime: LIST_TENANTS_STALE_MS,
    retry: false,
  });

  return useMemo(() => {
    const data = enabled ? query.data : undefined;
    const tenants = data?.tenants ?? [];
    const pinned = data?.pinned === true;
    return {
      enabled,
      isLoading: enabled && query.isLoading,
      isError: enabled && query.isError,
      tenants,
      active: findActiveTenant(data),
      homeTenantId: data?.homeTenantId ?? null,
      pinned,
      canSwitch: !pinned && tenants.length > 1,
    };
  }, [enabled, query.data, query.isLoading, query.isError]);
}
