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
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '../supabase-browser';

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
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(initialState);

  // tRPC mutations
  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation();
  // Note: loginWithOAuth uses Supabase client directly, not tRPC

  // Check if we just logged out (prevents redirect loop)
  const isLoggedOutPage = typeof window !== 'undefined' &&
    window.location.search.includes('logged_out=true');

  // tRPC queries - skip fetching if we just logged out
  const statusQuery = trpc.auth.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !isLoggedOutPage, // Don't fetch if we just logged out
  });

  // ==========================================
  // Initialize auth state on mount
  // ==========================================

  useEffect(() => {
    // Debug: Log token status on mount
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      console.log('[AuthContext] Token in localStorage:', token ? `${token.substring(0, 20)}...` : 'null');

      // Sync token from localStorage to cookie for proxy access
      if (token) {
        import('@/lib/shared/session-cleanup').then(({ syncTokenToCookie }) => {
          syncTokenToCookie(token);
        });
      }
    }

    // If we just logged out, immediately set as not authenticated
    if (isLoggedOutPage) {
      console.log('[AuthContext] Logged out page detected, setting unauthenticated');
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }));
      return;
    }

    // IFC-007: Handle all query states to prevent stuck loading spinner
    // Wait for query to finish (not pending/fetching)
    if (statusQuery.isPending || statusQuery.isFetching) {
      console.log('[AuthContext] Query still pending/fetching...');
      return;
    }

    console.log('[AuthContext] Query completed:', {
      isSuccess: statusQuery.isSuccess,
      isError: statusQuery.isError,
      data: statusQuery.data,
      error: statusQuery.error,
    });

    if (statusQuery.isSuccess && statusQuery.data) {
      const data = statusQuery.data;
      if (data.authenticated && 'user' in data && data.user) {
        console.log('[AuthContext] User authenticated:', data.user);
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
        // Not authenticated - user logged out or no valid token
        console.log('[AuthContext] Not authenticated - data:', data);
        setState((prev) => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }));
      }
    } else if (statusQuery.isError) {
      // Query failed - treat as not authenticated
      console.error('[AuthContext] Query error:', statusQuery.error);
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }));
    }
  }, [statusQuery.isPending, statusQuery.isFetching, statusQuery.isSuccess, statusQuery.isError, statusQuery.data, isLoggedOutPage]);

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
            // Sync to cookie for middleware access
            const { syncTokenToCookie } = await import('@/lib/shared/session-cleanup');
            syncTokenToCookie(result.session.accessToken);
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
   * Uses the Supabase browser client directly for proper session handling
   */
  const loginWithOAuth = useCallback(
    async (provider: 'google' | 'azure'): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          throw new Error('Failed to initialize authentication client');
        }

        const redirectTo = typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined;

        // Map our provider names to Supabase provider names
        const supabaseProvider = provider === 'azure' ? 'azure' : 'google';

        console.log('[OAuth] Initiating login with provider:', supabaseProvider, 'redirectTo:', redirectTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: supabaseProvider,
          options: {
            redirectTo,
          },
        });

        console.log('[OAuth] Result:', { url: data?.url ? 'received' : 'null', error: error?.message });

        if (error) {
          throw error;
        }

        if (data?.url) {
          // Redirect to OAuth provider
          console.log('[OAuth] Redirecting to:', data.url);
          window.location.href = data.url;
        } else {
          console.error('[OAuth] No URL returned from Supabase');
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'OAuth provider not configured. Please contact support.',
          }));
        }
      } catch (error) {
        console.error('[OAuth] Error:', error);
        const message = error instanceof Error ? error.message : 'OAuth login failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
      }
    },
    []
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
            // Sync to cookie for middleware access
            const { syncTokenToCookie } = await import('@/lib/shared/session-cleanup');
            syncTokenToCookie(result.session.accessToken);
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
   * 2. Invalidate React Query cache
   * 3. Broadcast logout to other tabs
   * 4. Clear React state
   * 5. Redirect to login
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
          const { cleanupSession, clearTokenCookie } = await import('@/lib/shared/session-cleanup');
          const { authBroadcast } = await import('@/lib/broadcast');

          // Clear access token cookie first (for middleware)
          clearTokenCookie();

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
          document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
      }

      // Clear React Query cache to prevent stale auth data
      queryClient.removeQueries({ queryKey: [['auth', 'getStatus']] });
      queryClient.clear();

      // Clear state regardless of API result
      setState({
        ...initialState,
        isLoading: false,
      });

      // Redirect to login with flag to prevent redirect loop
      router.push('/login?logged_out=true');
    }
  }, [logoutMutation, router, queryClient]);

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
 *
 * Returns auth state with isLoading=true until authentication is confirmed.
 * Components using this hook should render a loading state while isLoading is true.
 */
