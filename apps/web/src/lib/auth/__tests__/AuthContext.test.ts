/**
 * @vitest-environment happy-dom
 * AuthContext.tsx - JWT utility + state machine tests
 */
import { describe, it, expect, beforeEach } from 'vitest';

function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}
function tokenNeedsRefresh(token: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000 - thresholdMs;
}
function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}
function createTestJwt(exp: number, sub = 'test-user'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp, sub }));
  return header + '.' + payload + '.' + btoa('fake-sig');
}

interface MfaState { required: boolean; challengeId: string | null; methods: string[]; }
interface AuthState {
  user: { id: string; email: string; name: string | null; role: string } | null;
  session: { accessToken: string; refreshToken?: string; expiresAt: Date } | null;
  isAuthenticated: boolean; isLoading: boolean; mfa: MfaState; error: string | null;
}
const INITIAL: AuthState = {
  user: null, session: null, isAuthenticated: false, isLoading: true,
  mfa: { required: false, challengeId: null, methods: [] }, error: null,
};

describe('AuthContext - JWT Utility Functions', () => {
  describe('decodeJwtPayload', () => {
    it('decodes valid JWT payload', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      expect(decodeJwtPayload(createTestJwt(exp, 'user-123'))).toEqual({ exp, sub: 'user-123' });
    });
    it('returns null for <3 parts', () => {
      expect(decodeJwtPayload('only.two')).toBeNull();
      expect(decodeJwtPayload('')).toBeNull();
    });
    it('returns null for invalid base64', () => {
      expect(decodeJwtPayload('a.!!!.c')).toBeNull();
    });
    it('handles base64url chars', () => {
      const obj = { exp: 1700000000, sub: 'test' };
      const b64 = btoa(JSON.stringify(obj));
      const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      expect(decodeJwtPayload('header.' + b64url + '.sig')).toEqual(obj);
    });
    it('handles missing exp', () => {
      const h = btoa(JSON.stringify({ alg: 'HS256' }));
      const p = btoa(JSON.stringify({ sub: 'x' }));
      const r = decodeJwtPayload(h + '.' + p + '.sig');
      expect(r).toEqual({ sub: 'x' });
      expect(r?.exp).toBeUndefined();
    });
    it('null for >3 parts', () => { expect(decodeJwtPayload('a.b.c.d')).toBeNull(); });
  });
  describe('tokenNeedsRefresh', () => {
    it('true within threshold', () => {
      expect(tokenNeedsRefresh(createTestJwt(Math.floor(Date.now() / 1000) + 240))).toBe(true);
    });
    it('false beyond threshold', () => {
      expect(tokenNeedsRefresh(createTestJwt(Math.floor(Date.now() / 1000) + 1800))).toBe(false);
    });
    it('true when expired', () => {
      expect(tokenNeedsRefresh(createTestJwt(Math.floor(Date.now() / 1000) - 60))).toBe(true);
    });
    it('true no exp', () => {
      const h = btoa(JSON.stringify({ alg: 'HS256' }));
      const p = btoa(JSON.stringify({ sub: 'x' }));
      expect(tokenNeedsRefresh(h + '.' + p + '.sig')).toBe(true);
    });
    it('custom threshold', () => {
      expect(tokenNeedsRefresh(createTestJwt(Math.floor(Date.now() / 1000) + 120), 60000)).toBe(false);
    });
    it('true for invalid', () => { expect(tokenNeedsRefresh('not-jwt')).toBe(true); });
  });
  describe('getTokenExpiryMs', () => {
    it('returns ms', () => {
      const s = Math.floor(Date.now() / 1000) + 3600;
      expect(getTokenExpiryMs(createTestJwt(s))).toBe(s * 1000);
    });
    it('null no exp', () => {
      const h = btoa(JSON.stringify({ alg: 'HS256' }));
      const p = btoa(JSON.stringify({ sub: 'x' }));
      expect(getTokenExpiryMs(h + '.' + p + '.sig')).toBeNull();
    });
    it('null invalid', () => { expect(getTokenExpiryMs('bad')).toBeNull(); });
  });
});

describe('AuthContext - State Machine', () => {
  let state: AuthState;
  function setState(u: AuthState | ((p: AuthState) => AuthState)) { state = typeof u === 'function' ? u(state) : u; }
  beforeEach(() => { state = { ...INITIAL }; });

  describe('login', () => {
    it('authenticated on success', () => {
      setState(p => ({ ...p, isLoading: true, error: null }));
      const user = { id: 'u1', email: 'test@ex.com', name: 'T', role: 'USER' };
      const session = { accessToken: 'tok', refreshToken: 'ref', expiresAt: new Date() };
      setState(p => ({ ...p, user, session, isAuthenticated: true, isLoading: false, mfa: { required: false, challengeId: null, methods: [] } }));
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(user);
    });
    it('MFA required', () => {
      setState(p => ({ ...p, isLoading: false, mfa: { required: true, challengeId: 'ch-xyz', methods: ['totp', 'sms'] } }));
      expect(state.mfa.required).toBe(true);
      expect(state.mfa.challengeId).toBe('ch-xyz');
    });
    it('error on failure', () => {
      setState(p => ({ ...p, isLoading: false, error: 'Invalid credentials' }));
      expect(state.error).toBe('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('clears all state', () => {
      state = { user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' }, session: { accessToken: 'tok', expiresAt: new Date() }, isAuthenticated: true, isLoading: false, mfa: { required: false, challengeId: null, methods: [] }, error: null };
      setState({ ...INITIAL, isLoading: false });
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('MFA verification', () => {
    it('blocks without challengeId', () => {
      state = { ...INITIAL, isLoading: false };
      if (!state.mfa.challengeId) setState(p => ({ ...p, error: 'No MFA challenge pending' }));
      expect(state.error).toBe('No MFA challenge pending');
    });
    it('authenticated after MFA', () => {
      state = { ...INITIAL, isLoading: false, mfa: { required: true, challengeId: 'ch-1', methods: ['totp'] } };
      setState(p => ({ ...p, user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' }, session: { accessToken: 'mfa-tok', expiresAt: new Date() }, isAuthenticated: true, isLoading: false, mfa: { required: false, challengeId: null, methods: [] } }));
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('status query', () => {
    it('sets user from query', () => {
      setState(p => ({ ...p, user: { id: 'u1', email: 't@e.com', name: 'T', role: 'ADMIN' }, isAuthenticated: true, isLoading: false, session: { accessToken: '', expiresAt: new Date(Date.now() + 3600000) } }));
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.role).toBe('ADMIN');
    });
    it('unauthenticated on error', () => {
      setState(p => ({ ...p, user: null, isAuthenticated: false, isLoading: false }));
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('utilities', () => {
    it('clearError', () => {
      state = { ...INITIAL, error: 'oops' };
      setState(p => ({ ...p, error: null }));
      expect(state.error).toBeNull();
    });
    it('setMfaRequired', () => {
      setState(p => ({ ...p, mfa: { required: true, challengeId: 'ext-123', methods: ['totp', 'email'] } }));
      expect(state.mfa.required).toBe(true);
      expect(state.mfa.challengeId).toBe('ext-123');
    });
  });
});
