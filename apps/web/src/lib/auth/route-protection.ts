/**
 * Central protected-route matcher for client and proxy auth checks.
 *
 * Keep this aligned with the protected app sections that must never render
 * for unauthenticated users.
 */

export const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/leads',
  '/contacts',
  '/accounts',
  '/opportunities',
  '/tasks',
  '/analytics',
  '/settings',
  '/admin',
  '/agent-approvals',
  '/calendar',
  '/billing',
  '/governance',
  '/notifications',
  '/cases',
  '/deals',
  '/documents',
  '/email',
  '/profile',
  '/tickets',
] as const;

export function matchesRoutePrefix(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => path === pattern || path.startsWith(`${pattern}/`));
}

export function isProtectedAppRoute(path: string): boolean {
  return matchesRoutePrefix(path, PROTECTED_ROUTE_PREFIXES);
}

/**
 * Public auth / onboarding-flow pages where an interstitial like the
 * OnboardingWelcome modal must NOT appear — it would interrupt the user
 * mid-flow. Everything else, for an authenticated user, is fair game, including
 * the marketing home `/`, which is exactly where OAuth (Google) users land after
 * sign-in (the prior `isProtectedAppRoute` gate excluded `/`, so the welcome
 * modal never fired for them).
 */
export const PUBLIC_AUTH_ROUTE_PREFIXES = [
  '/login',
  '/signup',
  '/logout',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  // MFA verification (e.g. /mfa/verify) is an auth-flow page used for login AND
  // mid-session re-verification; the onboarding modal must not interrupt it.
  // Keep this list in sync with AUTH_PAGES_NO_CHROME in PublicLayoutShell.tsx.
  '/mfa',
  '/auth/callback',
  '/sso',
] as const;

export function isPublicAuthRoute(path: string): boolean {
  return matchesRoutePrefix(path, PUBLIC_AUTH_ROUTE_PREFIXES);
}
