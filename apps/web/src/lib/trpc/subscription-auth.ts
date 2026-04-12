import { clearTokenCookie } from '@/lib/shared/session-cleanup';

let isRedirectingToLogin = false;

export function isSubscriptionAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { data?: { code?: string }; message?: string };
  if (err.data?.code === 'UNAUTHORIZED') return true;

  const message = err.message?.toLowerCase() ?? '';
  return message.includes('unauthorized') || message.includes('authentication required');
}

export function handleSubscriptionAuthError(error: unknown, source: string): boolean {
  if (!isSubscriptionAuthError(error)) return false;

  if (typeof globalThis.window === 'undefined') return true;

  console.warn(`[${source}] Authentication required for subscription, redirecting to login`);

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  clearTokenCookie();

  if (globalThis.location.pathname === '/login') return true;
  if (isRedirectingToLogin) return true;

  isRedirectingToLogin = true;
  globalThis.location.href = '/login';
  return true;
}
