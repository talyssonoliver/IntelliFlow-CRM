import { cookies } from 'next/headers';
import { createContext } from '@intelliflow/api/context';
import { appRouter } from '@intelliflow/api/router';
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
 * Build a tRPC caller using a pre-read token string.
 *
 * Because the token is passed as a plain argument (no dynamic APIs),
 * this function is safe to call **inside** `'use cache'` blocks.
 */
export async function createCallerFromToken(token: string | null) {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const req = new Request('http://localhost', { headers });
  const ctx = await createContext({ req });
  return appRouter.createCaller(ctx);
}
