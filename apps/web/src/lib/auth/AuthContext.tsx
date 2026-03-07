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
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '../supabase-browser';
import type { OAuthProvider } from '@intelliflow/domain';
import { getSupabaseProviderName } from './sso-handler';

export type AuthMfaMethod = 'totp' | 'sms' | 'email' | 'backup';

// ============================================
// Token Refresh Utilities
// ============================================

/**
 * Decode JWT token payload without verifying signature
 */
function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
  } catch {
    return null;
  }
}

/**
 * Check if token needs refresh (expires within threshold)
 * Default threshold: 5 minutes before expiry
 */
function _tokenNeedsRefresh(token: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true; // If we can't read expiry, assume needs refresh

  const expiryTime = payload.exp * 1000;
  const now = Date.now();
  return now >= expiryTime - thresholdMs;
}

/**
 * Get token expiry time in milliseconds
 */
function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

// ============================================
// Types
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface MfaState {
  required: boolean;
  challengeId: string | null;
  methods: (AuthMfaMethod)[];
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
  loginWithOAuth: (provider: OAuthProvider) => Promise<void>;
  loginWithSso: (providerId: string) => Promise<void>;
  verifyMfa: (code: string, method: AuthMfaMethod) => Promise<boolean>;
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
  loginWithSso: async () => {},
  verifyMfa: async () => false,
  logout: async () => {},
  refreshSession: async () => {},
  clearError: () => {},
  setMfaRequired: () => {},
});