export function useRequireAuth(): AuthContextType {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Check if there's a token in localStorage - if so, wait for auth to complete
    const hasLocalToken = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');

    console.log('[useRequireAuth] Checking auth:', {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      user: auth.user?.email,
      hasLocalToken,
    });

    // Don't redirect if:
    // 1. Still loading, OR
    // 2. Already authenticated, OR
    // 3. Has a local token (wait for auth query to validate it)
    if (auth.isLoading) {
      console.log('[useRequireAuth] Still loading, waiting...');
      return;
    }

    if (auth.isAuthenticated) {
      console.log('[useRequireAuth] User is authenticated, no redirect needed');
      return;
    }

    // Only redirect if truly not authenticated AND no local token
    if (!auth.isAuthenticated && !hasLocalToken) {
      console.log('[useRequireAuth] Not authenticated and no local token, redirecting to login...');
      router.replace('/login');
    } else if (!auth.isAuthenticated && hasLocalToken) {
      // Has token but not authenticated - token might be invalid or expired
      // Check if there's an error (invalid token)
      if (auth.error) {
        console.log('[useRequireAuth] Auth error with local token, clearing token and redirecting:', auth.error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        router.replace('/login');
      } else {
        console.log('[useRequireAuth] Has local token but not authenticated yet, waiting for validation...');
      }
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.user, auth.error, router]);

  // Return auth with isLoading=true if not yet authenticated
  // This ensures components don't render content until auth is confirmed
  const hasLocalToken = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');
  return {
    ...auth,
    // Keep isLoading true until we confirm authentication (or have no token to validate)
    isLoading: auth.isLoading || (hasLocalToken && !auth.isAuthenticated),
  };
}

/**
 * Redirect if authenticated - for login/signup pages
 *
 * Won't redirect if the user just logged out (has logged_out=true query param)
 */
export function useRedirectIfAuthenticated(redirectTo: string = '/dashboard'): AuthContextType {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user just logged out - don't redirect them back
  const justLoggedOut = searchParams?.get('logged_out') === 'true';

  // Check if OAuth login just succeeded (fallback mechanism)
  const oauthLoginSuccess = typeof window !== 'undefined'
    ? sessionStorage.getItem('oauth_login_success')
    : null;

  // Debug: Log all search params
  console.log('[useRedirectIfAuthenticated] Current state:', {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    justLoggedOut,
    oauthLoginSuccess: !!oauthLoginSuccess,
    redirectTo,
    allParams: searchParams?.toString() || 'none',
  });

  useEffect(() => {
    console.log('[useRedirectIfAuthenticated] useEffect triggered:', {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      justLoggedOut,
      oauthLoginSuccess: !!oauthLoginSuccess,
    });

    // Don't redirect if user just logged out
    if (justLoggedOut) {
      console.log('[useRedirectIfAuthenticated] User just logged out, not redirecting');
      return;
    }

    // If OAuth login just succeeded and we have a token, redirect immediately
    // This is a fallback in case auth state hasn't updated yet
    if (oauthLoginSuccess) {
      const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');
      console.log('[useRedirectIfAuthenticated] OAuth login success flag found, hasToken:', hasToken);

      if (hasToken) {
        // Clear the flag
        sessionStorage.removeItem('oauth_login_success');
        console.log('[useRedirectIfAuthenticated] Redirecting due to OAuth success flag');
        router.replace(redirectTo);
        return;
      }
    }

    if (!auth.isLoading && auth.isAuthenticated) {
      console.log('[useRedirectIfAuthenticated] User is authenticated, redirecting to:', redirectTo);
      // Use replace instead of push to avoid adding to history
      router.replace(redirectTo);
    } else {
      console.log('[useRedirectIfAuthenticated] NOT redirecting:', {
        reason: auth.isLoading ? 'still loading' : 'not authenticated',
      });
    }
  }, [auth.isLoading, auth.isAuthenticated, router, redirectTo, justLoggedOut, oauthLoginSuccess]);

  return auth;
}
