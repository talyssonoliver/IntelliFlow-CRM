'use client';

/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the application.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - User state management
 * - Login/logout methods
 * - OAuth flow support
 * - MFA state tracking
 * - Session persistence
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '../trpc';

// ============================================
// Types
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface MfaState {
  required: boolean;
  challengeId: string | null;
  methods: ('totp' | 'sms' | 'email' | 'backup')[];
}

export interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfa: MfaState;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  // Auth methods
  login: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  loginWithOAuth: (provider: 'google' | 'azure') => Promise<void>;
  verifyMfa: (code: string, method: 'totp' | 'sms' | 'email' | 'backup') => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  // State methods
  clearError: () => void;
  setMfaRequired: (challengeId: string, methods: string[]) => void;
}

// ============================================
// Initial State
// ============================================

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

// ============================================
// Context
// ============================================

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  login: async () => false,
  loginWithOAuth: async () => {},
  verifyMfa: async () => false,
  logout: async () => {},
  refreshSession: async () => {},
  clearError: () => {},
  setMfaRequired: () => {},
});

// ============================================
// Provider
// ============================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(initialState);

  // tRPC mutations
  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation();
  const loginWithOAuthMutation = trpc.auth.loginWithOAuth.useMutation();

  // tRPC queries
  const statusQuery = trpc.auth.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ==========================================
  // Initialize auth state on mount
  // ==========================================

  useEffect(() => {
    if (statusQuery.isSuccess && statusQuery.data) {
      const data = statusQuery.data;
      if (data.authenticated && 'user' in data && data.user) {
        setState((prev) => ({
          ...prev,
          user: data.user as AuthUser,
          isAuthenticated: true,
          isLoading: false,
          session:
            'expiresAt' in data && data.expiresAt
              ? {
                  accessToken: '', // Not exposed in status
                  expiresAt: new Date(data.expiresAt),
                }
              : null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }));
      }
    } else if (statusQuery.isError) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [statusQuery.isSuccess, statusQuery.isError, statusQuery.data]);

  // ==========================================
  // Auth Methods
  // ==========================================

  /**
   * Login with email and password
   */
  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean = false): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await loginMutation.mutateAsync({
          email,
          password,
          rememberMe,
        });

        if (result.requiresMfa && result.mfaChallengeId) {
          // MFA required
          setState((prev) => ({
            ...prev,
            isLoading: false,
            mfa: {
              required: true,
              challengeId: result.mfaChallengeId!,
              methods: (result.mfaMethods || ['totp']) as MfaState['methods'],
            },
          }));
          return false;
        }

        if (result.success && result.user && result.session) {
          // Login successful
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
            mfa: initialMfaState,
          }));

          // Store token in localStorage for persistence
          // SECURITY NOTE: localStorage is vulnerable to XSS attacks.
          // For enhanced security, consider HttpOnly cookies via Supabase Auth.
          // Trade-off: localStorage enables SPA auth without server-side sessions.
          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', result.session.accessToken);
          }

          return true;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Login failed',
        }));
        return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return false;
      }
    },
    [loginMutation]
  );

  /**
   * Login with OAuth provider
   */
  const loginWithOAuth = useCallback(
    async (provider: 'google' | 'azure'): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await loginWithOAuthMutation.mutateAsync({
          provider,
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        });

        if (result.url) {
          // Redirect to OAuth provider
          window.location.href = result.url;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OAuth login failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
      }
    },
    [loginWithOAuthMutation]
  );

  /**
   * Verify MFA code
   */
  const verifyMfa = useCallback(
    async (code: string, method: 'totp' | 'sms' | 'email' | 'backup'): Promise<boolean> => {
      if (!state.mfa.challengeId) {
        setState((prev) => ({ ...prev, error: 'No MFA challenge pending' }));
        return false;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await verifyMfaMutation.mutateAsync({
          challengeId: state.mfa.challengeId,
          code,
          method,
        });

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
            mfa: initialMfaState,
          }));

          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', result.session.accessToken);
          }

          return true;
        }

        return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'MFA verification failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return false;
      }
    },
    [state.mfa.challengeId, verifyMfaMutation]
  );

  /**
   * Logout
   *
   * Enhanced logout with comprehensive cleanup (PG-018):
   * 1. Clear all client-side tokens
   * 2. Broadcast logout to other tabs
   * 3. Clear React state
   * 4. Redirect to login
   */
  const logout = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Import and run comprehensive cleanup (PG-018)
      if (typeof window !== 'undefined') {
        try {
          const { cleanupSession } = await import('@/lib/shared/session-cleanup');
          const { authBroadcast } = await import('@/lib/broadcast');

          // Clear all client-side tokens and data
          await cleanupSession({
            clearLocalStorage: true,
            clearSessionStorage: true,
            clearCookies: true,
            clearIndexedDB: true,
            broadcastLogout: false, // We handle broadcast separately
            preservePreferences: true,
          });

          // Broadcast logout to other tabs
          if (authBroadcast) {
            authBroadcast.broadcast('LOGOUT_EVENT');
          }
        } catch (cleanupError) {
          console.error('Session cleanup error:', cleanupError);
          // Fallback: at least clear accessToken
          localStorage.removeItem('accessToken');
        }
      }

      // Clear state regardless of API result
      setState({
        ...initialState,
        isLoading: false,
      });

      // Redirect to login
      router.push('/login?logged_out=true');
    }
  }, [logoutMutation, router]);

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      await statusQuery.refetch();
    } catch (error) {
      console.error('Session refresh error:', error);
    }
  }, [statusQuery]);

  /**
   * Clear error
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Set MFA required state (for external use)
   */
  const setMfaRequired = useCallback(
    (challengeId: string, methods: string[]): void => {
      setState((prev) => ({
        ...prev,
        mfa: {
          required: true,
          challengeId,
          methods: methods as MfaState['methods'],
        },
      }));
    },
    []
  );

  // ==========================================
  // Context Value
  // ==========================================

  const contextValue: AuthContextType = {
    ...state,
    login,
    loginWithOAuth,
    verifyMfa,
    logout,
    refreshSession,
    clearError,
    setMfaRequired,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

/**
 * Use auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Require authentication - redirects to login if not authenticated
 */
export function useRequireAuth(): AuthContextType {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  return auth;
}

/**
 * Redirect if authenticated - for login/signup pages
 */
export function useRedirectIfAuthenticated(redirectTo: string = '/dashboard'): AuthContextType {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      router.push(redirectTo);
    }
  }, [auth.isLoading, auth.isAuthenticated, router, redirectTo]);

  return auth;
}
