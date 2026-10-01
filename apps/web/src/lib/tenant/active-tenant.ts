/**
 * Active-tenant selection (ADR-071, inherited tenant membership).
 *
 * A signed-in user acts in one tenant per request: the one named by the `x-active-tenant`
 * header, or their home tenant when the header is absent. The selection is persisted in
 * localStorage (read by the browser tRPC/WS/fetch clients on every request) and mirrored in a
 * cookie (read by SSR, which has no localStorage). Storing `null` means "the home tenant".
 *
 * The selection is only a HINT: the API validates it against the user's live memberships on
 * every request and ignores it for pinned (Portal grant) sessions. So a stale or tampered value
 * can at worst produce `NOT_A_MEMBER`, which the app heals by clearing it (see
 * `isNotAMemberError`).
 *
 * Everything here is gated by `NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED` (mirror of the API flag
 * `INHERITED_MEMBERSHIP_ENABLED`): with the flag off no header is sent and no selection is read,
 * so request behaviour is identical to before ADR-071.
 */

/** Request header the API reads to pick the active tenant. */
export const ACTIVE_TENANT_HEADER = 'x-active-tenant';

export const ACTIVE_TENANT_STORAGE_KEY = 'intelliflow_active_tenant';
export const ACTIVE_TENANT_COOKIE = 'intelliflow_active_tenant';

/** Fired on `globalThis` (same tab) whenever the selection changes. detail: { tenantId }. */
export const ACTIVE_TENANT_CHANGED_EVENT = 'intelliflow-active-tenant-changed';

/**
 * Tenant ids are cuid-like. Anything else is rejected before it can reach a header or a cache
 * key (header injection, oversized values).
 */
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function isValidTenantId(value: unknown): value is string {
  return typeof value === 'string' && TENANT_ID_PATTERN.test(value);
}

/** True when the web side of the inherited-membership rollout is on. */
export function isInheritedMembershipEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = new RegExp(String.raw`(?:^|;\s*)${ACTIVE_TENANT_COOKIE}=([^;]*)`).exec(
    document.cookie
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function writeCookie(tenantId: string | null): void {
  if (typeof document === 'undefined') return;
  if (tenantId) {
    const secure = globalThis.location?.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${ACTIVE_TENANT_COOKIE}=${encodeURIComponent(tenantId)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  } else {
    document.cookie = `${ACTIVE_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

/**
 * The persisted selection, or `null` for "home tenant". localStorage wins; the cookie is the
 * fallback (it is the only copy SSR can see, and survives a cleared localStorage).
 */
export function getActiveTenantId(): string | null {
  if (typeof globalThis.window === 'undefined') return null;
  if (!isInheritedMembershipEnabled()) return null;

  try {
    const stored = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    if (isValidTenantId(stored)) return stored;
  } catch {
    // localStorage unavailable (privacy mode): fall back to the cookie.
  }
  const fromCookie = readCookie();
  return isValidTenantId(fromCookie) ? fromCookie : null;
}

function notifyChanged(tenantId: string | null): void {
  if (typeof globalThis.window === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent(ACTIVE_TENANT_CHANGED_EVENT, { detail: { tenantId } }));
}

/**
 * Persist the selection. Pass `null` (or an invalid id) to go back to the home tenant.
 * Returns the value that was actually stored.
 */
export function setActiveTenantId(tenantId: string | null): string | null {
  if (typeof globalThis.window === 'undefined') return null;
  const next = isValidTenantId(tenantId) ? tenantId : null;

  try {
    if (next) localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, next);
    else localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  } catch {
    // The cookie below still carries the selection for SSR.
  }
  writeCookie(next);
  notifyChanged(next);
  return next;
}

/** Forget the selection (logout, fresh sign-in, healing a stale selection). */
export function clearActiveTenant(): void {
  setActiveTenantId(null);
}

/**
 * Headers to merge into every API request. Empty when the flag is off or the home tenant is
 * active, so the default path is byte-for-byte unchanged.
 */
export function activeTenantHeaders(): Record<string, string> {
  const tenantId = getActiveTenantId();
  return tenantId ? { [ACTIVE_TENANT_HEADER]: tenantId } : {};
}

/**
 * True for the API's `FORBIDDEN NOT_A_MEMBER` (reason on `error.data.reason`, or as the
 * `NOT_A_MEMBER:` message prefix). Used to heal a stale selection after a revoked membership.
 */
export function isNotAMemberError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: unknown; data?: { reason?: unknown } };
  if (err.data?.reason === 'NOT_A_MEMBER') return true;
  return typeof err.message === 'string' && err.message.startsWith('NOT_A_MEMBER:');
}
