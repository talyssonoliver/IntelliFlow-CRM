import { cookies } from 'next/headers';
import { createTRPCClient } from '@intelliflow/api-client';
import { isTokenUsable } from '@/lib/auth/jwt';
import {
  ACTIVE_TENANT_COOKIE,
  ACTIVE_TENANT_HEADER,
  isValidTenantId,
} from '@/lib/tenant/active-tenant';

/**
 * Separator between the JWT and the active tenant inside a "scoped token" string.
 * `#` never occurs in a JWT (base64url + dots), so the two halves split unambiguously.
 */
const TENANT_SCOPE_SEPARATOR = '#tenant=';

function splitScopedToken(scoped: string): { token: string; tenantId: string | null } {
  const at = scoped.indexOf(TENANT_SCOPE_SEPARATOR);
  if (at === -1) return { token: scoped, tenantId: null };
  const tenantId = scoped.slice(at + TENANT_SCOPE_SEPARATOR.length);
  return { token: scoped.slice(0, at), tenantId: isValidTenantId(tenantId) ? tenantId : null };
}

/**
 * Read the access token from the request cookie.
 *
 * IMPORTANT: This function calls `cookies()` which is a dynamic API.
 * It must be called **outside** any `'use cache'` boundary.
 *
 * ADR-071: when the user has selected a tenant other than their home one (cookie), the returned string is the token with the selection appended
 * (see `TENANT_SCOPE_SEPARATOR`). Callers pass it on to the `'use cache'` query helpers and to
 * `createCallerFromToken` unchanged, which gives two properties without touching any signature:
 * the selection becomes part of every cache key (tenant A's cached data is never served to tenant
 * B for the same token) and `createCallerFromToken` forwards it as `x-active-tenant`.
 * Callers that only need to know whether the user is signed in can keep comparing to `null`.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value ?? null;
  if (!isTokenUsable(token)) return null;

  const tenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  if (isValidTenantId(tenantId)) return `${token}${TENANT_SCOPE_SEPARATOR}${tenantId}`;
  return token;
}

/**
 * Build a tRPC HTTP client pointed at the Railway API (ADR-063 Option 3).
 *
 * Replaces the previous in-process `appRouter.createCaller` (which forced
 * @intelliflow/api's container to load on every Vercel SSR render — the
 * ~4s cold-start). The client talks to `${NEXT_PUBLIC_API_URL}/api/trpc`
 * (Railway in prod). Because the token is a plain argument (no dynamic
 * APIs), this is safe inside `'use cache'` blocks.
 */
export async function createCallerFromToken(token: string | null) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const scoped = token ? splitScopedToken(token) : null;
  return createTRPCClient({
    url: `${apiUrl}/api/trpc`,
    headers: scoped
      ? () => ({
          Authorization: `Bearer ${scoped.token}`,
          ...(scoped.tenantId ? { [ACTIVE_TENANT_HEADER]: scoped.tenantId } : {}),
        })
      : undefined,
  });
}
