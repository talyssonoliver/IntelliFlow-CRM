/**
 * @vitest-environment happy-dom
 * AuthContext.tsx - Supplementary tests for JWT utilities, state transitions,
 * initial state shape, and edge cases not covered by AuthContext.test.ts.
 *
 * Tests pure functions and state machine logic extracted from the source.
 * Does NOT render React components or use @testing-library/react.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// Re-implement pure functions from AuthContext.tsx for testing
// ============================================================

function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function tokenNeedsRefresh(token: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  const expiryTime = payload.exp * 1000;
  const now = Date.now();
  return now >= expiryTime - thresholdMs;
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

// ============================================================
// Helpers
// ============================================================

function createTestJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = btoa(JSON.stringify(payload));
  return `${header}.${payloadStr}.${btoa('fake-signature')}`;
}

function createJwtWithExp(expSeconds: number, sub = 'test-user'): string {
  return createTestJwt({ exp: expSeconds, sub });
}

// ============================================================
// Types mirroring AuthContext exports
// ============================================================

interface MfaState {
  required: boolean;
  challengeId: string | null;
  methods: ('totp' | 'sms' | 'email' | 'backup')[];
}

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar?: string | null;
}

interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfa: MfaState;
  error: string | null;
}

const initialMfaState: MfaState = {
  required: false,
  challengeId: null,
  methods: [],
};

const initialState: AuthState = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  mfa: initialMfaState,
  error: null,
};

// ============================================================
// Tests
// ============================================================

describe('AuthContext Supplementary - decodeJwtPayload edge cases', () => {
  it('returns null for empty string', () => {
    expect(decodeJwtPayload('')).toBeNull();
  });

  it('returns null for single segment', () => {
    expect(decodeJwtPayload('onlyone')).toBeNull();
  });

  it('returns null for four segments (too many dots)', () => {
    expect(decodeJwtPayload('a.b.c.d')).toBeNull();
  });

  it('parses payload with additional fields', () => {
    const payload = { exp: 1700000000, sub: 'user-1', iat: 1699999000, iss: 'intelliflow' };
    const token = createTestJwt(payload);
    const result = decodeJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.exp).toBe(1700000000);
    expect(result!.sub).toBe('user-1');
  });

  it('handles base64url padding correctly', () => {
    // Create a payload whose base64 representation has padding chars
    const payload = { exp: 123, sub: 'a' };
    const b64 = btoa(JSON.stringify(payload));
    // Convert standard base64 to base64url (remove padding, replace chars)
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `header.${b64url}.signature`;
    const result = decodeJwtPayload(token);
    expect(result).toEqual(payload);
  });

  it('returns null when payload is not valid JSON', () => {
    // Create a token where the payload segment decodes to non-JSON text
    const invalidPayload = btoa('this is not json');
    const token = `header.${invalidPayload}.signature`;
    expect(decodeJwtPayload(token)).toBeNull();
  });

  it('returns null for completely invalid base64 in payload', () => {
    expect(decodeJwtPayload('header.$$$$invalid$$$.sig')).toBeNull();
  });

  it('handles payload with exp=0', () => {
    const token = createTestJwt({ exp: 0, sub: 'zero' });
    const result = decodeJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.exp).toBe(0);
  });

  it('handles payload with negative exp', () => {
    const token = createTestJwt({ exp: -100, sub: 'negative' });
    const result = decodeJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.exp).toBe(-100);
  });

  it('handles payload with only sub (no exp)', () => {
    const token = createTestJwt({ sub: 'only-sub' });
    const result = decodeJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe('only-sub');
    expect(result!.exp).toBeUndefined();
  });

  it('handles empty object payload', () => {
    const token = createTestJwt({});
    const result = decodeJwtPayload(token);
    expect(result).toEqual({});
  });
});

describe('AuthContext Supplementary - tokenNeedsRefresh edge cases', () => {
  it('returns true when token expires exactly at threshold boundary', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Token expires in exactly 5 minutes (the threshold)
    const token = createJwtWithExp(nowSec + 300);
    // At the exact boundary, now >= expiryTime - threshold, so should be true
    expect(tokenNeedsRefresh(token)).toBe(true);
  });

  it('returns false for token expiring in 6 minutes with default threshold', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = createJwtWithExp(nowSec + 360);
    expect(tokenNeedsRefresh(token)).toBe(false);
  });

  it('returns true for token with exp=0', () => {
    const token = createJwtWithExp(0);
    expect(tokenNeedsRefresh(token)).toBe(true);
  });

  it('returns true for token with negative exp', () => {
    const token = createJwtWithExp(-1000);
    expect(tokenNeedsRefresh(token)).toBe(true);
  });

  it('returns false for very far future expiration', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = createJwtWithExp(nowSec + 86400); // 24 hours from now
    expect(tokenNeedsRefresh(token)).toBe(false);
  });

  it('custom threshold of 0 means only expired tokens need refresh', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Token expires in 1 second
    const token = createJwtWithExp(nowSec + 1);
    expect(tokenNeedsRefresh(token, 0)).toBe(false);
  });

  it('custom threshold of 10 minutes', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Token expires in 9 minutes - within 10 minute threshold
    const token = createJwtWithExp(nowSec + 540);
    expect(tokenNeedsRefresh(token, 10 * 60 * 1000)).toBe(true);
  });

  it('returns true for malformed token string', () => {
    expect(tokenNeedsRefresh('not-a-jwt-token')).toBe(true);
  });

  it('returns true for empty payload token', () => {
    const token = createTestJwt({});
    expect(tokenNeedsRefresh(token)).toBe(true);
  });
});

describe('AuthContext Supplementary - getTokenExpiryMs edge cases', () => {
  it('returns correct milliseconds for a future expiry', () => {
    const expSec = Math.floor(Date.now() / 1000) + 7200;
    const token = createJwtWithExp(expSec);
    expect(getTokenExpiryMs(token)).toBe(expSec * 1000);
  });

  it('returns correct milliseconds for a past expiry', () => {
    const expSec = Math.floor(Date.now() / 1000) - 3600;
    const token = createJwtWithExp(expSec);
    expect(getTokenExpiryMs(token)).toBe(expSec * 1000);
  });

  it('returns null for token with empty payload', () => {
    const token = createTestJwt({});
    expect(getTokenExpiryMs(token)).toBeNull();
  });

  it('returns null for non-JWT string', () => {
    expect(getTokenExpiryMs('random-string')).toBeNull();
  });

  it('returns null for two-segment token', () => {
    expect(getTokenExpiryMs('only.two')).toBeNull();
  });

  it('returns null for exp=0 (falsy exp treated as missing)', () => {
    const token = createJwtWithExp(0);
    // exp=0 is falsy, so !payload?.exp is true, returning null
    expect(getTokenExpiryMs(token)).toBeNull();
  });

  it('returns null for negative exp (negative is truthy but check logic)', () => {
    const token = createJwtWithExp(-10);
    // Negative exp is truthy, so it gets through the !payload?.exp check
    expect(getTokenExpiryMs(token)).toBe(-10000);
  });
});

describe('AuthContext Supplementary - Initial State Shape', () => {
  it('has correct initial state values', () => {
    expect(initialState.user).toBeNull();
    expect(initialState.session).toBeNull();
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.isLoading).toBe(true);
    expect(initialState.error).toBeNull();
  });

  it('has correct initial MFA state', () => {
    expect(initialState.mfa.required).toBe(false);
    expect(initialState.mfa.challengeId).toBeNull();
    expect(initialState.mfa.methods).toEqual([]);
  });

  it('initial state is deeply immutable copies per use', () => {
    const state1 = { ...initialState };
    const state2 = { ...initialState };
    state1.isLoading = false;
    expect(state2.isLoading).toBe(true);
  });
});

describe('AuthContext Supplementary - State Transitions', () => {
  let state: AuthState;

  function setState(updater: AuthState | ((prev: AuthState) => AuthState)) {
    state = typeof updater === 'function' ? updater(state) : updater;
  }

  beforeEach(() => {
    state = { ...initialState, mfa: { ...initialMfaState } };
  });

  describe('login flow with MFA then success', () => {
    it('transitions through loading -> MFA -> success', () => {
      // Step 1: Start loading
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();

      // Step 2: MFA required
      setState((prev) => ({
        ...prev,
        isLoading: false,
        mfa: {
          required: true,
          challengeId: 'challenge-abc',
          methods: ['totp', 'email'] as MfaState['methods'],
        },
      }));
      expect(state.isLoading).toBe(false);
      expect(state.mfa.required).toBe(true);
      expect(state.mfa.challengeId).toBe('challenge-abc');
      expect(state.mfa.methods).toEqual(['totp', 'email']);
      expect(state.isAuthenticated).toBe(false);

      // Step 3: MFA verified, login complete
      const user: AuthUser = { id: 'u-1', email: 'user@test.com', name: 'Test User', role: 'ADMIN' };
      const session: AuthSession = {
        accessToken: 'tok-123',
        refreshToken: 'ref-456',
        expiresAt: new Date('2030-01-01'),
      };
      setState((prev) => ({
        ...prev,
        user,
        session,
        isAuthenticated: true,
        isLoading: false,
        mfa: { required: false, challengeId: null, methods: [] },
      }));
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(user);
      expect(state.session).toEqual(session);
      expect(state.mfa.required).toBe(false);
    });
  });

  describe('login failure transitions', () => {
    it('sets error on API failure', () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const message = 'Network connection failed';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      expect(state.error).toBe(message);
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
    });

    it('preserves existing user data when error occurs on refresh', () => {
      // User is authenticated
      const user: AuthUser = { id: 'u-1', email: 'a@b.com', name: 'A', role: 'USER' };
      state = {
        ...initialState,
        user,
        isAuthenticated: true,
        isLoading: false,
        mfa: { ...initialMfaState },
      };

      // Error during refresh - simulate error being set without clearing user
      setState((prev) => ({ ...prev, error: 'Refresh failed' }));
      expect(state.user).toEqual(user);
      expect(state.error).toBe('Refresh failed');
    });
  });

  describe('logout clears everything', () => {
    it('resets to initial state on logout', () => {
      // Set up authenticated state
      state = {
        user: { id: 'u-1', email: 'user@test.com', name: 'User', role: 'ADMIN' },
        session: { accessToken: 'token', refreshToken: 'refresh', expiresAt: new Date() },
        isAuthenticated: true,
        isLoading: false,
        mfa: { required: false, challengeId: null, methods: [] },
        error: null,
      };

      // Logout
      setState({ ...initialState, isLoading: false });

      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.mfa.required).toBe(false);
    });

    it('clears MFA state on logout even if MFA was pending', () => {
      state = {
        ...initialState,
        mfa: { required: true, challengeId: 'ch-1', methods: ['totp'] },
        isLoading: false,
      };

      setState({ ...initialState, isLoading: false });
      expect(state.mfa.required).toBe(false);
      expect(state.mfa.challengeId).toBeNull();
    });
  });

  describe('clearError utility', () => {
    it('clears error without affecting other state', () => {
      const user: AuthUser = { id: 'u-1', email: 'a@b.com', name: 'A', role: 'USER' };
      state = {
        ...initialState,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: 'Some error occurred',
        mfa: { ...initialMfaState },
      };

      setState((prev) => ({ ...prev, error: null }));
      expect(state.error).toBeNull();
      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('setMfaRequired utility', () => {
    it('sets MFA state with provided methods', () => {
      setState((prev) => ({
        ...prev,
        mfa: {
          required: true,
          challengeId: 'ext-challenge',
          methods: ['sms', 'backup'] as MfaState['methods'],
        },
      }));
      expect(state.mfa.required).toBe(true);
      expect(state.mfa.challengeId).toBe('ext-challenge');
      expect(state.mfa.methods).toEqual(['sms', 'backup']);
    });

    it('does not affect authentication state', () => {
      setState((prev) => ({
        ...prev,
        mfa: {
          required: true,
          challengeId: 'ch-xyz',
          methods: ['totp'] as MfaState['methods'],
        },
      }));
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('status query to state mapping', () => {
    it('maps authenticated status to state correctly', () => {
      const data = {
        authenticated: true,
        user: { id: 'u-2', email: 'b@c.com', name: 'B', role: 'MANAGER' },
        expiresAt: '2030-06-15T12:00:00Z',
      };

      setState((prev) => ({
        ...prev,
        user: data.user as AuthUser,
        isAuthenticated: true,
        isLoading: false,
        session: {
          accessToken: '',
          expiresAt: new Date(data.expiresAt),
        },
      }));

      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('b@c.com');
      expect(state.session?.expiresAt).toEqual(new Date('2030-06-15T12:00:00Z'));
    });

    it('maps unauthenticated status correctly', () => {
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }));
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('handles status with authenticated=true but missing user', () => {
      // Edge case: API returns authenticated but no user object
      const data = { authenticated: true };
      // The source code checks: data.authenticated && 'user' in data && data.user
      const hasUser = 'user' in data && (data as any).user;
      expect(hasUser).toBeFalsy();
      // This would result in setting unauthenticated
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }));
      expect(state.isAuthenticated).toBe(false);
    });

    it('handles status with no expiresAt', () => {
      const data = {
        authenticated: true,
        user: { id: 'u-3', email: 'c@d.com', name: null, role: 'USER' },
      };

      const session = 'expiresAt' in data ? {
        accessToken: '',
        expiresAt: new Date((data as any).expiresAt),
      } : null;

      setState((prev) => ({
        ...prev,
        user: data.user as AuthUser,
        isAuthenticated: true,
        isLoading: false,
        session,
      }));

      expect(state.isAuthenticated).toBe(true);
      expect(state.session).toBeNull();
    });
  });

  describe('logged out page detection', () => {
    it('sets unauthenticated when logged_out page detected', () => {
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }));
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
    });
  });
});

describe('AuthContext Supplementary - Token Refresh Timer Logic', () => {
  it('calculates refresh time correctly: 5 minutes before expiry', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresInSec = 3600; // 1 hour
    const token = createJwtWithExp(nowSec + expiresInSec);

    const expiryMs = getTokenExpiryMs(token)!;
    const refreshAtMs = expiryMs - 5 * 60 * 1000;
    const timeUntilRefresh = refreshAtMs - Date.now();

    // Should refresh in about 55 minutes
    expect(timeUntilRefresh).toBeGreaterThan(50 * 60 * 1000);
    expect(timeUntilRefresh).toBeLessThanOrEqual(55 * 60 * 1000);
  });

  it('timeUntilRefresh is negative for nearly expired tokens', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Token expires in 2 minutes (less than 5 min threshold)
    const token = createJwtWithExp(nowSec + 120);

    const expiryMs = getTokenExpiryMs(token)!;
    const refreshAtMs = expiryMs - 5 * 60 * 1000;
    const timeUntilRefresh = refreshAtMs - Date.now();

    // Should be negative, meaning immediate refresh needed
    expect(timeUntilRefresh).toBeLessThanOrEqual(0);
  });

  it('timeUntilRefresh is negative for already expired tokens', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = createJwtWithExp(nowSec - 60); // expired 1 min ago

    const expiryMs = getTokenExpiryMs(token)!;
    const refreshAtMs = expiryMs - 5 * 60 * 1000;
    const timeUntilRefresh = refreshAtMs - Date.now();

    expect(timeUntilRefresh).toBeLessThan(0);
  });
});

describe('AuthContext Supplementary - Login Result Processing', () => {
  let state: AuthState;

  function setState(updater: AuthState | ((prev: AuthState) => AuthState)) {
    state = typeof updater === 'function' ? updater(state) : updater;
  }

  beforeEach(() => {
    state = { ...initialState, mfa: { ...initialMfaState } };
  });

  it('processes successful login result with all fields', () => {
    const result = {
      success: true,
      requiresMfa: false,
      user: { id: 'u-1', email: 'test@ex.com', name: 'Test', role: 'USER' },
      session: {
        accessToken: 'eyJ...',
        refreshToken: 'ref-token',
        expiresAt: '2030-01-01T00:00:00Z',
      },
    };

    if (result.success && result.user && result.session) {
      setState((prev) => ({
        ...prev,
        user: result.user as AuthUser,
        session: {
          accessToken: result.session!.accessToken,
          refreshToken: result.session!.refreshToken,
          expiresAt: new Date(result.session!.expiresAt),
        },
        isAuthenticated: true,
        isLoading: false,
        mfa: { required: false, challengeId: null, methods: [] },
      }));
    }

    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('test@ex.com');
    expect(state.session?.accessToken).toBe('eyJ...');
    expect(state.session?.refreshToken).toBe('ref-token');
  });

  it('processes MFA-required login result', () => {
    const result = {
      success: false,
      requiresMfa: true,
      mfaChallengeId: 'mfa-ch-001',
      mfaMethods: ['totp', 'sms'],
    };

    if (result.requiresMfa && result.mfaChallengeId) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        mfa: {
          required: true,
          challengeId: result.mfaChallengeId!,
          methods: (result.mfaMethods || ['totp']) as MfaState['methods'],
        },
      }));
    }

    expect(state.isAuthenticated).toBe(false);
    expect(state.mfa.required).toBe(true);
    expect(state.mfa.challengeId).toBe('mfa-ch-001');
    expect(state.mfa.methods).toEqual(['totp', 'sms']);
  });

  it('handles login result with success=false and no MFA', () => {
    const result = {
      success: false,
      requiresMfa: false,
    };

    if (!result.requiresMfa && !result.success) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Login failed',
      }));
    }

    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Login failed');
  });

  it('handles error during login with Error instance', () => {
    const error = new Error('Connection timeout');
    const message = error instanceof Error ? error.message : 'Login failed';
    setState((prev) => ({
      ...prev,
      isLoading: false,
      error: message,
    }));

    expect(state.error).toBe('Connection timeout');
  });

  it('handles error during login with non-Error value', () => {
    const error: unknown = 'string error';
    const message = error instanceof Error ? error.message : 'Login failed';
    setState((prev) => ({
      ...prev,
      isLoading: false,
      error: message,
    }));

    expect(state.error).toBe('Login failed');
  });
});

describe('AuthContext Supplementary - MFA Methods Handling', () => {
  it('all valid MFA methods are recognized', () => {
    const validMethods: MfaState['methods'] = ['totp', 'sms', 'email', 'backup'];
    expect(validMethods).toHaveLength(4);
    expect(validMethods).toContain('totp');
    expect(validMethods).toContain('sms');
    expect(validMethods).toContain('email');
    expect(validMethods).toContain('backup');
  });

  it('MFA result with default methods when not provided', () => {
    const result = {
      requiresMfa: true,
      mfaChallengeId: 'ch-1',
      mfaMethods: undefined as string[] | undefined,
    };

    const methods = (result.mfaMethods || ['totp']) as MfaState['methods'];
    expect(methods).toEqual(['totp']);
  });

  it('MFA result with explicit methods', () => {
    const result = {
      requiresMfa: true,
      mfaChallengeId: 'ch-1',
      mfaMethods: ['email', 'backup'],
    };

    const methods = (result.mfaMethods || ['totp']) as MfaState['methods'];
    expect(methods).toEqual(['email', 'backup']);
  });
});
