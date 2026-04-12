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
