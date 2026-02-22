import { cookies } from 'next/headers';
import { appRouter, createContext } from '@intelliflow/api';

/**
 * Read the access token from the request cookie.
 *
 * IMPORTANT: This function calls `cookies()` which is a dynamic API.
 * It must be called **outside** any `'use cache'` boundary.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('accessToken')?.value ?? null;
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