// ============================================
// Provider
// ============================================

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(initialState);

  // tRPC mutations
  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation();
  // Note: loginWithOAuth uses Supabase client directly, not tRPC

  // Check if we just logged out (prevents redirect loop)
  const isLoggedOutPage =
    typeof globalThis.window !== 'undefined' && globalThis.location.search.includes('logged_out=true');

  // tRPC queries - skip fetching if we just logged out
  const statusQuery = trpc.auth.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !isLoggedOutPage, // Don't fetch if we just logged out
  });

  // tRPC mutation for token refresh
  const _refreshTokenMutation = trpc.auth.refreshSession.useMutation();

  // Track refresh timer
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  /**
   * Automatic Token Refresh Effect
   *
   * Sets up Supabase session sync and automatic token refresh.
   * This ensures users don't get logged out while actively using the app.
   */
  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;
    if (isLoggedOutPage) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Sync stored tokens to Supabase so it can auto-refresh
    const syncTokensToSupabase = async () => {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (accessToken && refreshToken) {
        console.log('[AuthContext] Syncing tokens to Supabase for auto-refresh...');
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.warn('[AuthContext] Failed to sync session to Supabase:', error.message);
          } else if (data.session) {
            console.log('[AuthContext] Session synced to Supabase successfully');

            // Update stored tokens if Supabase returned new ones
            if (data.session.access_token !== accessToken) {
              console.log('[AuthContext] Supabase returned refreshed tokens, updating storage...');
              localStorage.setItem('accessToken', data.session.access_token);
              if (data.session.refresh_token) {
                localStorage.setItem('refreshToken', data.session.refresh_token);
              }
              // Sync to cookie
              import('@/lib/shared/session-cleanup').then(({ syncTokenToCookie }) => {
                syncTokenToCookie(data.session!.access_token);
              });
            }
          }
        } catch (err) {
          console.error('[AuthContext] Error syncing session to Supabase:', err);
        }
      }
    };

    // Listen for Supabase auth state changes (including token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Supabase auth state change:', event);

      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[AuthContext] Token refreshed by Supabase, updating storage...');

        // Update stored tokens
        localStorage.setItem('accessToken', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('refreshToken', session.refresh_token);
        }

        // Sync to cookie
        import('@/lib/shared/session-cleanup').then(({ syncTokenToCookie }) => {
          syncTokenToCookie(session.access_token);
        });

        // Invalidate auth status query to pick up new token
        queryClient.invalidateQueries({ queryKey: [['auth', 'getStatus']] });
      } else if (event === 'SIGNED_OUT') {
        console.log('[AuthContext] Signed out via Supabase');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    });

    // Initial sync
    syncTokensToSupabase();

    // Also set up a backup timer-based refresh check
    const setupRefreshTimer = () => {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) return;

      const expiryMs = getTokenExpiryMs(accessToken);
      if (!expiryMs) return;

      // Calculate time until we should refresh (5 minutes before expiry)
      const refreshAtMs = expiryMs - 5 * 60 * 1000;
      const timeUntilRefresh = refreshAtMs - Date.now();

      if (timeUntilRefresh <= 0) {
        // Token already needs refresh
        console.log('[AuthContext] Token needs immediate refresh');
        return;
      }

      console.log(
        `[AuthContext] Scheduling token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`
      );

      // Clear existing timer
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      // Set timer to trigger Supabase refresh
      refreshTimerRef.current = setTimeout(() => {
        console.log('[AuthContext] Timer triggered, requesting token refresh...');
        supabase.auth.refreshSession();
      }, timeUntilRefresh);
    };

    setupRefreshTimer();

    return () => {
      subscription.unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [isLoggedOutPage, queryClient]);

  // ==========================================
  // Initialize auth state on mount
  // ==========================================

  useEffect(() => {
    // Debug: Log token status on mount
    if (typeof globalThis.window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      console.log(
        '[AuthContext] Token in localStorage:',
        token ? `${token.substring(0, 20)}...` : 'null'
      );

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
  }, [
    statusQuery.isPending,
    statusQuery.isFetching,
    statusQuery.isSuccess,
    statusQuery.isError,
    statusQuery.data,
    isLoggedOutPage,
  ]);

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
          if (typeof globalThis.window !== 'undefined') {
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
  const loginWithOAuth = useCallback(async (provider: Readonly<OAuthProvider>): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error('Failed to initialize authentication client');
      }

      // Generate CSRF nonce and embed in redirectTo for end-to-end verification
      const nonce = crypto.randomUUID();
      sessionStorage.setItem('intelliflow_oauth_nonce', nonce);

      const redirectTo =
        typeof globalThis.window === 'undefined'
          ? undefined
          : `${globalThis.location.origin}/auth/callback?nonce=${nonce}`;

      // Map our provider names to Supabase provider names (e.g., 'linkedin' → 'linkedin_oidc')
      const supabaseProvider = getSupabaseProviderName(provider);

      console.log(
        '[OAuth] Initiating login with provider:',
        supabaseProvider,
        'redirectTo:',
        redirectTo
      );

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider as 'google' | 'azure' | 'github' | 'linkedin_oidc',
        options: {
          redirectTo,
        },
      });

      console.log('[OAuth] Result:', {
        url: data?.url ? 'received' : 'null',
        error: error?.message,
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        // Redirect to OAuth provider
        console.log('[OAuth] Redirecting to:', data.url);
        globalThis.location.href = data.url;
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
  }, []);

  /**
   * Login with Enterprise SSO (SAML) provider
   * Uses Supabase signInWithSSO for SAML-based enterprise authentication
   */
  const loginWithSso = useCallback(async (providerId: string): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error('Failed to initialize authentication client');
      }

      // Generate CSRF nonce and embed in redirectTo for end-to-end verification
      const nonce = crypto.randomUUID();
      sessionStorage.setItem('intelliflow_oauth_nonce', nonce);

      const redirectTo =
        typeof globalThis.window === 'undefined'
          ? undefined
          : `${globalThis.location.origin}/auth/callback?nonce=${nonce}`;

      const { data, error } = await supabase.auth.signInWithSSO({
        providerId,
        options: { redirectTo },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        console.log('[SSO] Redirecting to SSO provider:', providerId);
        globalThis.location.href = data.url;
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'SSO provider not configured. Please contact your administrator.',
        }));
      }
    } catch (error) {
      console.error('[SSO] Error:', error);
      const message = error instanceof Error ? error.message : 'SSO login failed';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, []);

  /**
   * Verify MFA code
   */
  const verifyMfa = useCallback(
    async (code: string, method: AuthMfaMethod): Promise<boolean> => {
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

          if (typeof globalThis.window !== 'undefined') {
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
      if (typeof globalThis.window !== 'undefined') {
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
   * Refresh session - uses Supabase to refresh tokens
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    if (isRefreshingRef.current) {
      console.log('[AuthContext] Refresh already in progress, skipping...');
      return;
    }

    try {
      isRefreshingRef.current = true;
      console.log('[AuthContext] Manually refreshing session...');

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        console.error('[AuthContext] No Supabase client available');
        return;
      }

      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error('[AuthContext] Session refresh failed:', error.message);
        // If refresh fails, the token is likely invalid - logout
        await logout();
        return;
      }

      if (data.session) {
        console.log('[AuthContext] Session refreshed successfully');

        // Update stored tokens
        localStorage.setItem('accessToken', data.session.access_token);
        if (data.session.refresh_token) {
          localStorage.setItem('refreshToken', data.session.refresh_token);
        }

        // Sync to cookie
        const { syncTokenToCookie } = await import('@/lib/shared/session-cleanup');
        syncTokenToCookie(data.session.access_token);

        // Refetch auth status
        await statusQuery.refetch();
      }
    } catch (error) {
      console.error('[AuthContext] Session refresh error:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [statusQuery, logout]);

  /**
   * Clear error
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Set MFA required state (for external use)
   */
  const setMfaRequired = useCallback((challengeId: string, methods: string[]): void => {
    setState((prev) => ({
      ...prev,
      mfa: {
        required: true,
        challengeId,
        methods: methods as MfaState['methods'],
      },
    }));
  }, []);

  // ==========================================
  // Context Value
  // ==========================================

  const contextValue: AuthContextType = useMemo(() => ({
    ...state,
    login,
    loginWithOAuth,
    loginWithSso,
    verifyMfa,
    logout,
    refreshSession,
    clearError,
    setMfaRequired,
  }), [state, login, loginWithOAuth, loginWithSso, verifyMfa, logout, refreshSession, clearError, setMfaRequired]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
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

interface AuthRedirectFlags {
  hasLocalToken: boolean;
  isRecentRedirect: boolean | null;
  isRecentOAuthLogin: boolean;
  isOAuthFlow: boolean;
}

function readAuthRedirectFlags(hasOAuthParam: boolean): AuthRedirectFlags {
  const hasLocalToken = typeof globalThis.window !== 'undefined' && !!localStorage.getItem('accessToken');
  const lastRedirectTime =
    typeof globalThis.window === 'undefined' ? null : sessionStorage.getItem('auth_redirect_time');
  const isRecentRedirect = lastRedirectTime
    ? Date.now() - Number.parseInt(lastRedirectTime, 10) < 2000
    : null;
  const oauthLoginTime =
    typeof globalThis.window === 'undefined' ? null : sessionStorage.getItem('oauth_login_success');
  const isRecentOAuthLogin = !!(oauthLoginTime && Date.now() - Number.parseInt(oauthLoginTime, 10) < 10000);
  const isOAuthFlow = isRecentOAuthLogin || hasOAuthParam;
  return { hasLocalToken, isRecentRedirect, isRecentOAuthLogin, isOAuthFlow };
}

function clearAuthSession(): void {
  if (typeof globalThis.window === 'undefined') return;
  sessionStorage.removeItem('auth_redirect_time');
  sessionStorage.removeItem('oauth_login_success');
}

function cleanOAuthParam(): void {
  if (typeof globalThis.window === 'undefined') return;
  const url = new URL(globalThis.location.href);
  url.searchParams.delete('oauth');
  globalThis.history.replaceState({}, '', url.pathname + url.search);
}

function clearExpiredToken(): void {
  if (typeof globalThis.window !== 'undefined') localStorage.removeItem('accessToken');
}

function stampRedirectTime(hasRedirectedRef: React.RefObject<boolean>): void {
  hasRedirectedRef.current = true;
  if (typeof globalThis.window !== 'undefined') {
    sessionStorage.setItem('auth_redirect_time', Date.now().toString());
  }
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
  const searchParams = useSearchParams();
  const hasRedirectedRef = useRef(false);

  // Check for OAuth success parameter in URL (set by OAuth callback)
  const oauthParam = searchParams?.get('oauth');
  const hasOAuthParam = oauthParam === 'success';

  useEffect(() => {
    // Prevent redirect loops - only redirect once per component mount
    if (hasRedirectedRef.current) {
      return;
    }

    const { hasLocalToken, isRecentRedirect, isRecentOAuthLogin, isOAuthFlow } =
      readAuthRedirectFlags(hasOAuthParam);

    console.log('[useRequireAuth] Checking auth:', {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      user: auth.user?.email,
      hasLocalToken,
      isRecentRedirect,
      isRecentOAuthLogin,
      hasOAuthParam,
      isOAuthFlow,
      error: auth.error,
    });

    // Don't redirect if:
    // 1. Still loading, OR
    // 2. Already authenticated, OR
    // 3. Has a local token (wait for auth query to validate it), OR
    // 4. Recently redirected (prevent loops), OR
    // 5. OAuth flow in progress (wait for auth to settle)
    if (auth.isLoading) {
      console.log('[useRequireAuth] Still loading, waiting...');
      return;
    }

    if (auth.isAuthenticated) {
      console.log('[useRequireAuth] User is authenticated, no redirect needed');
      clearAuthSession();
      if (hasOAuthParam) cleanOAuthParam();
      return;
    }

    if (isRecentRedirect) {
      console.log('[useRequireAuth] Recent redirect detected, preventing loop...');
      return;
    }

    if (isOAuthFlow && hasLocalToken) {
      console.log('[useRequireAuth] OAuth flow detected with token, waiting for auth to complete...');
      return;
    }

    if (hasLocalToken && !auth.isAuthenticated && !auth.isLoading) {
      console.log('[useRequireAuth] Token present but auth failed; clearing token and redirecting to login');
      clearExpiredToken();
      clearAuthSession();
      stampRedirectTime(hasRedirectedRef);
      router.replace('/login');
      return;
    }

    console.log('[useRequireAuth] No token in localStorage, redirecting to login...');
    stampRedirectTime(hasRedirectedRef);
    router.replace('/login');
  }, [auth.isLoading, auth.isAuthenticated, auth.user, auth.error, router, hasOAuthParam]);

  // Check for recent OAuth login to extend loading state
  const hasLocalToken = typeof globalThis.window !== 'undefined' && !!localStorage.getItem('accessToken');
  const oauthLoginTime =
    typeof globalThis.window === 'undefined' ? null : sessionStorage.getItem('oauth_login_success');
  const isRecentOAuthLogin = !!(
    oauthLoginTime && Date.now() - Number.parseInt(oauthLoginTime, 10) < 10000
  );
  const isOAuthFlow = isRecentOAuthLogin || hasOAuthParam;

  // Return auth with isLoading=true if not yet authenticated
  // This ensures components don't render content until auth is confirmed
  return {
    ...auth,
    // Keep isLoading true until we confirm authentication (or have no token to validate)
    // Also keep loading during OAuth flow to prevent premature content render
    isLoading:
      auth.isLoading ||
      (hasLocalToken && !auth.isAuthenticated) ||
      (isOAuthFlow && !auth.isAuthenticated),
  };
}

/**
 * Redirect if authenticated - for login/signup pages
 *
 * Won't redirect if the user just logged out (has logged_out=true query param)
 */
export function useRedirectIfAuthenticated(redirectTo: string = '/dashboard'): AuthContextType {
  const auth = useAuth();
  const _router = useRouter();
  const searchParams = useSearchParams();

  // Check if user just logged out - don't redirect them back
  const justLoggedOut = searchParams?.get('logged_out') === 'true';

  // Check for redirect parameter in URL (e.g., /login?redirect=/dashboard)
  const urlRedirect = searchParams?.get('redirect');
  const finalRedirectTo = urlRedirect || redirectTo;

  // Track if we've already redirected to prevent loops
  const hasRedirectedRef = useRef(false);

  // Check for token in localStorage
  const hasLocalToken = typeof globalThis.window !== 'undefined' && !!localStorage.getItem('accessToken');

  // Check for recent OAuth login - if set, we know auth should be valid
  const oauthLoginTime =
    typeof globalThis.window === 'undefined' ? null : sessionStorage.getItem('oauth_login_success');
  const isRecentOAuthLogin = !!(
    oauthLoginTime && Date.now() - Number.parseInt(oauthLoginTime, 10) < 10000
  );

  // Debug: Log current state
  console.log('[useRedirectIfAuthenticated] Current state:', {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    justLoggedOut,
    hasLocalToken,
    isRecentOAuthLogin,
    urlRedirect,
    finalRedirectTo,
    hasRedirected: hasRedirectedRef.current,
  });

  useEffect(() => {
    // Prevent redirect loops - only redirect once per mount
    if (hasRedirectedRef.current) {
      console.log('[useRedirectIfAuthenticated] Already redirected, skipping');
      return;
    }

    // Don't redirect if user just logged out
    if (justLoggedOut) {
      console.log('[useRedirectIfAuthenticated] User just logged out, not redirecting');
      return;
    }

    // If there was a recent OAuth login and we have a token, redirect immediately
    // This handles the case where OAuth callback completed successfully
    if (isRecentOAuthLogin && hasLocalToken) {
      console.log(
        '[useRedirectIfAuthenticated] Recent OAuth login with token, using window.location to navigate to:',
        finalRedirectTo
      );
      hasRedirectedRef.current = true;
      // Use window.location.href because router.replace doesn't work reliably
      globalThis.location.href = finalRedirectTo;
      return;
    }

    // Wait for auth query to complete before making redirect decisions
    // This prevents race conditions where token exists but query hasn't validated it
    if (auth.isLoading) {
      console.log('[useRedirectIfAuthenticated] Auth still loading, waiting...');
      return;
    }

    // Only redirect if actually authenticated (token validated by query)
    if (auth.isAuthenticated) {
      console.log(
        '[useRedirectIfAuthenticated] Auth confirmed, using window.location to navigate to:',
        finalRedirectTo
      );
      hasRedirectedRef.current = true;
      // Use window.location.href because router.replace doesn't seem to work reliably
      globalThis.location.href = finalRedirectTo;
    }
  }, [
    auth.isLoading,
    auth.isAuthenticated,
    finalRedirectTo,
    justLoggedOut,
    hasLocalToken,
    isRecentOAuthLogin,
  ]);

  return auth;
}
