import { cookies } from 'next/headers';
import { createTRPCClient } from '@intelliflow/api-client';
import { isTokenUsable } from '@/lib/auth/jwt';

/**
 * Read the access token from the request cookie.
 *
 * IMPORTANT: This function calls `cookies()` which is a dynamic API.
 * It must be called **outside** any `'use cache'` boundary.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value ?? null;
  return isTokenUsable(token) ? token : null;
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
  return createTRPCClient({
    url: `${apiUrl}/api/trpc`,
    headers: token ? () => ({ Authorization: `Bearer ${token}` }) : undefined,
  });
}
