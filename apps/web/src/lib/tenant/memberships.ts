/**
 * Wire shapes for the tenant-membership procedures (ADR-071, inherited-membership.v1 section c).
 *
 * Mirrors `listTenantsOutputSchema` / `claimLoginGrantOutputSchema` from
 * `@intelliflow/partner-sdk`. They are declared here (not imported) because the web app does not
 * depend on the SDK, and so the web lane compiles against the contract rather than against the
 * API implementation.
 */

export type TenantMembershipRole = 'ADMIN' | 'MEMBER';

export type TenantMembershipSource =
  | 'HOME'
  | 'PORTAL_MEMBER'
  | 'PORTAL_STAFF'
  | 'OWNER_INVITE'
  | 'PARTNER_CREATED';

export interface TenantListEntry {
  tenantId: string;
  name: string;
  slug: string;
  role: TenantMembershipRole;
  source: TenantMembershipSource;
  pinned: boolean;
  isHome: boolean;
  isActive: boolean;
}

export interface ListTenantsOutput {
  activeTenantId: string;
  homeTenantId: string;
  pinned: boolean;
  tenants: TenantListEntry[];
}

export interface ClaimLoginGrantOutput {
  tenantId: string;
  pinned: boolean;
  sessionExpiresAt: string | null;
}

/** The entry the session is currently acting in (falls back to the first entry). */
export function findActiveTenant(data: ListTenantsOutput | undefined): TenantListEntry | null {
  if (!data) return null;
  return (
    data.tenants.find((t) => t.isActive) ??
    data.tenants.find((t) => t.tenantId === data.activeTenantId) ??
    data.tenants[0] ??
    null
  );
}
