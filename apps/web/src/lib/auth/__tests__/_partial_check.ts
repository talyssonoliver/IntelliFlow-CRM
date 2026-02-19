/**
 * @vitest-environment happy-dom
 * AuthContext.tsx - JWT utility + state machine tests
 */
function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
function _tokenNeedsRefresh(token: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000 - thresholdMs;
}
function _getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}
function _createTestJwt(exp: number, sub = 'test-user'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp, sub }));
  return header + '.' + payload + '.' + btoa('fake-sig');
}
